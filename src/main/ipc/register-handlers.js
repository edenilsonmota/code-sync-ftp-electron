const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const RENDERER_URL = pathToFileURL(path.resolve(__dirname, '../../renderer/index.html')).href;

function assertTrustedSender(event) {
    if (!event.senderFrame || event.senderFrame.url !== RENDERER_URL) {
        throw new Error('Origem IPC não autorizada.');
    }
}

function validateConnection(config) {
    if (!config || typeof config !== 'object') throw new Error('Configuração FTP inválida.');
    const host = String(config.host || '').trim();
    const user = String(config.user || '').trim();
    const password = String(config.password || '');
    const port = Number(config.port || 21);
    if (!host || !user) throw new Error('Host e usuário são obrigatórios.');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta FTP inválida.');
    return { host, user, password, port };
}

function validateConfig(config, { requireProjects = true } = {}) {
    const connection = validateConnection(config);
    const projects = Array.isArray(config.projects) ? config.projects.map(project => {
        const local = path.resolve(String(project.local || ''));
        const remote = String(project.remote || '').trim();
        if (!project.local || !remote) throw new Error('Mapeamento de pasta inválido.');
        if (!fs.existsSync(local) || !fs.statSync(local).isDirectory()) {
            throw new Error(`Pasta local inexistente ou inacessível: ${local}`);
        }
        return { local, remote };
    }) : [];
    if (requireProjects && projects.length === 0) throw new Error('Adicione pelo menos um projeto válido.');
    return { ...connection, projects };
}

function registerIpcHandlers({ ipcMain, dialog, settings, ftpService, syncService, windowManager, log }) {
    ipcMain.handle('get-settings', event => { assertTrustedSender(event); return settings.get(); });
    ipcMain.handle('get-sync-state', event => { assertTrustedSender(event); return syncService.getState(); });
    ipcMain.handle('save-settings', (event, data) => {
        assertTrustedSender(event);
        const config = validateConfig(data);
        settings.set(config);
        return { ok: true };
    });
    ipcMain.handle('test-ftp-credentials', async (event, rawConfig) => {
        assertTrustedSender(event);
        try {
            const config = validateConnection(rawConfig);
            log('Testando credenciais FTP...', 'info');
            await ftpService.testConnection(config);
            log('Credenciais FTP válidas.', 'success');
            return { ok: true, message: 'Conexão FTP estabelecida com sucesso!' };
        } catch (error) {
            log(`Falha no teste FTP: ${error.message}`, 'error');
            return { ok: false, message: `Falha ao conectar: ${error.message}` };
        }
    });
    ipcMain.handle('list-remote-directories', async (event, payload = {}) => {
        assertTrustedSender(event);
        try {
            const config = validateConnection(payload.config);
            const result = await ftpService.listDirectories(config, String(payload.path || '/'));
            return { ok: true, ...result };
        } catch (error) {
            return { ok: false, message: `Falha ao listar diretórios remotos: ${error.message}` };
        }
    });
    ipcMain.handle('select-folder', async event => {
        assertTrustedSender(event);
        const result = await dialog.showOpenDialog(windowManager.getWindow(), { properties: ['openDirectory'] });
        return result.canceled ? null : result.filePaths[0];
    });
    ipcMain.handle('start-sync', async (event, rawConfig) => {
        assertTrustedSender(event);
        try {
            const config = validateConfig(rawConfig);
            settings.set(config);
            return await syncService.start(config);
        } catch (error) {
            log(error.message, 'error');
            return { ok: false, reason: 'validation', message: error.message };
        }
    });
    ipcMain.handle('stop-sync', async event => {
        assertTrustedSender(event);
        try { return await syncService.stop(); }
        catch (error) {
            log(`Falha ao parar sincronização: ${error.message}`, 'error');
            return { ok: false, message: error.message };
        }
    });
}

module.exports = { registerIpcHandlers, validateConfig, validateConnection };
