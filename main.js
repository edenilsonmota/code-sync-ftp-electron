const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const ftp = require("basic-ftp");
const chokidar = require("chokidar");

const store = new Store();

let mainWindow;
let watchers = [];
const client = new ftp.Client();

let uploadQueue = [];      
let isUploading = false;   

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 750,
        autoHideMenuBar: true, // Esconde a barra de menu
        webPreferences: {
            nodeIntegration: true,
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
    await stopAllWatchers();
    
    // Reseta a fila
    uploadQueue = [];
    isUploading = false;

    if (!config.projects || config.projects.length === 0) {
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
        return;
    }

    // Cria um vigia para cada projeto (Melhor controle)
    config.projects.forEach(proj => {
        createProjectWatcher(proj, config);
    });

    sendLog(`👀 Monitorando ${config.projects.length} projetos...`, "info");
});

ipcMain.on('stop-sync', async () => {
    await stopAllWatchers();
    client.close();
    uploadQueue = []; 
    isUploading = false;
    sendLog("🛑 Serviço parado.", "error");
});

// --- WATCHER INTELIGENTE ---

function createProjectWatcher(project, globalConfig) {
    // Prepara lista de ignorados do usuário
    const userIgnored = project.ignored 
        ? project.ignored.split(',').map(item => item.trim().toLowerCase()) 
        : [];

    const systemIgnored = [/node_modules/, /\.git/, /\.vscode/, /desktop\.ini/];

    const w = chokidar.watch(project.local, {
        ignored: systemIgnored,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
    });

    w.on('all', async (event, fullPath) => {
        if (event === 'addDir' || event === 'unlinkDir' || event === 'unlink') return;
        
        // --- FILTRO MANUAL (Ignorar arquivos específicos) ---
        const fileName = path.basename(fullPath).toLowerCase();
        
        const shouldIgnore = userIgnored.some(rule => {
            if (rule.startsWith('*')) { 
                return fileName.endsWith(rule.replace('*', ''));
            }
            return fileName === rule;
        });

        if (shouldIgnore) {
            sendLog(`🚫 Ignorado: ${path.basename(fullPath)}`, "info");
            return;
        }

        // --- ENVIA PARA A FILA EM VEZ DE SUBIR DIRETO ---
        addToQueue(fullPath, project, globalConfig);
    });

    watchers.push(w);
}

async function stopAllWatchers() {
    for (const w of watchers) {
        await w.close();
    }
    watchers = [];
}

// --- SISTEMA DE FILA (QUEUE) ---

function addToQueue(fullPath, projectConfig, globalConfig) {
    uploadQueue.push({ fullPath, projectConfig, globalConfig });
    processQueue();
}

async function processQueue() {
    // Se já tem algo subindo, espera.
    if (isUploading || uploadQueue.length === 0) return;

    isUploading = true; // Bloqueia
    const task = uploadQueue.shift(); // Pega o primeiro

    try {
        await handleUpload(task.fullPath, task.projectConfig, task.globalConfig);
    } catch (err) {
        console.error("Erro na fila:", err);
    } finally {
        isUploading = false; // Libera
        
        // Se ainda tem arquivos, processa o próximo
        if (uploadQueue.length > 0) {
            processQueue();
        } else {
            sendLog("🏁 Todos os arquivos foram sincronizados.", "info");
        }
    }
}

async function handleUpload(fullPath, projectConfig, globalConfig) {
    const relativePath = path.relative(projectConfig.local, fullPath);
    const remotePath = (projectConfig.remote + "/" + relativePath)
        .split(path.sep).join(path.posix.sep)
        .replace('//', '/');

    try {
        if (client.closed) {
            await client.access({
                host: globalConfig.host,
                user: globalConfig.user,
                password: globalConfig.password,
                port: parseInt(globalConfig.port) || 21,
                secure: false
            });
        }

        sendLog(`⬆️ [${path.basename(projectConfig.local)}] Enviando: ${relativePath}`, "info");
        
        await client.ensureDir(path.dirname(remotePath));
        await client.uploadFrom(fullPath, remotePath);
        
        sendLog(`✅ Sucesso: ${relativePath}`, "success");

    } catch (err) {
        sendLog(`❌ Falha: ${err.message}`, "error");
    }
}

function sendLog(msg, type) {
    if (mainWindow) {
        mainWindow.webContents.send('log-msg', { 
            msg, 
            type, 
            time: new Date().toLocaleTimeString() 
        });
    }
    console.log(`[${type}] ${msg}`);
}