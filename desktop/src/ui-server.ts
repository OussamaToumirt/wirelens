import * as http from 'http';
import * as path from 'path';
import { promises as fs } from 'fs';

// WireLens serves its web UI locally from the desktop app, rather than loading a hosted
// copy. This is a minimal static file server bound to loopback only.

const MIME_TYPES: { [ext: string]: string } = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.txt': 'text/plain; charset=utf-8',
    '.webmanifest': 'application/manifest+json'
};

// Files that must always be revalidated, so UI updates and the service worker apply promptly.
const NO_CACHE_FILES = new Set(['index.html', 'ui-update-worker.js']);

async function resolveFile(rootDir: string, urlPath: string): Promise<string> {
    let decoded: string;
    try {
        decoded = decodeURIComponent(urlPath);
    } catch {
        decoded = '/';
    }

    const candidate = path.resolve(rootDir, '.' + path.posix.normalize(decoded));
    const insideRoot = candidate === rootDir || candidate.startsWith(rootDir + path.sep);

    if (insideRoot) {
        const stat = await fs.stat(candidate).catch(() => undefined);
        if (stat?.isFile()) return candidate;
    }

    // Client-side routes (e.g. /intercept, /view) all serve the single-page app:
    return path.join(rootDir, 'index.html');
}

export function startUiServer(uiDir: string, port: number): Promise<http.Server> {
    const rootDir = path.resolve(uiDir);

    const server = http.createServer(async (req, res) => {
        try {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.writeHead(405, { 'Allow': 'GET, HEAD' });
                res.end();
                return;
            }

            const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;
            const filePath = await resolveFile(rootDir, urlPath);
            const content = await fs.readFile(filePath);
            const fileName = path.basename(filePath);

            res.writeHead(200, {
                'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
                'Content-Length': content.length,
                'Cache-Control': NO_CACHE_FILES.has(fileName) ? 'no-cache' : 'public, max-age=31536000',
                'X-Content-Type-Options': 'nosniff'
            });
            res.end(req.method === 'HEAD' ? undefined : content);
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`WireLens UI server error: ${error?.message ?? error}`);
        }
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}
