import * as path from 'path';
import { promises as fs } from 'fs';

// WireLens bundles a locally built fork of the server, rather than downloading upstream
// HTTP Toolkit server releases. This just checks that it (and the UI) have been staged,
// by ../scripts/build-all.mjs (or scripts/stage-server.mjs + scripts/stage-ui.mjs).

const canAccess = (p: string) => fs.access(p).then(() => true).catch(() => false);

const desktopDir = path.join(import.meta.dirname, '..');

async function checkStaged() {
    const required = [
        path.join(desktopDir, 'httptoolkit-server', 'bin', 'httptoolkit-server.cmd'),
        path.join(desktopDir, 'httptoolkit-server', 'bundle', 'index.js'),
        path.join(desktopDir, 'ui', 'index.html')
    ];

    const missing = [];
    for (const file of required) {
        if (!(await canAccess(file))) missing.push(path.relative(desktopDir, file));
    }

    if (missing.length) {
        throw new Error(
            `Missing staged components: ${missing.join(', ')}.\n` +
            'Run `node scripts/build-all.mjs` from the wirelens root first.'
        );
    }

    console.log('Staged server & UI found.');
}

checkStaged().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
