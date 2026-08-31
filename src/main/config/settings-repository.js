const fs = require('fs');
const path = require('path');
const Store = require('electron-store');

const ENCRYPTED_PREFIX = 'safe-storage:';

class SettingsRepository {
    constructor({ app, safeStorage }) {
        this.app = app;
        this.safeStorage = safeStorage;
        this.store = new Store();
        this.migrateLegacySettings();
    }

    get() {
        const config = this.store.get('config', { projects: [] });
        const password = this.decryptPassword(config.password);
        if (password && !String(config.password).startsWith(ENCRYPTED_PREFIX)) {
            this.set({ projects: [], ...config, password });
        }
        return { ...config, password };
    }

    set(config) {
        const safeConfig = {
            ...config,
            password: this.encryptPassword(config.password),
            projects: config.projects.map(project => ({
                local: project.local,
                remote: project.remote,
                ignored: project.ignored || ''
            }))
        };
        this.store.set('config', safeConfig);
    }

    migrateLegacySettings() {
        if (this.store.has('config')) return;
        const parent = path.dirname(this.app.getPath('userData'));
        const legacyDirectories = ['CodeSyncFtp', 'code-sync-ftp'];
        for (const directory of legacyDirectories) {
            const configFile = path.join(parent, directory, 'config.json');
            if (!fs.existsSync(configFile)) continue;
            try {
                const legacyData = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                if (legacyData.config) {
                    this.set({ projects: [], ...legacyData.config });
                    console.log(`[Config] Configurações migradas de ${directory}.`);
                    return;
                }
            } catch (error) {
                console.error(`[Config] Falha ao migrar ${configFile}:`, error);
            }
        }
    }

    encryptPassword(password = '') {
        if (!password || password.startsWith(ENCRYPTED_PREFIX)) return password;
        if (!this.safeStorage.isEncryptionAvailable()) {
            console.warn('[Config] Armazenamento seguro indisponível; a senha não será persistida.');
            return '';
        }
        return `${ENCRYPTED_PREFIX}${this.safeStorage.encryptString(password).toString('base64')}`;
    }

    decryptPassword(password = '') {
        if (!password.startsWith(ENCRYPTED_PREFIX)) return password;
        try {
            const encrypted = Buffer.from(password.slice(ENCRYPTED_PREFIX.length), 'base64');
            return this.safeStorage.decryptString(encrypted);
        } catch (error) {
            console.error('[Config] Não foi possível descriptografar a senha:', error);
            return '';
        }
    }
}

module.exports = { SettingsRepository };
