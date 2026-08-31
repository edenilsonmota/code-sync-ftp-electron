const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { validateConfig, validateConnection } = require('../src/main/ipc/register-handlers');

test('valida conexão e converte porta', () => {
    assert.deepEqual(validateConnection({ host: ' ftp.example ', user: ' user ', password: 'x', port: '21' }), {
        host: 'ftp.example', user: 'user', password: 'x', port: 21
    });
    assert.throws(() => validateConnection({ host: '', user: 'user', port: 21 }));
    assert.throws(() => validateConnection({ host: 'host', user: 'user', port: 70000 }));
});

test('valida diretório local', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-sync-'));
    try {
        const config = validateConfig({
            host: 'host', user: 'user', password: '', port: 21,
            projects: [{ local: directory, remote: '/site' }]
        });
        assert.equal(config.projects[0].local, path.resolve(directory));
        assert.deepEqual(config.projects[0], { local: path.resolve(directory), remote: '/site' });
    } finally { fs.rmSync(directory, { recursive: true }); }
});
