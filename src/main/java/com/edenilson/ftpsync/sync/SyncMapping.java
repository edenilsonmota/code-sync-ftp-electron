package com.edenilson.ftpsync.sync;

import java.nio.file.Path;

public record SyncMapping(Path localRoot, String remoteRoot) {

    public SyncMapping {
        localRoot = localRoot.toAbsolutePath().normalize();
        remoteRoot = normalizeRemoteRoot(remoteRoot);
    }

    public String remotePathFor(Path localFile) {
        String relative = localRoot.relativize(localFile.toAbsolutePath().normalize())
                .toString()
                .replace('\\', '/');
        return "/".equals(remoteRoot) ? "/" + relative : remoteRoot + "/" + relative;
    }

    private static String normalizeRemoteRoot(String value) {
        String path = value.trim().replace('\\', '/');
        path = path.startsWith("/") ? path : "/" + path;
        while (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        return path;
    }
}
