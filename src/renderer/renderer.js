const api = window.ftpSync;

const projectList = document.getElementById('projects-list');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnTest = document.getElementById('btnTest');
const logsDiv = document.getElementById('logs');
const remotePickerModal = document.getElementById('remotePickerModal');
const remoteCurrentPath = document.getElementById('remoteCurrentPath');
const remoteList = document.getElementById('remoteList');
const MAX_LOG_ENTRIES = 500;
const pendingLogs = [];
let logFramePending = false;
const remotePickerState = { targetInput: null, currentPath: '/', requestId: 0 };

window.onload = async () => {
    try {
        const [config, syncIsRunning] = await Promise.all([
            api.getSettings(), api.getSyncState()
        ]);
        document.getElementById('host').value = config.host || '';
        document.getElementById('user').value = config.user || '';
        document.getElementById('password').value = config.password || '';
        document.getElementById('port').value = config.port || 21;
        if (config.projects?.length) {
            config.projects.forEach(project => addProjectRow(project.local, project.remote));
        } else addProjectRow();
        setSyncUiRunning(syncIsRunning);
    } catch (error) {
        addProjectRow();
        addLog({ type: 'error', time: new Date().toLocaleTimeString(), msg: `Falha ao carregar configurações: ${error.message}` });
    }
};

function addProjectRow(localValue = '', remoteValue = '') {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.innerHTML = `
        <div style="display:flex; gap:5px;">
            <input type="text" placeholder="Pasta Local (C:\\...)" class="input-local" readonly>
            <button class="btn-folder">Selecionar</button>
        </div>
        <div class="remote-field">
            <input type="text" placeholder="Pasta Remota (/web/...)" class="input-remote">
            <button class="btn-remote-folder">Escolher FTP</button>
        </div>
        <button class="btn-remove">Remover</button>`;
    row.querySelector('.input-local').value = localValue;
    row.querySelector('.input-remote').value = remoteValue;
    row.querySelector('.btn-folder').addEventListener('click', event => selectFolder(event.currentTarget));
    row.querySelector('.btn-remote-folder').addEventListener('click', event => openRemotePicker(event.currentTarget));
    row.querySelector('.btn-remove').addEventListener('click', event => removeRow(event.currentTarget));
    projectList.appendChild(row);
}

function removeRow(button) { button.closest('.project-row').remove(); }

async function selectFolder(button) {
    try {
        const selectedPath = await api.selectFolder();
        if (selectedPath) button.previousElementSibling.value = selectedPath;
    } catch (error) { alert(`Falha ao selecionar pasta: ${error.message}`); }
}

