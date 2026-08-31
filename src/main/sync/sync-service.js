const path = require('path');
const chokidar = require('chokidar');

const MAX_PENDING_TASKS = 10000;
const RETRY_DELAYS_MS = [0, 500, 1500];

function normalizeRemotePath(remoteBase, relativePath = '') {
    const base = String(remoteBase || '/').replace(/\\/g, '/');
    const relative = String(relativePath).replace(/\\/g, '/');
    if ([...base.split('/'), ...relative.split('/')].includes('..')) {
        throw new Error('Caminho remoto não pode conter "..".');
    }
    const normalized = path.posix.normalize(`/${base}/${relative}`);
    if (normalized === '/..' || normalized.startsWith('/../')) {
        throw new Error('Caminho remoto inválido.');
    }
    return normalized;
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

class SyncService {
    constructor({ ftpService, log, onStateChange, watcherFactory = chokidar.watch }) {
        this.ftpService = ftpService;
        this.log = log;
        this.onStateChange = onStateChange;
        this.watcherFactory = watcherFactory;
        this.watchers = [];
        this.queue = [];
        this.isUploading = false;
        this.isSyncing = false;
        this.currentTask = null;
        this.processingPromise = null;
        this.sessionId = 0;
        this.transitionPromise = Promise.resolve();
    }

    getState() { return this.isSyncing; }

    start(config) {
        return this.runTransition(() => this.startInternal(config));
    }

    stop(options = {}) {
        return this.runTransition(() => this.stopInternal(options));
    }

    runTransition(operation) {
        const next = this.transitionPromise.then(operation, operation);
        this.transitionPromise = next.catch(() => {});
        return next;
    }

    async startInternal(config) {
        await this.stopInternal({ silent: true });
        this.log('Iniciando serviço...', 'info');
        if (!config.projects || config.projects.length === 0) {
            this.log('Nenhuma pasta configurada!', 'error');
            return { ok: false, reason: 'no-projects' };
        }

        try {
            await this.ftpService.connect(config);
            this.log('Conexão FTP estabelecida!', 'success');
        } catch (error) {
            this.log(`Erro FTP: ${error.message}`, 'error');
            return { ok: false, reason: 'connection', message: error.message };
        }

        const sessionId = ++this.sessionId;
        this.setSyncing(true);
        for (const project of config.projects) this.createWatcher(project, config, sessionId);
        this.log(`Monitorando ${config.projects.length} projetos...`, 'info');
        return { ok: true };
    }

    async stopInternal({ silent = false } = {}) {
        const wasActive = this.isSyncing || this.isUploading || this.watchers.length > 0;
        this.sessionId++;
        this.setSyncing(false);
        await this.stopWatchers();
        this.queue = [];
        this.ftpService.close();
        if (this.processingPromise) await this.processingPromise.catch(() => {});
        this.isUploading = false;
        this.currentTask = null;
        this.processingPromise = null;
        if (!silent && wasActive) this.log('Serviço parado.', 'info');
        return { ok: true };
    }

    setSyncing(value) {
        if (this.isSyncing === value) return;
        this.isSyncing = value;
        this.onStateChange(value);
    }

    createWatcher(project, globalConfig, sessionId) {
        const userIgnored = project.ignored
            ? project.ignored.split(',').map(item => item.trim().toLowerCase()).filter(Boolean) : [];
        const watcher = this.watcherFactory(project.local, {
            ignored: [/node_modules/, /\.git/, /\.vscode/, /desktop\.ini/],
            persistent: true,
            ignoreInitial: false,
            followSymlinks: false,
            usePolling: false,
            awaitWriteFinish: { stabilityThreshold: 1200, pollInterval: 250 }
        });

        watcher.on('all', (event, fullPath) => {
            if (sessionId !== this.sessionId || event === 'addDir') return;
            const fileName = path.basename(fullPath).toLowerCase();
            const ignored = userIgnored.some(rule => (
                rule.startsWith('*') ? fileName.endsWith(rule.slice(1)) : fileName === rule
            ));
            if (ignored) {
                if (event !== 'unlink' && event !== 'unlinkDir') this.log(`Ignorado: ${path.basename(fullPath)}`, 'info');
                return;
            }
            const action = { add: 'upload', change: 'upload', unlink: 'delete_file', unlinkDir: 'delete_dir' }[event];
            if (action) this.enqueue(action, fullPath, project, globalConfig, sessionId);
        });
        watcher.on('error', error => {
            if (sessionId !== this.sessionId) return;
            this.log(`Erro ao monitorar ${project.local}: ${error.message}`, 'error');
            void this.stop().catch(stopError => this.log(`Falha ao interromper serviço: ${stopError.message}`, 'error'));
        });
        this.watchers.push(watcher);
    }

    async stopWatchers() {
        const watchers = this.watchers;
        this.watchers = [];
        await Promise.allSettled(watchers.map(watcher => watcher.close()));
    }

    taskKey(task) {
        return `${task.projectConfig.local}:${task.projectConfig.remote}:${task.fullPath}`;
    }

    enqueue(action, fullPath, projectConfig, globalConfig, sessionId = this.sessionId) {
        if (!this.isSyncing || sessionId !== this.sessionId) return;
        const task = { action, fullPath, projectConfig, globalConfig, sessionId };
        const key = this.taskKey(task);
        const existingIndex = this.queue.findIndex(item => this.taskKey(item) === key);
        if (existingIndex >= 0) {
            this.queue[existingIndex] = task;
        } else if (this.queue.length >= MAX_PENDING_TASKS) {
            this.log(`Fila cheia; alteração não enfileirada: ${fullPath}`, 'error');
            return;
        } else {
            this.queue.push(task);
        }
        if (!this.processingPromise) {
            this.processingPromise = this.processQueue().finally(() => { this.processingPromise = null; });
        }
    }

    async processQueue() {
        this.isUploading = true;
        let failedTasks = 0;
        try {
            while (this.queue.length > 0) {
                const task = this.queue.shift();
                if (task.sessionId !== this.sessionId || !this.isSyncing) continue;
                this.currentTask = task;
                if (!await this.executeWithRetry(task)) failedTasks++;
                this.currentTask = null;
            }
            if (this.isSyncing) {
                this.log(failedTasks ? `Fila concluída com ${failedTasks} erro(s).` : 'Sincronismo em dia.', failedTasks ? 'error' : 'info');
            }
        } finally {
            this.currentTask = null;
            this.isUploading = false;
        }
    }

    async executeWithRetry(task) {
        let lastError;
        for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
            if (task.sessionId !== this.sessionId || !this.isSyncing) return true;
            if (RETRY_DELAYS_MS[attempt]) await delay(RETRY_DELAYS_MS[attempt]);
            try {
                await this.execute(task);
                return true;
            } catch (error) {
                lastError = error;
                this.ftpService.close();
                if (attempt < RETRY_DELAYS_MS.length - 1) {
                    this.log(`Tentativa ${attempt + 1} falhou; reconectando: ${error.message}`, 'error');
                }
            }
        }
        if (task.sessionId === this.sessionId) {
            this.log(`Erro (${task.action}) após ${RETRY_DELAYS_MS.length} tentativas: ${lastError.message}`, 'error');
        }
        return false;
    }

    async execute({ action, fullPath, projectConfig, globalConfig }) {
        const relativePath = path.relative(projectConfig.local, fullPath);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            throw new Error('Arquivo fora da pasta local configurada.');
        }
        const remotePath = normalizeRemotePath(projectConfig.remote, relativePath);
        await this.ftpService.ensureConnected(globalConfig);
        if (action === 'upload') {
            this.log(`[Upload] ${relativePath}`, 'info');
            await this.ftpService.upload(fullPath, remotePath);
            this.log(`Sucesso: ${relativePath}`, 'success');
        } else if (action === 'delete_file') {
            this.log(`[Del File] ${relativePath}`, 'info');
            await this.ignoreMissing(() => this.ftpService.removeFile(remotePath));
            this.log(`Removido: ${relativePath}`, 'success');
        } else if (action === 'delete_dir') {
            this.log(`[Del Dir] ${relativePath}`, 'info');
            await this.ignoreMissing(() => this.ftpService.removeDirectory(remotePath));
            this.log(`Pasta removida: ${relativePath}`, 'success');
        }
    }

    async ignoreMissing(operation) {
        try { await operation(); } catch (error) { if (!error.message.includes('550')) throw error; }
    }
}

module.exports = { MAX_PENDING_TASKS, SyncService, normalizeRemotePath };
