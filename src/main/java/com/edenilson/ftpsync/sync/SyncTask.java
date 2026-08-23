package com.edenilson.ftpsync.sync;

import java.nio.file.Path;

record SyncTask(Operation operation, SyncMapping mapping, Path localPath, boolean directory) {

    static SyncTask upload(SyncMapping mapping, Path localFile) {
        return new SyncTask(Operation.UPLOAD, mapping, localFile, false);
    }

    static SyncTask delete(SyncMapping mapping, Path localPath, boolean directory) {
        return new SyncTask(Operation.DELETE, mapping, localPath, directory);
    }

    String remoteFile() {
        return mapping.remotePathFor(localPath);
    }

    enum Operation {
        UPLOAD,
        DELETE
    }
}
