// Assembles a runnable WireLens server package (Windows x64) from the local server
// fork, in the same layout the desktop app expects: desktop/httptoolkit-server/.
//
// Prerequisite: in server/, `npm run build:src && npm run build:manifest && npm run build:bundle`.
//
// Usage: node scripts/stage-server.mjs [path-to-wirelens.apk]

import * as path from 'path';
import { promises as fs, existsSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SERVER = path.join(ROOT, 'server');
const OUT = path.join(ROOT, 'desktop', 'httptoolkit-server');

// Native modules compiled upstream (Windows x64, N-API). npm 12 blocks their install
// scripts and there's no MSVC toolchain here, so binaries are copied from the server
// fork's node_modules (populated from matching upstream builds).
const NATIVE_BINARIES = [
    'registry-js/build/Release/registry.node',
    'node-datachannel/build/Release/node_datachannel.node'
];

const copy = (from, to) => fs.cp(from, to, { recursive: true });

async function main() {
    const apkPath = process.argv[2];
    const pJson = JSON.parse(await fs.readFile(path.join(SERVER, 'package.json'), 'utf8'));
    const lock = JSON.parse(await fs.readFile(path.join(SERVER, 'package-lock.json'), 'utf8'));

    for (const f of ['lib/index.js', 'bundle/index.js', 'oclif.manifest.json']) {
        if (!existsSync(path.join(SERVER, f))) throw new Error(`Missing ${f} - build the server first`);
    }

    await fs.rm(OUT, { recursive: true, force: true });
    await fs.mkdir(path.join(OUT, 'bin'), { recursive: true });

    for (const dir of ['lib', 'bundle', 'overrides', 'nss']) {
        await copy(path.join(SERVER, dir), path.join(OUT, dir));
    }
    await fs.copyFile(path.join(SERVER, 'oclif.manifest.json'), path.join(OUT, 'oclif.manifest.json'));
    await fs.copyFile(path.join(SERVER, 'LICENSE'), path.join(OUT, 'LICENSE'));

    // Launcher: unlike upstream, never redirect to an auto-updated server install.
    await fs.copyFile(path.join(SERVER, 'bin', 'run'), path.join(OUT, 'bin', 'run'));
    await fs.copyFile(process.execPath, path.join(OUT, 'bin', 'node.exe'));
    await fs.writeFile(path.join(OUT, 'bin', 'httptoolkit-server.cmd'), [
        '@echo off',
        'setlocal enableextensions',
        'if not defined HTTPTOOLKIT_SERVER_BINPATH set HTTPTOOLKIT_SERVER_BINPATH="%~dp0httptoolkit-server.cmd"',
        '"%~dp0node.exe" "%~dp0run" %*',
        ''
    ].join('\r\n'));

    // Only unbundleable deps ship as node_modules. The update plugin is dropped entirely,
    // so the server can't pull upstream releases (it has an autoupdate startup hook).
    const deps = pJson.oclif.dependenciesToPackage
        .filter((dep) => dep !== '@oclif/plugin-update' && dep !== 'tls-impersonate');
    const stagedPackage = {
        name: 'wirelens-server',
        version: pJson.version,
        description: 'WireLens local server (fork of httptoolkit-server)',
        license: pJson.license,
        main: 'lib/index.js',
        bin: pJson.bin,
        dependencies: Object.fromEntries(deps.map((dep) =>
            [dep, lock.packages[`node_modules/${dep}`].version]
        )),
        oclif: {
            bin: pJson.oclif.bin,
            commands: pJson.oclif.commands,
            plugins: []
        }
    };
    await fs.writeFile(path.join(OUT, 'package.json'), JSON.stringify(stagedPackage, null, 2));

    execSync('npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock', {
        cwd: OUT,
        stdio: 'inherit'
    });

    for (const binary of NATIVE_BINARIES) {
        const target = path.join(OUT, 'node_modules', binary);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(path.join(SERVER, 'node_modules', binary), target);
    }

    if (apkPath) {
        await fs.mkdir(path.join(OUT, 'bundled-apk'), { recursive: true });
        await fs.copyFile(apkPath, path.join(OUT, 'bundled-apk', 'wirelens.apk'));
        console.log('Bundled Android APK from', apkPath);
    } else {
        console.warn('No APK path given: Android ADB setup will fail until one is bundled.');
    }

    console.log('Server staged at', OUT);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
