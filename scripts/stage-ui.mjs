// Copies the built web UI (ui/dist) into desktop/ui, where the desktop app serves it from.
// Prerequisite: in ui/, `npm run build` (or build:windows).

import * as path from 'path';
import { promises as fs, existsSync } from 'fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'ui', 'dist');
const OUT = path.join(ROOT, 'desktop', 'ui');

// Build reports & source maps aren't needed at runtime.
const SKIP = (file) => file === 'report.html' || file.endsWith('.tsbuildinfo') || file.endsWith('.map');

if (!existsSync(path.join(DIST, 'index.html'))) {
    console.error('ui/dist/index.html not found - build the UI first');
    process.exit(1);
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.cp(DIST, OUT, {
    recursive: true,
    filter: (src) => !SKIP(path.basename(src))
});

console.log('UI staged at', OUT);

// The AGPL attribution notice ships inside the installed app too:
await fs.copyFile(path.join(ROOT, 'NOTICE.md'), path.join(ROOT, 'desktop', 'NOTICE.md'));