function normalizeRemotePath(remotePath) {
    if (!remotePath || typeof remotePath !== 'string') return '/';
    const withSlash = remotePath.startsWith('/') ? remotePath : `/${remotePath}`;
    return withSlash.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function joinRemotePath(base, part) {
    const cleanBase = normalizeRemotePath(base);
    return normalizeRemotePath(cleanBase === '/' ? `/${part}` : `${cleanBase}/${part}`);
}

function parentRemotePath(remotePath) {
    const clean = normalizeRemotePath(remotePath);
    if (clean === '/') return '/';
    const parts = clean.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? `/${parts.join('/')}` : '/';
}

function renderRemoteDirectoryList(directories) {
    remoteList.replaceChildren();
    if (!directories?.length) {
        const empty = document.createElement('div');
        empty.className = 'info';
        empty.innerText = 'Nenhuma subpasta encontrada neste diretório.';
        remoteList.appendChild(empty);
        return;
    }
    directories.forEach(directoryName => {
        const button = document.createElement('button');
        button.className = 'remote-item';
        button.innerText = directoryName;
        button.onclick = () => loadRemoteDirectory(joinRemotePath(remotePickerState.currentPath, directoryName));
        remoteList.appendChild(button);
    });
}

async function loadRemoteDirectory(remotePath) {
    const requestId = ++remotePickerState.requestId;
    remoteList.innerHTML = '<div class="info">Carregando pastas remotas...</div>';
    let result;
    try {
        result = await api.listRemoteDirectories({
            config: collectConnectionConfig(), path: remotePath
        });
    } catch (error) { result = { ok: false, message: error.message }; }
    if (requestId !== remotePickerState.requestId) return;
    if (!result.ok) { alert(result.message); closeRemotePicker(); return; }
    remotePickerState.currentPath = normalizeRemotePath(result.currentPath);
    remoteCurrentPath.innerText = remotePickerState.currentPath;
    renderRemoteDirectoryList(result.directories);
}

async function openRemotePicker(button) {
    const config = collectConnectionConfig();
    if (!config.host || !config.user) return alert('Preencha host e usuário antes de navegar no FTP remoto.');
    const row = button.closest('.project-row');
    remotePickerState.targetInput = row.querySelector('.input-remote');
    remotePickerModal.style.display = 'block';
    await loadRemoteDirectory(remotePickerState.targetInput.value || '/');
}

function closeRemotePicker() {
    remotePickerState.requestId++;
    remotePickerModal.style.display = 'none';
    remotePickerState.targetInput = null;
    remotePickerState.currentPath = '/';
    remoteCurrentPath.innerText = '/';
    remoteList.replaceChildren();
}

async function remotePickerGoUp() {
    await loadRemoteDirectory(parentRemotePath(remotePickerState.currentPath));
}

function confirmRemotePickerSelection() {
    if (remotePickerState.targetInput) remotePickerState.targetInput.value = remotePickerState.currentPath;
    closeRemotePicker();
}

function collectConnectionConfig() {
    return {
        host: document.getElementById('host').value.trim(),
        user: document.getElementById('user').value.trim(),
        password: document.getElementById('password').value,
        port: document.getElementById('port').value
    };
}

function collectConfig() {
    const config = { ...collectConnectionConfig(), projects: [] };
    document.querySelectorAll('.project-row').forEach(row => {
        const local = row.querySelector('.input-local').value.trim();
        const remote = row.querySelector('.input-remote').value.trim();
        if (local && remote) config.projects.push({ local, remote });
    });
    return config;
}

function setSyncUiRunning(running) {
    btnStart.style.display = running ? 'none' : 'block';
    btnStop.style.display = running ? 'block' : 'none';
    document.querySelectorAll('input, .btn-remove, .btn-add, .btn-folder, .btn-test, .btn-remote-folder')
        .forEach(element => { element.disabled = running; });
}

async function testCredentials() {
    const config = collectConnectionConfig();
    if (!config.host || !config.user) return alert('Preencha host e usuário para testar as credenciais.');
    const originalText = btnTest.innerText;
    btnTest.disabled = true;
    btnTest.innerText = 'Testando...';
    try {
        const result = await api.testCredentials(config);
        alert(result.message);
    } catch (error) { alert(`Erro ao testar credenciais: ${error.message}`); }
    finally { btnTest.disabled = false; btnTest.innerText = originalText; }
}

async function toggleSync(start) {
    btnStart.disabled = true;
    btnStop.disabled = true;
    try {
        if (start) {
            const config = collectConfig();
            if (!config.projects.length) return alert('Adicione pelo menos um projeto válido!');
            const result = await api.startSync(config);
            setSyncUiRunning(result.ok);
            if (!result.ok) alert(result.message || 'Não foi possível iniciar a sincronização.');
        } else {
            const result = await api.stopSync();
            if (result.ok) setSyncUiRunning(false);
            else alert(result.message || 'Não foi possível parar a sincronização.');
        }
    } catch (error) { alert(`Falha ao alterar sincronização: ${error.message}`); }
    finally { btnStart.disabled = false; btnStop.disabled = false; }
}

function addLog(data) {
    pendingLogs.push(data);
    if (logFramePending) return;
    logFramePending = true;
    requestAnimationFrame(flushLogs);
}

function flushLogs() {
    logFramePending = false;
    const fragment = document.createDocumentFragment();
    for (const data of pendingLogs.splice(0)) {
        const item = document.createElement('div');
        item.className = `log-item ${data.type}`;
        item.innerText = `[${data.time}] ${data.msg}`;
        fragment.prepend(item);
    }
    logsDiv.prepend(fragment);
    while (logsDiv.children.length > MAX_LOG_ENTRIES) logsDiv.lastElementChild.remove();
}

api.onLog(addLog);
api.onSyncStateChanged(setSyncUiRunning);

document.querySelector('.btn-add').addEventListener('click', () => addProjectRow());
btnStart.addEventListener('click', () => toggleSync(true));
btnStop.addEventListener('click', () => toggleSync(false));
btnTest.addEventListener('click', testCredentials);
document.getElementById('remoteUpBtn').addEventListener('click', remotePickerGoUp);
document.getElementById('remoteCancelBtn').addEventListener('click', closeRemotePicker);
document.getElementById('remoteConfirmBtn').addEventListener('click', confirmRemotePickerSelection);
