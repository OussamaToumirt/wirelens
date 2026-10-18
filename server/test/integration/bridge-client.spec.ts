import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import { expect } from 'chai';
import WebSocket, { WebSocketServer } from 'ws';

import {
    UiOperationBridge,
    HtkOperation,
    REQUEST_TIMEOUT_MS
} from '../../src/api/ui-operation-bridge';
import { socketRequest, requestTimeout } from '../../src/api/bridge-client';

const TEST_OPERATIONS: HtkOperation[] = [{
    name: 'proxy.get-config',
    description: 'Get the proxy configuration',
    category: 'proxy',
    tiers: ['free'],
    inputSchema: { type: 'object', properties: {} }
}];

// Connects a mock UI to the bridge, authenticates it and waits for readiness,
// exactly as the real UI does on startup.
async function connectMockUi(bridge: UiOperationBridge) {
    const wss = new WebSocketServer({ port: 0 });

    const pair = await new Promise<{ clientWs: WebSocket, wss: WebSocketServer }>((resolve) => {
        wss.on('connection', (serverSideWs) => bridge.setWebSocket(serverSideWs as any));
        wss.on('listening', () => {
            const { port } = wss.address() as { port: number };
            const clientWs = new WebSocket(`ws://127.0.0.1:${port}`);
            clientWs.on('open', () => resolve({ clientWs, wss }));
        });
    });

    const authResult = new Promise<void>((resolve) => {
        pair.clientWs.on('message', function handler(data) {
            if (JSON.parse(data.toString()).type !== 'auth-result') return;
            pair.clientWs.removeListener('message', handler);
            resolve();
        });
    });
    pair.clientWs.send(JSON.stringify({ type: 'auth', jwt: false }));
    await authResult;

    pair.clientWs.send(JSON.stringify({ type: 'operations', operations: TEST_OPERATIONS }));
    await new Promise<void>((resolve) => bridge.once('ready', resolve));

    return pair;
}

describe("Bridge client", function () {

    // The slow test below deliberately waits out the previous 2 second client timeout:
    this.timeout(10_000);

    let bridge: UiOperationBridge;
    let pair: { clientWs: WebSocket, wss: WebSocketServer };
    let socketDir: string;
    let socketPath: string;

    beforeEach(async () => {
        socketDir = fs.mkdtempSync(path.join(os.tmpdir(), 'htk-bridge-client-test-'));
        socketPath = path.join(socketDir, 'test.sock');

        bridge = new UiOperationBridge();
        await bridge.startApiServer(socketPath);
        pair = await connectMockUi(bridge);
    });

    afterEach(() => {
        if (pair.clientWs.readyState === WebSocket.OPEN) pair.clientWs.close();
        pair.wss.close();
        bridge.destroy();

        try { fs.rmSync(socketDir, { recursive: true, force: true }); } catch {}
    });

    it("should wait for slow operations, up to the bridge's own request timeout", async () => {
        const slowResult = { port: 8000, ip: '127.0.0.1' };

        // Serializing a large body in the UI can easily take longer than a moment:
        pair.clientWs.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type !== 'request') return;
            setTimeout(() => {
                pair.clientWs.send(JSON.stringify({
                    type: 'response',
                    id: msg.id,
                    result: slowResult
                }));
            }, 3000);
        });

        const result = await socketRequest(socketPath, 'POST', '/api/execute', {
            name: 'proxy.get-config',
            args: {}
        });

        expect(result).to.deep.equal(slowResult);
    });

    it("should not give up before the bridge itself would", () => {
        // The bridge allows each operation REQUEST_TIMEOUT_MS to complete. If the
        // client gives up first, that budget is unreachable and the bridge's own
        // error message never gets to the user:
        expect(requestTimeout('/api/execute')).to.be.greaterThan(REQUEST_TIMEOUT_MS);
    });

    it("should still give up quickly while looking for a server", () => {
        // Discovery tries each candidate socket path in turn, so a dead path has
        // to fail fast rather than hold up the ones behind it:
        expect(requestTimeout('/api/status')).to.be.lessThan(REQUEST_TIMEOUT_MS);
        expect(requestTimeout('/api/operations')).to.be.lessThan(REQUEST_TIMEOUT_MS);
    });
});
