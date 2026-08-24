package com.edenilson.ftpsync.sync;

import com.edenilson.ftpsync.ftp.FtpConnectionConfig;
import com.edenilson.ftpsync.ftp.FtpConnectionService;

import java.io.IOException;
import java.nio.file.FileSystems;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardWatchEventKinds;
import java.nio.file.WatchEvent;
import java.nio.file.WatchKey;
import java.nio.file.WatchService;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

public final class SynchronizationService implements AutoCloseable {

    private static final int QUEUE_CAPACITY = 1_024;
    private static final int UPLOAD_WORKERS = 1;
    private static final long FILE_QUIET_PERIOD_MILLIS = 1_000;

    private final FtpConnectionConfig connectionConfig;
    private final List<SyncMapping> mappings;
    private final Consumer<String> logger;
    private final FtpConnectionService ftpService;
    private final BlockingQueue<SyncTask> pendingFiles = new ArrayBlockingQueue<>(QUEUE_CAPACITY);
    private final Map<WatchKey, WatchedDirectory> watchedDirectories = new HashMap<>();
    private final Map<Path, Boolean> knownPaths = new ConcurrentHashMap<>();
    private final Map<Path, Long> uploadVersions = new ConcurrentHashMap<>();
    private final AtomicLong nextUploadVersion = new AtomicLong();
    private final AtomicBoolean running = new AtomicBoolean();

    private WatchService watchService;
    private ExecutorService producerExecutor;
    private ExecutorService consumerPool;
    private ScheduledExecutorService debounceScheduler;

    public SynchronizationService(
            FtpConnectionConfig connectionConfig,
            List<SyncMapping> mappings,
            Consumer<String> logger,
            FtpConnectionService ftpService
    ) {
        this.connectionConfig = connectionConfig;
        this.mappings = List.copyOf(mappings);
        this.logger = logger;
        this.ftpService = ftpService;
    }

    public synchronized void start() throws IOException {
        if (!running.compareAndSet(false, true)) {
            throw new IllegalStateException("A sincronização já está em execução.");
        }

        try {
            watchService = FileSystems.getDefault().newWatchService();
            producerExecutor = Executors.newSingleThreadExecutor(runnable ->
                    Thread.ofPlatform().name("file-watcher").unstarted(runnable));
            consumerPool = Executors.newFixedThreadPool(UPLOAD_WORKERS, runnable ->
                    Thread.ofPlatform().name("ftp-uploader-", 0).unstarted(runnable));
            debounceScheduler = Executors.newSingleThreadScheduledExecutor(runnable ->
                    Thread.ofPlatform().name("upload-debounce").unstarted(runnable));

            for (int worker = 0; worker < UPLOAD_WORKERS; worker++) {
                consumerPool.submit(this::consumeFiles);
            }
            producerExecutor.submit(this::produceFileChanges);
        } catch (RuntimeException | IOException exception) {
            stop();
            throw exception;
        }
    }

    public synchronized void stop() {
        if (!running.compareAndSet(true, false)) {
            return;
        }
        closeWatchService();
        shutdown(producerExecutor);
        shutdown(consumerPool);
        shutdown(debounceScheduler);
        pendingFiles.clear();
        watchedDirectories.clear();
        knownPaths.clear();
        uploadVersions.clear();
    }

    public boolean isRunning() {
        return running.get();
    }

    @Override
    public void close() {
        stop();
    }

