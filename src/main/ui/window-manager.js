const path = require('path');
const { BrowserWindow } = require('electron');
const { getRuntimeAssetPath } = require('../config/application');

class WindowManager {
    constructor(app) {
        this.app = app;
        this.mainWindow = null;
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
        createdWindow.on('closed', () => {
            if (this.mainWindow === createdWindow) this.mainWindow = null;
        });
        return createdWindow;
    }

    show(source) {
        console.log(`[Janela] Solicitação para exibir (${source}).`);
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
        if (!window.isVisible()) { console.log(`[Janela] Exibindo (${source}).`); window.show(); }
        if (process.platform === 'darwin') this.app.dock.show();
        window.focus();
    }

    send(channel, payload) {
        const window = this.mainWindow;
        if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
    }
}

module.exports = { WindowManager };
