const { Menu, Tray, nativeImage } = require('electron');
const { APP_NAME, getRuntimeAssetPath } = require('../config/application');

class TrayManager {
    constructor({ app, windowManager, onQuit, onToggle }) {
        this.app = app;
        this.windowManager = windowManager;
        this.onQuit = onQuit;
        this.onToggle = onToggle;
        this.tray = null;
        this.isSyncing = false;
    }

    create() {
        const iconName = process.platform === 'win32' ? 'icon.ico' : 'tray-icon.png';
        const iconPath = getRuntimeAssetPath(this.app, iconName);
        const icon = nativeImage.createFromPath(iconPath);
        if (icon.isEmpty()) return console.error(`[Tray] Não foi possível carregar o ícone: ${iconPath}`);
        this.tray = new Tray(icon);
        this.tray.setToolTip(APP_NAME);
        this.tray.on('click', () => this.windowManager.show('tray-click'));
        this.update(false);
    }

    update(isSyncing) {
        this.isSyncing = isSyncing;
        if (!this.tray) return;
        this.tray.setContextMenu(Menu.buildFromTemplate([
            { label: `Abrir ${APP_NAME}`, click: () => this.windowManager.show('tray-menu') },
            { type: 'separator' },
            {
                label: this.isSyncing ? 'Parar' : 'Iniciar',
                click: () => void this.onToggle()
            },
            { type: 'separator' },
            { label: 'Sair', click: this.onQuit }
        ]));
    }
}

module.exports = { TrayManager };
