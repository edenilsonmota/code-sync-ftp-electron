const path = require('path');
const ftp = require('basic-ftp');

function connectionOptions(config) {
    return {
        host: config.host,
        user: config.user,
        password: config.password,
        port: parseInt(config.port, 10) || 21,
        secure: false
    };
}

class FtpService {
    constructor() { this.client = new ftp.Client(); }
    async connect(config) {
        if (!this.client.closed) this.client.close();
        this.client = new ftp.Client();
        await this.client.access(connectionOptions(config));
    }
    close() { this.client.close(); }

    async testConnection(config) {
        const client = new ftp.Client();
        try { await client.access(connectionOptions(config)); } finally { client.close(); }
    }

    async listDirectories(config, requestedPath) {
        const client = new ftp.Client();
        try {
            await client.access(connectionOptions(config));
            let targetPath = (requestedPath || '/').trim();
            if (!targetPath.startsWith('/')) targetPath = `/${targetPath}`;
            try { await client.cd(targetPath); } catch (_) { await client.cd('/'); }
            const currentPath = await client.pwd();
            const entries = await client.list();
            const directories = entries.filter(item => item.isDirectory)
                .map(item => item.name).filter(name => name !== '.' && name !== '..')
                .sort((a, b) => a.localeCompare(b));
            return { currentPath, directories };
        } finally { client.close(); }
    }

    async ensureConnected(config) { if (this.client.closed) await this.connect(config); }
    async upload(localPath, remotePath) {
        await this.client.ensureDir(path.posix.dirname(remotePath));
        await this.client.uploadFrom(localPath, path.posix.basename(remotePath));
    }
    async removeFile(remotePath) { await this.client.remove(remotePath); }
    async removeDirectory(remotePath) { await this.client.removeDir(remotePath); }
}

module.exports = { FtpService };
