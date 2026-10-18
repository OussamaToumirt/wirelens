// WireLens builds are unsigned: this just re-exposes the config from package.json,
// making sure no signing or notarization is attempted.

const packageJson = require('../package.json');

const config = packageJson.build;

config.mac.forceCodeSigning = false;
config.mac.notarize = false;
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

// Native deps (registry-js) ship as prebuilt N-API binaries that work in Electron
// unchanged, so skip electron-builder's from-source rebuild (needs a C++ toolchain).
config.npmRebuild = false;

module.exports = config;
