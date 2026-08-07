const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');
const ftp = require("basic-ftp");
const chokidar = require("chokidar");

const APP_NAME = 'CodeSyncFtp';
const APP_ID = 'com.edenilson.codesyncftp';
const LINUX_DESKTOP_NAME = 'code-sync-ftp.desktop';

app.setName(APP_NAME);

// A identidade precisa ser definida antes de `ready` para o GNOME associar a
// janela ao arquivo .desktop instalado pelo pacote.
if (process.platform === 'linux' && typeof app.setDesktopName === 'function') {
    app.setDesktopName(LINUX_DESKTOP_NAME);
} else if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID);
}

if (process.platform === 'linux') {
    // Electron 28 ainda não expõe setDesktopName; o switch mantém WM_CLASS e
    // o app_id do Wayland alinhados ao code-sync-ftp.desktop.
    app.commandLine.appendSwitch('class', 'code-sync-ftp');
}

const store = new Store();

let mainWindow;
let tray = null; // Variável da Bandeja
let watchers = [];
const client = new ftp.Client();

// Variáveis de Estado
let uploadQueue = [];
let isUploading = false;
let isSyncing = false; // Para controlar o texto do menu (Iniciar/Parar)
let isQuitting = false; // Para saber se é pra fechar mesmo ou só esconder
let currentlyProcessingTaskKey = null;

// --- EVENTO BEFORE-QUIT (Correção para CMD+Q e Dock Quit) ---
app.on('before-quit', () => {
    isQuitting = true;
});

app.on('window-all-closed', () => {
    if (!isQuitting) {
        console.log('[App] Sem janelas; processo mantido ativo pelo Tray.');
    }
});

function getRuntimeAssetPath(fileName) {
    const basePath = app.isPackaged ? process.resourcesPath : __dirname;
    return path.join(basePath, fileName);
}

function getWindowIconPath() {
    return getRuntimeAssetPath(process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

function hideMainWindow(source) {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    console.log(`[Janela] Ocultando (${source}).`);
    mainWindow.hide();

    // setSkipTaskbar não é suportado no Linux; hide() já remove a janela da
    // visualização e o desktopName mantém a associação com o launcher.
    if (process.platform === 'win32') {
        mainWindow.setSkipTaskbar(true);
    }
}

function createWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        return mainWindow;
    }

    const windowIconPath = getWindowIconPath();
    console.log(`[Janela] Criando com ícone: ${windowIconPath}`);

    mainWindow = new BrowserWindow({
        width: 1000,
        height: 750,
        autoHideMenuBar: true,
        icon: windowIconPath,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const createdWindow = mainWindow;

    createdWindow.setMenuBarVisibility(false);
    createdWindow.loadFile('index.html');

    // --- LÓGICA DE FECHAR (X) ---
    createdWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            hideMainWindow('close');
            return false;
        }
    });

    // --- LÓGICA DE MINIMIZAR (_) ---
    createdWindow.on('minimize', (event) => {
        console.log('[Janela] Evento minimize recebido.');
        event.preventDefault();
        hideMainWindow('minimize');
    });

    // --- QUANDO MOSTRAR DE NOVO ---
    createdWindow.on('show', () => {
        console.log('[Janela] Evento show recebido.');
        if (process.platform === 'win32') {
            createdWindow.setSkipTaskbar(false);
        }
        if (process.platform === 'darwin') {
            app.dock.show();
        }
    });

    createdWindow.on('hide', () => {
        console.log('[Janela] Evento hide recebido.');
    });

    createdWindow.on('restore', () => {
        console.log('[Janela] Evento restore recebido.');
    });

    createdWindow.on('closed', () => {
        console.log('[Janela] Janela destruída.');
        if (mainWindow === createdWindow) {
            mainWindow = null;
        }
    });

    return createdWindow;
}

function revealMainWindow(window, source) {
    if (!window || window.isDestroyed()) return;

    if (process.platform === 'win32') {
        window.setSkipTaskbar(false);
    }

    if (!window.isVisible()) {
        console.log(`[Janela] Exibindo (${source}).`);
        window.show();
    }

    if (process.platform === 'darwin') {
        app.dock.show();
    }

    // show() já solicita foco. No Wayland, chamar focus() novamente pode ser
    // recusado pelo compositor e resultar apenas no flash de ativação.
    if (process.platform !== 'linux') {
        window.focus();
    }
}

function showMainWindow(source) {
    console.log(`[Janela] Solicitação para exibir (${source}).`);

    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
    }

    if (!mainWindow || mainWindow.isDestroyed()) return;

    const window = mainWindow;

    if (!window.isMinimized()) {
        revealMainWindow(window, source);
        return;
    }

    // restore() não é síncrono em todos os gerenciadores de janela. Mostrar a
    // janela antes da restauração terminar causa um flash e pode deixá-la oculta.
    let didReveal = false;
    const revealAfterRestore = () => {
        if (didReveal) return;
        didReveal = true;
        revealMainWindow(window, `${source}:restore`);
    };

    window.once('restore', revealAfterRestore);
    console.log(`[Janela] Restaurando antes de exibir (${source}).`);
    window.restore();

    // Fallback para ambientes que não emitem restore ao minimizar pela shell.
    setTimeout(revealAfterRestore, 150);
}

