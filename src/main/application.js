const { app, dialog, ipcMain, safeStorage } = require('electron');
const { configureApplicationIdentity } = require('./config/application');
const { SettingsRepository } = require('./config/settings-repository');
const { FtpService } = require('./ftp/ftp-service');
const { registerIpcHandlers } = require('./ipc/register-handlers');
const { SyncService } = require('./sync/sync-service');
const { WindowManager } = require('./ui/window-manager');

function startApplication() {
    configureApplicationIdentity(app);
    let allowQuit = false;
    let shutdownPromise = null;
    let syncService;
    const windowManager = new WindowManager(app);
    const log = (msg, type) => {
        windowManager.send('log-msg', { msg, type, time: new Date().toLocaleTimeString() });
        console.log(`[${type}] ${msg}`);
    };

    if (!app.requestSingleInstanceLock()) return app.quit();
    app.on('second-instance', () => windowManager.show('second-instance'));
    app.on('activate', () => windowManager.show('activate'));
    app.on('window-all-closed', () => app.quit());
    app.on('before-quit', event => {
        if (allowQuit || !syncService) return;
        event.preventDefault();
        if (!shutdownPromise) {
            shutdownPromise = syncService.stop({ silent: true }).finally(() => {
                allowQuit = true;
                app.quit();
            });
        }
    });

    app.whenReady().then(() => {
        const settings = new SettingsRepository({ app, safeStorage });
        const ftpService = new FtpService();
        syncService = new SyncService({
            ftpService,
            log,
            onStateChange: state => windowManager.send('sync-state-changed', state)
        });
        registerIpcHandlers({
            ipcMain, dialog, settings, ftpService, syncService, windowManager, log
        });
        console.log(`[App] Pronto (${process.platform}, packaged=${app.isPackaged}).`);
        windowManager.create();
    }).catch(error => {
        console.error('[App] Falha durante inicialização:', error);
        app.quit();
    });
}

module.exports = { startApplication };
