package com.edenilson.ftpsync.ftp;

import org.apache.commons.net.ftp.FTPClient;
import org.apache.commons.net.ftp.FTP;
import org.apache.commons.net.ftp.FTPReply;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;

public final class FtpConnectionService {

    private static final int TIMEOUT_MILLIS = 10_000;

    public String test(FtpConnectionConfig config) throws IOException {
        FTPClient client = connect(config);
        try {
            String directory = client.printWorkingDirectory();
            client.logout();
            return "Conectado com sucesso" +
                    (directory == null ? "." : ". Diretório atual: " + directory);
        } finally {
            disconnect(client);
        }
    }

    public List<String> listDirectories(FtpConnectionConfig config, String path) throws IOException {
        FTPClient client = connect(config);
        try {
            var files = client.listFiles(normalizePath(path));
            if (!FTPReply.isPositiveCompletion(client.getReplyCode())) {
                throw new IOException("Não foi possível listar o diretório: " + reply(client));
            }

            return Arrays.stream(files)
                    .filter(file -> file.isDirectory())
                    .map(file -> file.getName())
                    .filter(name -> !".".equals(name) && !"..".equals(name))
                    .sorted(String.CASE_INSENSITIVE_ORDER)
                    .toList();
        } finally {
            disconnect(client);
        }
    }

    public void upload(FtpConnectionConfig config, Path localFile, String remoteFile) throws IOException {
        FTPClient client = connect(config);
        try {
            client.setFileType(FTP.BINARY_FILE_TYPE);
            ensureRemoteDirectories(client, parentOf(remoteFile));
            try (InputStream input = Files.newInputStream(localFile)) {
                if (!client.storeFile(remoteFile, input)) {
                    throw new IOException("Upload recusado pelo servidor: " + reply(client));
                }
            }
            client.logout();
        } finally {
            disconnect(client);
        }
    }

    public void delete(FtpConnectionConfig config, String remotePath, boolean directory) throws IOException {
        FTPClient client = connect(config);
        try {
            boolean deleted = directory
                    ? deleteDirectoryRecursively(client, remotePath)
                    : client.deleteFile(remotePath);
            if (!deleted && FTPReply.isNegativePermanent(client.getReplyCode())) {
                throw new IOException("Exclusão recusada pelo servidor: " + reply(client));
            }
            client.logout();
        } finally {
            disconnect(client);
        }
    }

    private boolean deleteDirectoryRecursively(FTPClient client, String directory) throws IOException {
        for (var entry : client.listFiles(directory)) {
            String name = entry.getName();
            if (".".equals(name) || "..".equals(name)) {
                continue;
            }
            String child = (directory.endsWith("/") ? directory : directory + "/") + name;
            boolean deleted = entry.isDirectory()
                    ? deleteDirectoryRecursively(client, child)
                    : client.deleteFile(child);
            if (!deleted) {
                throw new IOException("Não foi possível excluir " + child + ": " + reply(client));
            }
        }
        return client.removeDirectory(directory);
    }

    private void ensureRemoteDirectories(FTPClient client, String directory) throws IOException {
        if ("/".equals(directory)) {
            return;
        }
        String current = "";
        for (String part : directory.split("/")) {
            if (part.isBlank()) {
                continue;
            }
            current += "/" + part;
            if (!client.changeWorkingDirectory(current)
                    && !client.makeDirectory(current)
                    && !client.changeWorkingDirectory(current)) {
                throw new IOException("Não foi possível criar o diretório FTP " + current + ": " + reply(client));
            }
        }
    }

    private String parentOf(String remoteFile) {
        int separator = remoteFile.lastIndexOf('/');
        return separator <= 0 ? "/" : remoteFile.substring(0, separator);
    }

    private FTPClient connect(FtpConnectionConfig config) throws IOException {
        var client = new FTPClient();
        client.setConnectTimeout(TIMEOUT_MILLIS);
        client.setDefaultTimeout(TIMEOUT_MILLIS);
        client.setDataTimeout(Duration.ofMillis(TIMEOUT_MILLIS));

        try {
            client.connect(config.host(), config.port());
            if (!FTPReply.isPositiveCompletion(client.getReplyCode())) {
                throw new IOException("Servidor recusou a conexão: " + reply(client));
            }
            if (!client.login(config.username(), config.password())) {
                throw new IOException("Usuário ou senha inválidos: " + reply(client));
            }
            client.enterLocalPassiveMode();
            return client;
        } catch (IOException exception) {
            disconnect(client);
            throw exception;
        }
    }

    private String normalizePath(String path) {
        return path == null || path.isBlank() ? "/" : path;
    }

    private void disconnect(FTPClient client) {
        if (!client.isConnected()) {
            return;
        }
        try {
            client.disconnect();
        } catch (IOException ignored) {
            // A operação principal já terminou; não há recuperação útil aqui.
        }
    }

    private String reply(FTPClient client) {
        String value = client.getReplyString();
        return value == null ? "sem resposta do servidor" : value.strip();
    }
}
