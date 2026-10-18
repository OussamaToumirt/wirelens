import * as path from 'path';
import * as stream from 'stream';

import * as fs from '../../util/fs';
import { HtkConfig } from '../../config';
import { APP_ROOT } from '../../constants';

// WireLens ships its Android app inside the desktop bundle, rather than downloading it
// from a remote release feed. WIRELENS_APK_PATH can override this, e.g. for development.
const BUNDLED_APK_PATH = path.join(APP_ROOT, 'bundled-apk', 'wirelens.apk');

function getApkPath() {
    return process.env.WIRELENS_APK_PATH || BUNDLED_APK_PATH;
}

export async function clearAllApks(_config: HtkConfig) {
    // Nothing is cached locally - the bundled APK is read directly each time.
}

export async function streamLatestApk(_config: HtkConfig): Promise<stream.Readable> {
    const apkPath = getApkPath();

    if (!(await fs.canAccess(apkPath))) {
        throw new Error(`WireLens Android APK not found at ${apkPath}`);
    }

    console.log(`Streaming bundled APK from ${apkPath}`);
    return fs.createReadStream(apkPath);
}
