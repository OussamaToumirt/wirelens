import * as http from 'http';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { getDeferred } from '@httptoolkit/util';

import { getSocketPath, REQUEST_TIMEOUT_MS } from './ui-operation-bridge';

// Discovery requests are answered from memory, so a dead socket path has to fail
// fast to leave time for the paths behind it:
const DISCOVERY_TIMEOUT_MS = 2000;

// Executing an operation means waiting for the UI, which the bridge itself allows
// REQUEST_TIMEOUT_MS to answer. Staying just above that keeps that budget usable
// and lets the bridge's own error - which names the operation - reach the caller,
// instead of failing here first with a bare ETIMEDOUT.
const EXECUTE_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 5000;

export function requestTimeout(urlPath: string): number {
    return urlPath === '/api/execute'
        ? EXECUTE_TIMEOUT_MS
        : DISCOVERY_TIMEOUT_MS;
}

const execFileAsync = promisify(execFile);
let darwinTempDirPromise: Promise<string | undefined> | undefined;

function getDarwinTempDir(): Promise<string | undefined> {
    if (!darwinTempDirPromise) {
        darwinTempDirPromise = execFileAsync(
            '/usr/bin/getconf',
            ['DARWIN_USER_TEMP_DIR'],
            { encoding: 'utf8', timeout: 1000 }
        )
            .then(({ stdout }) => stdout.trim() || undefined)
            .catch(() => undefined);
    }

    return darwinTempDirPromise;
}

export async function apiRequest(
    method: 'GET' | 'POST',
    urlPath: string,
    body?: any
): Promise<any> {
    const socketPaths = [await getSocketPath()];
    const socketAttempts: Array<{ socketPath: string; error: any }> = [];

    if (
        process.platform === 'linux' &&
        !process.env.XDG_RUNTIME_DIR &&
        process.getuid
    ) {
        socketPaths.push(path.join(
            '/run/user',
            `${process.getuid()}`,
            'wirelens-ctl.sock'
        ));
    } else if (process.platform === 'darwin') {
        const darwinTempDir = await getDarwinTempDir();
        const darwinSocketPath = darwinTempDir
            ? path.join(darwinTempDir, 'wirelens-ctl.sock')
            : undefined;

        if (darwinSocketPath && !socketPaths.includes(darwinSocketPath)) {
            socketPaths.push(darwinSocketPath);
        }
    }

    for (const socketPath of socketPaths) {
        try {
            return await socketRequest(socketPath, method, urlPath, body);
        } catch (err: any) {
            err.socketPath = socketPath;

            // Any HTTP response identifies the active server, including errors
            // from older or temporarily mismatched server versions.
            if (err.statusCode !== undefined) throw err;

            socketAttempts.push({ socketPath, error: err });
        }
    }

    throw createBridgeConnectionError(socketAttempts);
}

export function socketRequest(
    socketPath: string,
    method: 'GET' | 'POST',
    urlPath: string,
    body?: any
): Promise<any> {
    const result = getDeferred<any>();
    const req = http.request({
        method,
        path: urlPath,
        socketPath,
        headers: {
            'Content-Type': 'application/json'
        },
        timeout: requestTimeout(urlPath)
    }, (res) => {
        const chunks: Buffer[] = [];
        res.on('error', (err: any) => {
            err.statusCode = res.statusCode ?? 500;
            result.reject(err);
        });
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            const statusCode = res.statusCode ?? 500;

            let parsedBody: any;
            try {
                parsedBody = JSON.parse(raw);
            } catch {
                const error: any = new Error(
                    statusCode >= 400
                        ? `HTTP ${statusCode}: ${raw}`
                        : `Unparseable response: ${raw}`
                );
                error.statusCode = statusCode;
                error.body = raw;
                result.reject(error);
                return;
            }

            if (statusCode >= 400) {
                const message = parsedBody?.message
                    || (
                        typeof parsedBody?.error === 'string'
                            ? parsedBody.error
                            : parsedBody?.error?.message
                    )
                    || `HTTP ${statusCode}`;
                const error: any = new Error(message);
                error.statusCode = statusCode;
                error.body = parsedBody;
                result.reject(error);
                return;
            }

            result.resolve(parsedBody);
        });
    });

    req.on('timeout', () => {
        const error: any = new Error('Request timed out');
        error.code = 'ETIMEDOUT';
        req.destroy(error);
    });

    req.on('error', (err) => result.reject(err));

    if (body !== undefined) {
        req.write(JSON.stringify(body));
    }
    req.end();

    return result;
}

function createBridgeConnectionError(
    socketAttempts: Array<{ socketPath: string; error: any }>
): Error {
    const attemptsDescription = socketAttempts.map(({ socketPath, error }) => {
        const detail = [error?.code, error?.message].filter(Boolean).join(': ');
        return `${socketPath} (${detail || String(error)})`;
    });
    const error: any = new Error(
        'Cannot connect to the WireLens control socket. Tried: ' +
        attemptsDescription.join(', ')
    );
    const representativeAttempt =
        socketAttempts.find(({ error }) =>
            error?.code === 'EPERM' || error?.code === 'EACCES'
        ) ?? socketAttempts[socketAttempts.length - 1];

    error.code = representativeAttempt?.error?.code;
    error.socketAttempts = socketAttempts;
    return error;
}