    private void produceFileChanges() {
        try {
            for (SyncMapping mapping : mappings) {
                registerTree(mapping, mapping.localRoot(), false);
            }
            logger.accept("Monitoramento local ativo.");

            while (running.get()) {
                WatchKey key = watchService.take();
                WatchedDirectory watched = watchedDirectories.get(key);
                if (watched == null) {
                    key.reset();
                    continue;
                }

                for (WatchEvent<?> event : key.pollEvents()) {
                    if (event.kind() == StandardWatchEventKinds.OVERFLOW) {
                        logger.accept("Aviso: eventos de arquivos excederam o buffer do sistema.");
                        continue;
                    }

                    Path changed = watched.directory().resolve((Path) event.context()).normalize();
                    if (isIgnored(watched.mapping(), changed)) {
                        cancelScheduledUploads(changed);
                        continue;
                    }
                    if (event.kind() == StandardWatchEventKinds.ENTRY_DELETE) {
                        cancelScheduledUploads(changed);
                        boolean directory = Boolean.TRUE.equals(knownPaths.remove(changed));
                        if (directory) {
                            knownPaths.keySet().removeIf(path -> path.startsWith(changed));
                        }
                        enqueue(SyncTask.delete(watched.mapping(), changed, directory));
                    } else if (Files.isDirectory(changed)) {
                        registerTree(watched.mapping(), changed, true);
                    } else if (Files.isRegularFile(changed)) {
                        knownPaths.put(changed, false);
                        scheduleUpload(watched.mapping(), changed);
                    }
                }

                if (!key.reset()) {
                    watchedDirectories.remove(key);
                }
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        } catch (IOException exception) {
            if (running.get()) {
                logger.accept("Falha no monitoramento local: " + safeMessage(exception));
            }
        } finally {
            running.set(false);
        }
    }

    private void registerTree(SyncMapping mapping, Path root, boolean uploadExistingFiles) throws IOException {
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attributes)
                    throws IOException {
                if (isIgnored(mapping, directory)) {
                    return FileVisitResult.SKIP_SUBTREE;
                }
                WatchKey key = directory.register(
                        watchService,
                        StandardWatchEventKinds.ENTRY_CREATE,
                        StandardWatchEventKinds.ENTRY_MODIFY,
                        StandardWatchEventKinds.ENTRY_DELETE
                );
                watchedDirectories.put(key, new WatchedDirectory(mapping, directory));
                knownPaths.put(directory, true);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) throws IOException {
                if (attributes.isRegularFile() && !isIgnored(mapping, file)) {
                    knownPaths.put(file, false);
                    if (uploadExistingFiles) {
                        scheduleUpload(mapping, file);
                    }
                }
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private void enqueue(SyncTask task) throws InterruptedException {
        pendingFiles.put(task);
    }

    private void scheduleUpload(SyncMapping mapping, Path file) {
        Path normalized = file.toAbsolutePath().normalize();
        if (isIgnored(mapping, normalized)) {
            return;
        }
        long version = nextUploadVersion.incrementAndGet();
        uploadVersions.put(normalized, version);

        debounceScheduler.schedule(() -> {
            if (!running.get() || !uploadVersions.remove(normalized, version)) {
                return;
            }
            if (!Files.isRegularFile(normalized)) {
                return;
            }
            try {
                enqueue(SyncTask.upload(mapping, normalized));
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        }, FILE_QUIET_PERIOD_MILLIS, TimeUnit.MILLISECONDS);
    }

    private void cancelScheduledUploads(Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        uploadVersions.remove(normalized);
        uploadVersions.keySet().removeIf(candidate -> candidate.startsWith(normalized));
    }

    private void consumeFiles() {
        while (running.get() || !pendingFiles.isEmpty()) {
            try {
                SyncTask task = pendingFiles.poll(500, TimeUnit.MILLISECONDS);
                if (task == null) {
                    continue;
                }
                process(task);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private void process(SyncTask task) {
        if (isIgnored(task.mapping(), task.localPath())) {
            return;
        }
        try {
            if (task.operation() == SyncTask.Operation.UPLOAD) {
                if (!Files.isRegularFile(task.localPath())) {
                    return;
                }
                ftpService.upload(connectionConfig, task.localPath(), task.remoteFile());
                logger.accept("Arquivo sincronizado: " + task.localPath() + " -> " + task.remoteFile());
            } else {
                ftpService.delete(connectionConfig, task.remoteFile(), task.directory());
                logger.accept("Caminho excluído: " + task.localPath() + " -> " + task.remoteFile());
            }
        } catch (IOException exception) {
            logger.accept("Falha na sincronização: " + task.localPath() + " -> " + task.remoteFile()
                    + ", mensagem de erro: " + safeMessage(exception));
        }
    }

    private void closeWatchService() {
        if (watchService == null) {
            return;
        }
        try {
            watchService.close();
        } catch (IOException ignored) {
            // O serviço já está sendo encerrado.
        }
    }

    private void shutdown(ExecutorService executor) {
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    private String safeMessage(Throwable throwable) {
        return throwable.getMessage() == null || throwable.getMessage().isBlank()
                ? throwable.getClass().getSimpleName() : throwable.getMessage();
    }

    private boolean isIgnored(SyncMapping mapping, Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        if (!normalized.startsWith(mapping.localRoot())) {
            return true;
        }
        Path relative = mapping.localRoot().relativize(normalized);
        for (Path part : relative) {
            if (".git".equals(part.toString())) {
                return true;
            }
        }
        return false;
    }

    private record WatchedDirectory(SyncMapping mapping, Path directory) {
    }
}
