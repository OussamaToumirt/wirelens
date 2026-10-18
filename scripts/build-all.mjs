// Builds every WireLens component and stages it into the desktop app.
//
// Usage (from the wirelens root):
//   node scripts/build-all.mjs              build server + UI, stage both into desktop/
//   node scripts/build-all.mjs --package    ...then build the Windows installer & zip
//
// Set WIRELENS_APK to a built Android APK path to bundle it for ADB interception
// (defaults to android/app/build/outputs/apk/release/app-release.apk if present).

import * as path from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const run = (cmd, cwd) => {
    console.log(`\n> ${cmd}  (in ${path.relative(ROOT, cwd) || '.'})`);
    execSync(cmd, { cwd, stdio: 'inherit' });
};

const server = path.join(ROOT, 'server');
run('npm run build:src', server);
run('npm run build:manifest', server);
run('npm run build:bundle', server);

const defaultApk = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const apk = process.env.WIRELENS_APK || (existsSync(defaultApk) ? defaultApk : '');
run(`node scripts/stage-server.mjs ${apk ? `"${apk}"` : ''}`, ROOT);

run('npm run build:windows', path.join(ROOT, 'ui'));
run('node scripts/stage-ui.mjs', ROOT);

const desktop = path.join(ROOT, 'desktop');
run('npm run build:src', desktop);

if (process.argv.includes('--package')) {
    run('npx electron-builder build --win --config ./build-setup/electron-builder.config.cjs', desktop);
    console.log('\nInstaller & zip written to desktop/dist/');
} else {
    console.log('\nStaged. Run `npx electron .` in desktop/ to start WireLens.');
}
