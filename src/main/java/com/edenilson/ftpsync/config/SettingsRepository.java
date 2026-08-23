package com.edenilson.ftpsync.config;

import com.edenilson.ftpsync.sync.SyncMapping;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermission;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Properties;
import java.util.Set;

public final class SettingsRepository {

    private static final Set<PosixFilePermission> DIRECTORY_PERMISSIONS = EnumSet.of(
            PosixFilePermission.OWNER_READ,
            PosixFilePermission.OWNER_WRITE,
            PosixFilePermission.OWNER_EXECUTE
    );
    private static final Set<PosixFilePermission> FILE_PERMISSIONS = EnumSet.of(
            PosixFilePermission.OWNER_READ,
            PosixFilePermission.OWNER_WRITE
    );

    private final Path configFile = resolveConfigDirectory().resolve("config.properties");
    private final SecureCredentialStore credentialStore;

    public SettingsRepository(SecureCredentialStore credentialStore) {
        this.credentialStore = credentialStore;
    }

    public Optional<AppSettings> load() throws IOException {
        if (!Files.isRegularFile(configFile)) {
            return Optional.empty();
        }

        Properties properties = loadProperties();

        String url = properties.getProperty("ftp.url", "");
        int port = parsePort(properties.getProperty("ftp.port", "21"));
        String username = properties.getProperty("ftp.username", "");
        String password = credentialStore.load().orElse("");
        int count = parseCount(properties.getProperty("mapping.count", "0"));
        var mappings = new ArrayList<SyncMapping>();
        for (int index = 0; index < count; index++) {
            String local = properties.getProperty("mapping." + index + ".local", "");
            String remote = properties.getProperty("mapping." + index + ".remote", "/");
            if (!local.isBlank()) {
                mappings.add(new SyncMapping(Path.of(local), remote));
            }
        }
        return Optional.of(new AppSettings(url, port, username, password, mappings,
                appearanceFrom(properties)));
    }

    public AppearanceSettings loadAppearance() {
        if (!Files.isRegularFile(configFile)) {
            return AppearanceSettings.DEFAULT;
        }
        try {
            return appearanceFrom(loadProperties());
        } catch (IOException exception) {
            return AppearanceSettings.DEFAULT;
        }
    }

    public void save(AppSettings settings) throws IOException {
        Path directory = configFile.getParent();
        Files.createDirectories(directory);
        setPermissions(directory, DIRECTORY_PERMISSIONS);

        var properties = new Properties();
        properties.setProperty("ftp.url", settings.url());
        properties.setProperty("ftp.port", Integer.toString(settings.port()));
        properties.setProperty("ftp.username", settings.username());
        properties.setProperty("appearance.theme", settings.appearance().theme().name());
        properties.setProperty("appearance.fontSize", Integer.toString(settings.appearance().fontSize()));
        properties.setProperty("mapping.count", Integer.toString(settings.mappings().size()));
        for (int index = 0; index < settings.mappings().size(); index++) {
            SyncMapping mapping = settings.mappings().get(index);
            properties.setProperty("mapping." + index + ".local", mapping.localRoot().toString());
            properties.setProperty("mapping." + index + ".remote", mapping.remoteRoot());
        }

        Path temporary = Files.createTempFile(directory, "config-", ".tmp");
        setPermissions(temporary, FILE_PERMISSIONS);
        try {
            try (OutputStream output = Files.newOutputStream(temporary)) {
                properties.store(output, "FTP File Synchronizer - a senha fica no cofre do sistema");
            }
            moveAtomically(temporary, configFile);
            setPermissions(configFile, FILE_PERMISSIONS);
            credentialStore.save(settings.password());
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    public Path configFile() {
        return configFile;
    }

    private Properties loadProperties() throws IOException {
        var properties = new Properties();
        try (InputStream input = Files.newInputStream(configFile)) {
            properties.load(input);
        }
        return properties;
    }

    private AppearanceSettings appearanceFrom(Properties properties) {
        AppearanceSettings.Theme theme;
        try {
            theme = AppearanceSettings.Theme.valueOf(
                    properties.getProperty("appearance.theme", "DARK").toUpperCase());
        } catch (IllegalArgumentException exception) {
            theme = AppearanceSettings.Theme.DARK;
        }
        int fontSize;
        try {
            fontSize = Integer.parseInt(properties.getProperty("appearance.fontSize", "14"));
        } catch (NumberFormatException exception) {
            fontSize = 14;
        }
        return new AppearanceSettings(theme, fontSize);
    }

    private void moveAtomically(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private void setPermissions(Path path, Set<PosixFilePermission> permissions) throws IOException {
        try {
            Files.setPosixFilePermissions(path, permissions);
        } catch (UnsupportedOperationException ignored) {
            // Windows e alguns sistemas não oferecem permissões POSIX.
        }
    }

    private int parsePort(String value) {
        try {
            int port = Integer.parseInt(value);
            return port >= 1 && port <= 65_535 ? port : 21;
        } catch (NumberFormatException exception) {
            return 21;
        }
    }

    private int parseCount(String value) {
        try {
            return Math.max(0, Integer.parseInt(value));
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private static Path resolveConfigDirectory() {
        String os = System.getProperty("os.name", "").toLowerCase();
        String userHome = System.getProperty("user.home");
        if (os.contains("win")) {
            String appData = System.getenv("APPDATA");
            return Path.of(appData == null || appData.isBlank() ? userHome : appData, "FTP File Synchronizer");
        }
        if (os.contains("mac")) {
            return Path.of(userHome, "Library", "Application Support", "FTP File Synchronizer");
        }
        String xdgConfig = System.getenv("XDG_CONFIG_HOME");
        return Path.of(xdgConfig == null || xdgConfig.isBlank() ? userHome + "/.config" : xdgConfig,
                "ftp-file-synchronizer");
    }
}
