const path = require('path');

const APP_NAME = 'FTP File Synchronizer';
const APP_ID = 'com.edenilson.ftpfilesynchronizer';
const EXECUTABLE_NAME = 'ftp-file-synchronizer';
const LINUX_DESKTOP_NAME = `${EXECUTABLE_NAME}.desktop`;

function configureApplicationIdentity(app) {
    app.setName(APP_NAME);
    if (process.platform === 'linux' && typeof app.setDesktopName === 'function') {
        app.setDesktopName(LINUX_DESKTOP_NAME);
    } else if (process.platform === 'win32') {
        app.setAppUserModelId(APP_ID);
    }
    if (process.platform === 'linux') app.commandLine.appendSwitch('class', EXECUTABLE_NAME);
}

function getRuntimeAssetPath(app, fileName) {
    const projectRoot = path.resolve(__dirname, '../../..');
    return path.join(app.isPackaged ? process.resourcesPath : projectRoot, fileName);
}

module.exports = {
    APP_ID, APP_NAME, EXECUTABLE_NAME, LINUX_DESKTOP_NAME,
    configureApplicationIdentity, getRuntimeAssetPath
};
