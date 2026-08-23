package com.edenilson.ftpsync.ftp;

public record FtpConnectionConfig(
        String host,
        int port,
        String username,
        String password
) {
}
