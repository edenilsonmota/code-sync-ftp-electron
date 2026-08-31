const { app, dialog, ipcMain, safeStorage } = require('electron');
const { configureApplicationIdentity } = require('./config/application');
const { SettingsRepository } = require('./config/settings-repository');
const { FtpService } = require('./ftp/ftp-service');
const { registerIpcHandlers, validateConfig } = require('./ipc/register-handlers');
const { SyncService } = require('./sync/sync-service');
const { TrayManager } = require('./ui/tray-manager');
const { WindowManager } = require('./ui/window-manager');

function startApplication() {
    configureApplicationIdentity(app);
    let isQuitting = false;
    let allowQuit = false;
    let shutdownPromise = null;
    let syncService;
    const windowManager = new WindowManager(app, () => isQuitting);
    const log = (msg, type) => {
        windowManager.send('log-msg', { msg, type, time: new Date().toLocaleTimeString() });
        console.log(`[${type}] ${msg}`);
    };

    if (!app.requestSingleInstanceLock()) return app.quit();
    app.on('second-instance', () => windowManager.show('second-instance'));
    app.on('activate', () => windowManager.show('activate'));
    app.on('window-all-closed', () => {
        if (!isQuitting) console.log('[App] Sem janelas; processo mantido ativo pelo Tray.');
    });
    app.on('before-quit', event => {
        isQuitting = true;
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
        let trayManager;
        syncService = new SyncService({
            ftpService,
            log,
            onStateChange: state => {
                trayManager?.update(state);
                windowManager.send('sync-state-changed', state);
            }
        });
        trayManager = new TrayManager({
            app,
            windowManager,
            onQuit: () => app.quit(),
            onToggle: async () => {
                let result;
                try {
                    result = syncService.getState()
                        ? await syncService.stop()
                        : await syncService.start(validateConfig(settings.get()));
                } catch (error) {
                    result = { ok: false, message: error.message };
                }
                if (!result.ok) {
                    log(result.message || 'Não foi possível alterar a sincronização.', 'error');
                    windowManager.show('tray-sync-error');
                }
            }
        });
        registerIpcHandlers({
            ipcMain, dialog, settings, ftpService, syncService, windowManager, log
        });
        console.log(`[App] Pronto (${process.platform}, packaged=${app.isPackaged}).`);
        windowManager.create();
        trayManager.create();
    }).catch(error => {
        console.error('[App] Falha durante inicialização:', error);
        app.quit();
    });
}

module.exports = { startApplication };
