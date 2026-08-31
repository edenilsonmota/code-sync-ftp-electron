const path = require('path');
const { BrowserWindow } = require('electron');
const { getRuntimeAssetPath } = require('../config/application');

class WindowManager {
    constructor(app, isQuitting) {
        this.app = app;
        this.isQuitting = isQuitting;
        this.mainWindow = null;
        this.recreateOnNextShow = false;
    }

    getWindow() { return this.mainWindow; }

    create() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) return this.mainWindow;
        const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
        const icon = getRuntimeAssetPath(this.app, iconName);
        console.log(`[Janela] Criando com ícone: ${icon}`);
        this.mainWindow = new BrowserWindow({
            width: 1000, height: 750, autoHideMenuBar: true, icon,
            webPreferences: {
                preload: path.resolve(__dirname, '../../preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true
            }
        });
        const createdWindow = this.mainWindow;
        createdWindow.setMenuBarVisibility(false);
        createdWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        createdWindow.webContents.on('will-navigate', event => event.preventDefault());
        createdWindow.webContents.on('did-fail-load', (_event, code, description) => {
            console.error(`[Renderer] Falha ao carregar (${code}): ${description}`);
        });
        createdWindow.webContents.on('render-process-gone', (_event, details) => {
            console.error(`[Renderer] Processo encerrado: ${details.reason}`);
        });
        createdWindow.webContents.on('console-message', (_event, level, message) => {
            if (level >= 2) console.error(`[Renderer] ${message}`);
        });
        createdWindow.loadFile(path.resolve(__dirname, '../../renderer/index.html'));
        createdWindow.on('close', event => {
            if (!this.isQuitting()) { event.preventDefault(); this.hide('close'); }
        });
        createdWindow.on('minimize', event => {
            event.preventDefault();
            this.hide('minimize');
        });
        createdWindow.on('show', () => {
            if (process.platform === 'win32') createdWindow.setSkipTaskbar(false);
            if (process.platform === 'darwin') this.app.dock.show();
        });
        createdWindow.on('closed', () => {
            if (this.mainWindow === createdWindow) this.mainWindow = null;
        });
        return createdWindow;
    }

    hide(source) {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
        console.log(`[Janela] Ocultando (${source}).`);
        const window = this.mainWindow;
        window.hide();
        if (process.platform === 'linux') {
            this.recreateOnNextShow = true;
            setImmediate(() => { if (!window.isDestroyed()) window.destroy(); });
        } else if (process.platform === 'win32') {
            window.setSkipTaskbar(true);
        }
    }

    show(source) {
        console.log(`[Janela] Solicitação para exibir (${source}).`);
        if (process.platform === 'linux' && this.recreateOnNextShow) {
            const hiddenWindow = this.mainWindow;
            this.recreateOnNextShow = false;
            if (hiddenWindow && !hiddenWindow.isDestroyed()) hiddenWindow.destroy();
            if (this.mainWindow === hiddenWindow) this.mainWindow = null;
        }
        if (!this.mainWindow || this.mainWindow.isDestroyed()) this.create();
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
        const window = this.mainWindow;
        if (!window.isMinimized()) return this.reveal(window, source);

        let didReveal = false;
        const revealAfterRestore = () => {
            if (didReveal) return;
            didReveal = true;
            this.reveal(window, `${source}:restore`);
        };
        window.once('restore', revealAfterRestore);
        window.restore();
        setTimeout(revealAfterRestore, 150);
    }

    reveal(window, source) {
        if (!window || window.isDestroyed()) return;
        if (process.platform === 'win32') window.setSkipTaskbar(false);
        if (!window.isVisible()) { console.log(`[Janela] Exibindo (${source}).`); window.show(); }
        if (process.platform === 'darwin') this.app.dock.show();
        if (process.platform !== 'linux') window.focus();
    }

    send(channel, payload) {
        const window = this.mainWindow;
        if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
    }
}

module.exports = { WindowManager };
