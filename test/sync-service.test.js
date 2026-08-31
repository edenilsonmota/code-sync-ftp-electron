const assert = require('node:assert/strict');
const test = require('node:test');
const { SyncService, normalizeRemotePath } = require('../src/main/sync/sync-service');

function fakeWatcher() {
    return { on() { return this; }, async close() {} };
}

test('normaliza caminhos remotos', () => {
    assert.equal(normalizeRemotePath('/public_html/', 'assets\\app.js'), '/public_html/assets/app.js');
    assert.equal(normalizeRemotePath('public_html', 'index.html'), '/public_html/index.html');
    assert.throws(() => normalizeRemotePath('/public_html/../private', 'index.html'));
});

test('mantém mapeamentos com mesma origem e destinos diferentes', async () => {
    const uploads = [];
    const ftpService = {
        async ensureConnected() {},
        async upload(_local, remote) { uploads.push(remote); },
        close() {}
    };
    const service = new SyncService({ ftpService, log() {}, onStateChange() {}, watcherFactory: fakeWatcher });
    service.isSyncing = true;
    service.sessionId = 1;
    const common = { action: 'upload', fullPath: '/project/file.js', globalConfig: {}, sessionId: 1 };
    service.enqueue(common.action, common.fullPath, { local: '/project', remote: '/one' }, {}, 1);
    service.enqueue(common.action, common.fullPath, { local: '/project', remote: '/two' }, {}, 1);
    await service.processingPromise;
    assert.deepEqual(uploads.sort(), ['/one/file.js', '/two/file.js']);
});

test('não perde uma alteração ocorrida durante upload', async () => {
    let releaseFirst;
    const firstUpload = new Promise(resolve => { releaseFirst = resolve; });
    let uploads = 0;
    const ftpService = {
        async ensureConnected() {},
        async upload() { uploads++; if (uploads === 1) await firstUpload; },
        close() {}
    };
    const service = new SyncService({ ftpService, log() {}, onStateChange() {}, watcherFactory: fakeWatcher });
    service.isSyncing = true;
    service.sessionId = 1;
    const project = { local: '/project', remote: '/remote' };
    service.enqueue('upload', '/project/file.js', project, {}, 1);
    await new Promise(resolve => setImmediate(resolve));
    service.enqueue('upload', '/project/file.js', project, {}, 1);
    releaseFirst();
    await service.processingPromise;
    assert.equal(uploads, 2);
});

test('parar invalida a sessão e limpa tarefas pendentes', async () => {
    let releaseUpload;
    const pendingUpload = new Promise(resolve => { releaseUpload = resolve; });
    let uploads = 0;
    const ftpService = {
        async ensureConnected() {},
        async upload() { uploads++; await pendingUpload; },
        close() { releaseUpload?.(); }
    };
    const service = new SyncService({ ftpService, log() {}, onStateChange() {}, watcherFactory: fakeWatcher });
    service.isSyncing = true;
    service.sessionId = 1;
    const project = { local: '/project', remote: '/remote' };
    service.enqueue('upload', '/project/a.js', project, {}, 1);
    service.enqueue('upload', '/project/b.js', project, {}, 1);
    await new Promise(resolve => setImmediate(resolve));
    await service.stop();
    assert.equal(uploads, 1);
    assert.equal(service.queue.length, 0);
    assert.equal(service.getState(), false);
});