// --- EVENTO ACTIVATE ---
app.on('activate', () => {
    console.log('[App] Evento activate recebido.');
    showMainWindow('activate');
});

// --- CRIAÇÃO DA BANDEJA (TRAY) ---
function createTray() {
    const trayIconName = process.platform === 'win32' ? 'icon.ico' : 'tray-icon.png';
    const iconPath = getRuntimeAssetPath(trayIconName);
    const trayIcon = nativeImage.createFromPath(iconPath);

    if (trayIcon.isEmpty()) {
        console.error(`[Tray] Não foi possível carregar o ícone: ${iconPath}`);
        return;
    }

    tray = new Tray(trayIcon);
    tray.setToolTip(APP_NAME);
    console.log(`[Tray] Criado com ícone: ${iconPath}`);

    tray.on('click', () => {
        console.log('[Tray] Clique recebido.');
        showMainWindow('tray-click');
    });

    updateTrayMenu(); // Cria o menu inicial
}

function updateTrayMenu() {
    if (!tray) return;

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Abrir CodeSyncFtp',
            click: () => showMainWindow('tray-menu')
        },
        { type: 'separator' },
        {
            label: isSyncing ? 'Parar' : 'Iniciar',
            click: () => {
                // Ao clicar no Tray, avisamos o Front para clicar no botão virtualmente
                // Isso mantém a lógica centralizada
                if (mainWindow) {
                    mainWindow.webContents.send('toggle-sync-request');
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Sair',
            click: () => {
                isQuitting = true; // Agora pode fechar
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
}

// TRAVA DE INSTÂNCIA ÚNICA
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit(); // Encerra se já houver outro rodando
} else {
    // Se for a instância principal, escuta tentativas de abertura
    app.on('second-instance', () => {
        console.log('[App] Segunda instância detectada.');
        showMainWindow('second-instance');
    });

    // Inicia o App somente se tiver a trava
    app.whenReady().then(() => {
        console.log(`[App] Pronto (${process.platform}, packaged=${app.isPackaged}).`);
        createWindow();
        createTray();
    });
}

// --- COMUNICAÇÃO ---

ipcMain.on('save-settings', (event, data) => {
    store.set('config', data);
    console.log('Configurações salvas.');
});

// 2. Carregar configurações ao abrir
ipcMain.handle('get-settings', () => {
    return store.get('config', { projects: [] });
});

ipcMain.handle('test-ftp-credentials', async (event, config) => {
    const testClient = new ftp.Client();

    sendLog("Testando credenciais FTP...", "info");

    try {
        await testClient.access({
            host: config.host,
            user: config.user,
            password: config.password,
            port: parseInt(config.port) || 21,
            secure: false
        });

        sendLog("Credenciais FTP válidas.", "success");
        return { ok: true, message: "Conexão FTP estabelecida com sucesso!" };
    } catch (err) {
        sendLog(`Falha no teste FTP: ${err.message}`, "error");
        return { ok: false, message: `Falha ao conectar: ${err.message}` };
    } finally {
        testClient.close();
    }
});

ipcMain.handle('list-remote-directories', async (event, payload) => {
    const { config, path: requestedPath } = payload || {};
    const browserClient = new ftp.Client();

    try {
        await browserClient.access({
            host: config.host,
            user: config.user,
            password: config.password,
            port: parseInt(config.port) || 21,
            secure: false
        });

        let targetPath = (requestedPath || '/').trim();
        if (!targetPath.startsWith('/')) {
            targetPath = `/${targetPath}`;
        }

        try {
            await browserClient.cd(targetPath);
        } catch (_) {
            await browserClient.cd('/');
        }

        const currentPath = await browserClient.pwd();
        const entries = await browserClient.list();
        const directories = entries
            .filter(item => item.isDirectory)
            .map(item => item.name)
            .filter(name => name !== '.' && name !== '..')
            .sort((a, b) => a.localeCompare(b));

        return {
            ok: true,
            currentPath,
            directories
        };
    } catch (err) {
        return {
            ok: false,
            message: `Falha ao listar diretórios remotos: ${err.message}`
        };
    } finally {
        browserClient.close();
    }
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
    sendLog("Iniciando servico...", "info");
    await stopAllWatchers();

    uploadQueue = [];
    isUploading = false;
    currentlyProcessingTaskKey = null;

    if (!config.projects || config.projects.length === 0) {
        sendLog("Nenhuma pasta configurada!", "error");
        return;
    }

    try {
        await client.access({
            host: config.host,
            user: config.user,
            password: config.password,
            port: parseInt(config.port) || 21,
            secure: false
        });
        sendLog("Conexao FTP estabelecida!", "success");
    } catch (err) {
        sendLog(`Erro FTP: ${err.message}`, "error");
        // Avisa o front que falhou para destravar o botão
        event.reply('sync-error');
        return;
    }

    config.projects.forEach(proj => {
        createProjectWatcher(proj, config);
    });

    isSyncing = true;
    updateTrayMenu(); // Atualiza menu do Tray para "Parar"
    sendLog(`Monitorando ${config.projects.length} projetos...`, "info");
});

// --- STOP SYNC ---
ipcMain.on('stop-sync', async () => {
    await stopAllWatchers();
    client.close();
    uploadQueue = [];
    isUploading = false;
    currentlyProcessingTaskKey = null;

    isSyncing = false;
    updateTrayMenu(); // Atualiza menu do Tray para "Iniciar"

    sendLog("Servico parado.", "error");
});

// --- WATCHER ---

function createProjectWatcher(project, globalConfig) {
    const userIgnored = project.ignored
        ? project.ignored.split(',').map(item => item.trim().toLowerCase())
        : [];

    const systemIgnored = [/node_modules/, /\.git/, /\.vscode/, /desktop\.ini/];

    const w = chokidar.watch(project.local, {
        ignored: systemIgnored,
        persistent: true,
        ignoreInitial: true,
        usePolling: false,
        awaitWriteFinish: { stabilityThreshold: 1200, pollInterval: 250 }
    });

    w.on('all', async (event, fullPath) => {
        if (event === 'addDir') return;

        const fileName = path.basename(fullPath).toLowerCase();
        const shouldIgnore = userIgnored.some(rule => {
            if (rule.startsWith('*')) return fileName.endsWith(rule.replace('*', ''));
            return fileName === rule;
        });

        if (shouldIgnore) {
            if (event !== 'unlink' && event !== 'unlinkDir') {
                sendLog(`Ignorado: ${path.basename(fullPath)}`, "info");
            }
            return;
        }

        let action = null;
        if (event === 'add' || event === 'change') action = 'upload';
        else if (event === 'unlink') action = 'delete_file';
        else if (event === 'unlinkDir') action = 'delete_dir';

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

// --- QUEUE ---

function addToQueue(action, fullPath, projectConfig, globalConfig) {
    const taskKey = `${action}:${projectConfig.local}:${fullPath}`;
    const hasEquivalentPendingTask = uploadQueue.some(task => (
        task.action === action &&
        task.fullPath === fullPath &&
        task.projectConfig.local === projectConfig.local
    ));

    // Evita enfileirar tarefas idênticas em sequência (principal fonte de uso alto de CPU e rede).
    if (hasEquivalentPendingTask || currentlyProcessingTaskKey === taskKey) {
        return;
    }

    uploadQueue.push({ action, fullPath, projectConfig, globalConfig });
    processQueue();
}

async function processQueue() {
    if (isUploading || uploadQueue.length === 0) return;

    isUploading = true;
    const task = uploadQueue.shift();
    currentlyProcessingTaskKey = `${task.action}:${task.projectConfig.local}:${task.fullPath}`;

    try {
        await handleSyncTask(task);
    } catch (err) {
        console.error("Erro na fila:", err);
    } finally {
        currentlyProcessingTaskKey = null;
        isUploading = false;
        if (uploadQueue.length > 0) {
            processQueue();
        } else {
            sendLog("Sincronismo em dia.", "info");
        }
    }
}

// --- EXECUTOR ---

async function handleSyncTask({ action, fullPath, projectConfig, globalConfig }) {
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

        if (action === 'upload') {
            sendLog(`[Upload] ${relativePath}`, "info");
            await client.ensureDir(path.dirname(remotePath));
            await client.uploadFrom(fullPath, remotePath);
            sendLog(`Sucesso: ${relativePath}`, "success");
        }
        else if (action === 'delete_file') {
            sendLog(`[Del File] ${relativePath}`, "error");
            try { await client.remove(remotePath); } catch (e) { if (!e.message.includes("550")) throw e; }
            sendLog(`Removido: ${relativePath}`, "success");
        }
        else if (action === 'delete_dir') {
            sendLog(`[Del Dir] ${relativePath}`, "error");
            try { await client.removeDir(remotePath); } catch (e) { if (!e.message.includes("550")) throw e; }
            sendLog(`Pasta removida: ${relativePath}`, "success");
        }

    } catch (err) {
        sendLog(`Erro (${action}): ${err.message}`, "error");
    }
}

function sendLog(msg, type) {
    if (mainWindow) {
        mainWindow.webContents.send('log-msg', { msg, type, time: new Date().toLocaleTimeString() });
    }
    console.log(`[${type}] ${msg}`);
}
