const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const ftp = require("basic-ftp");
const chokidar = require("chokidar");
const fs = require('fs');

const store = new Store(); // Para salvar configurações
let mainWindow;
let watcher = null;
const client = new ftp.Client();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true, // Habilita Node no Front (para simplificar)
            contextIsolation: false
        }
    });
    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

// --- COMUNICAÇÃO (IPC) ---

// 1. Salvar configurações vindas da tela
ipcMain.on('save-settings', (event, data) => {
    store.set('config', data);
    console.log('Configurações salvas!');
});

// 2. Carregar configurações ao abrir
ipcMain.handle('get-settings', () => {
    return store.get('config', { projects: [] });
});

// 3. Selecionar Pasta (Diálogo nativo do SO)
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result.filePaths[0];
});

// 4. INICIAR O SYNC
ipcMain.on('start-sync', async (event, config) => {
    sendLog("🚀 Iniciando serviço...", "info");
    
    // Configura Watcher
    const localPaths = config.projects.map(p => p.local);
    
    if (localPaths.length === 0) {
        sendLog("⚠️ Nenhuma pasta configurada!", "error");
        return;
    }

    // Tenta conexão FTP inicial
    try {
        await client.access({
            host: config.host,
            user: config.user,
            password: config.password,
            port: parseInt(config.port) || 21,
            secure: false
        });
        sendLog("✅ Conexão FTP estabelecida!", "success");
    } catch (err) {
        sendLog(`❌ Erro FTP: ${err.message}`, "error");
        return; // Não inicia watcher se FTP falhar
    }

    // Inicia Chokidar
    watcher = chokidar.watch(localPaths, {
        ignored: /node_modules|\.git|\.vscode|desktop\.ini/,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
    });

    watcher.on('all', async (event, fullPath) => {
        // Ignora eventos de diretório, foca em arquivos
        if (event === 'addDir' || event === 'unlinkDir') return;
        if (event === 'unlink') return; // Opcional: tratar deleção

        await handleUpload(fullPath, config);
    });

    sendLog(`👀 Monitorando ${config.projects.length} pastas...`, "info");
});

// 5. PARAR O SYNC
ipcMain.on('stop-sync', async () => {
    if (watcher) {
        await watcher.close();
        watcher = null;
    }
    client.close();
    sendLog("🛑 Serviço parado.", "error");
});

// --- LÓGICA DE UPLOAD ---

async function handleUpload(fullPath, config) {
    // Descobre qual projeto é dono desse arquivo
    const project = config.projects.find(p => fullPath.startsWith(path.resolve(p.local)));
    
    if (!project) return;

    // Normaliza caminhos
    const relativePath = path.relative(project.local, fullPath);
    const remotePath = (project.remote + "/" + relativePath).split(path.sep).join(path.posix.sep).replace('//', '/');

    try {
        if (client.closed) {
            await client.access({
                host: config.host,
                user: config.user,
                password: config.password,
                port: parseInt(config.port) || 21,
                secure: false
            });
        }

        sendLog(`⬆️ Uploading: ${relativePath}`, "info");
        await client.ensureDir(path.dirname(remotePath));
        await client.uploadFrom(fullPath, remotePath);
        sendLog(`✅ Sucesso: ${remotePath}`, "success");

    } catch (err) {
        sendLog(`❌ Falha: ${err.message}`, "error");
        client.close();
    }
}

function sendLog(msg, type) {
    if (mainWindow) mainWindow.webContents.send('log-msg', { msg, type, time: new Date().toLocaleTimeString() });
}