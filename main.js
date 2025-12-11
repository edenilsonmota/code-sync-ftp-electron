const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const ftp = require("basic-ftp");
const chokidar = require("chokidar");

const store = new Store();

let mainWindow;
let watchers = [];
const client = new ftp.Client();

// Fila agora vai guardar o "tipo" de ação também (upload ou delete)
let taskQueue = [];      
let isProcessing = false;   

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
    
    taskQueue = [];
    isProcessing = false;

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

    config.projects.forEach(proj => {
        createProjectWatcher(proj, config);
    });

    sendLog(`👀 Monitorando ${config.projects.length} projetos...`, "info");
});

ipcMain.on('stop-sync', async () => {
    await stopAllWatchers();
    client.close();
    taskQueue = []; 
    isProcessing = false;
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

    // MUDANÇA: Agora escutamos 'all' e tratamos cada tipo
    w.on('all', async (event, fullPath) => {
        // Ignora criação de pastas vazias (addDir), pois o upload de arquivo já cria a pasta.
        if (event === 'addDir') return; 

        // Filtro de Ignorados
        const fileName = path.basename(fullPath).toLowerCase();
        const shouldIgnore = userIgnored.some(rule => {
            if (rule.startsWith('*')) return fileName.endsWith(rule.replace('*', ''));
            return fileName === rule;
        });

        if (shouldIgnore) {
            // Só loga se não for exclusão (para não poluir log de coisas que já sumiram)
            if (event !== 'unlink' && event !== 'unlinkDir') {
                sendLog(`🚫 Ignorado: ${path.basename(fullPath)}`, "info");
            }
            return;
        }

        // --- DEFINE A AÇÃO ---
        let action = null;
        
        if (event === 'add' || event === 'change') {
            action = 'upload';
        } else if (event === 'unlink') {
            action = 'delete_file';
        } else if (event === 'unlinkDir') {
            action = 'delete_dir';
        }

        if (action) {
            addToQueue(action, fullPath, project, globalConfig);
        }
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

function addToQueue(action, fullPath, projectConfig, globalConfig) {
    taskQueue.push({ action, fullPath, projectConfig, globalConfig });
    processQueue();
}

async function processQueue() {
    if (isProcessing || taskQueue.length === 0) return;

    isProcessing = true;
    const task = taskQueue.shift();

    try {
        await handleSyncTask(task);
    } catch (err) {
        console.error("Erro na tarefa:", err);
    } finally {
        isProcessing = false;
        if (taskQueue.length > 0) {
            processQueue();
        } else {
            sendLog("🏁 Sincronização finalizada.", "info");
        }
    }
}

// --- EXECUTOR DA TAREFA ---

async function handleSyncTask({ action, fullPath, projectConfig, globalConfig }) {
    const relativePath = path.relative(projectConfig.local, fullPath);
    
    // Caminho remoto normalizado
    const remotePath = (projectConfig.remote + "/" + relativePath)
        .split(path.sep).join(path.posix.sep)
        .replace('//', '/');

    try {
        // Reconexão automática
        if (client.closed) {
            await client.access({
                host: globalConfig.host,
                user: globalConfig.user,
                password: globalConfig.password,
                port: parseInt(globalConfig.port) || 21,
                secure: false
            });
        }

        // --- DECIDE O QUE FAZER NO FTP ---
        
        if (action === 'upload') {
            sendLog(`⬆️ [${action}] ${relativePath}`, "info");
            await client.ensureDir(path.dirname(remotePath));
            await client.uploadFrom(fullPath, remotePath);
            sendLog(`✅ Enviado: ${relativePath}`, "success");
        } 
        
        else if (action === 'delete_file') {
            sendLog(`🗑️ [Deletando] ${relativePath}`, "error"); // Usei cor vermelha (error) para destacar delete
            try {
                await client.remove(remotePath);
                sendLog(`💀 Removido: ${relativePath}`, "success");
            } catch (e) {
                // Se der erro 550 (arquivo não existe), ignora, pois já tá deletado
                if (!e.message.includes("550")) throw e; 
            }
        }
        
        else if (action === 'delete_dir') {
            sendLog(`📂 [Removendo Pasta] ${relativePath}`, "error");
            try {
                await client.removeDir(remotePath);
                sendLog(`💀 Pasta removida: ${relativePath}`, "success");
            } catch (e) {
                if (!e.message.includes("550")) throw e;
            }
        }

    } catch (err) {
        sendLog(`❌ Erro (${action}): ${err.message}`, "error");
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