package com.edenilson.ftpsync.ui;

import com.edenilson.ftpsync.config.AppSettings;
import com.edenilson.ftpsync.config.AppearanceSettings;
import com.edenilson.ftpsync.config.SecureCredentialStore;
import com.edenilson.ftpsync.config.SettingsRepository;
import com.edenilson.ftpsync.ftp.FtpConnectionConfig;
import com.edenilson.ftpsync.ftp.FtpConnectionService;
import com.edenilson.ftpsync.sync.SyncMapping;
import com.edenilson.ftpsync.sync.SynchronizationService;

import javax.swing.*;
import java.awt.*;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.io.File;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ExecutionException;

public final class FtpConnectionFrame extends JFrame {

    private static final DateTimeFormatter LOG_TIME = DateTimeFormatter.ofPattern("HH:mm:ss");

    private final JTextField urlField = new JTextField("ftp://localhost", 25);
    private final JSpinner portField = new JSpinner(new SpinnerNumberModel(21, 1, 65_535, 1));
    private final JTextField usernameField = new JTextField(18);
    private final JPasswordField passwordField = new JPasswordField(18);
    private final JButton connectButton = new JButton("Testar conexão");
    private final JLabel connectionStatus = new JLabel("Não conectado");
    private final JPanel mappingsPanel = new JPanel();
    private final List<PathMappingRow> mappingRows = new ArrayList<>();
    private final JButton addProjectButton = new JButton("Adicionar projeto");
    private final JButton synchronizeButton = new JButton("Sincronizar");
    private final JButton stopButton = new JButton("Parar");
    private final JTextArea logArea = new JTextArea();
    private final FtpConnectionService connectionService = new FtpConnectionService();
    private final SettingsRepository settingsRepository =
            new SettingsRepository(new SecureCredentialStore());
    private AppearanceSettings appearance = AppearanceSettings.DEFAULT;
    private SynchronizationService synchronizationService;

    public FtpConnectionFrame() {
        super("FTP File Synchronizer");
        setIconImages(ApplicationIcons.loadWindowIcons());
        setDefaultCloseOperation(WindowConstants.EXIT_ON_CLOSE);
        setMinimumSize(new Dimension(850, 650));
        setSize(950, 760);
        createContent();
        if (!loadSettings()) {
            addMappingRow();
        }
        connectEvents();
        addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent event) {
                saveSettings();
                stopSynchronization();
            }
        });
        setLocationRelativeTo(null);
    }

    private void createContent() {
        var title = new JLabel("FTP File Synchronizer");
        title.putClientProperty("FlatLaf.styleClass", "h1");
        var settingsButton = new JButton("Configurações");
        settingsButton.addActionListener(event -> openSettings());
        var header = new JPanel(new BorderLayout());
        header.add(title, BorderLayout.WEST);
        header.add(settingsButton, BorderLayout.EAST);

        mappingsPanel.setLayout(new BoxLayout(mappingsPanel, BoxLayout.Y_AXIS));
        var mappingsScroll = new JScrollPane(mappingsPanel);
        mappingsScroll.setBorder(BorderFactory.createTitledBorder("Projetos monitorados"));

        logArea.setEditable(false);
        logArea.setLineWrap(true);
        logArea.setWrapStyleWord(true);
        applyLogFont();
        var logScroll = new JScrollPane(logArea);
        logScroll.setBorder(BorderFactory.createEmptyBorder());
        var clearLogsButton = new JButton("Limpar logs");
        clearLogsButton.addActionListener(event -> logArea.setText(""));
        var logToolbar = new JPanel(new FlowLayout(FlowLayout.RIGHT, 0, 0));
        logToolbar.add(clearLogsButton);
        var logPanel = new JPanel(new BorderLayout(0, 6));
        logPanel.setBorder(BorderFactory.createTitledBorder("Logs"));
        logPanel.add(logToolbar, BorderLayout.NORTH);
        logPanel.add(logScroll, BorderLayout.CENTER);

        var splitPane = new JSplitPane(JSplitPane.VERTICAL_SPLIT, mappingsScroll, logPanel);
        splitPane.setResizeWeight(0.55);
        splitPane.setBorder(null);

        var center = new JPanel(new BorderLayout(0, 12));
        center.add(createConnectionPanel(), BorderLayout.NORTH);
        center.add(splitPane, BorderLayout.CENTER);
        center.add(createActionsPanel(), BorderLayout.SOUTH);

        var content = new JPanel(new BorderLayout(0, 16));
        content.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));
        content.add(header, BorderLayout.NORTH);
        content.add(center, BorderLayout.CENTER);
        setContentPane(content);
    }

    private JPanel createConnectionPanel() {
        var panel = new JPanel(new GridBagLayout());
        panel.setBorder(BorderFactory.createTitledBorder("Servidor FTP"));
        addField(panel, 0, 0, "URL", urlField, 1.0);
        addField(panel, 2, 0, "Porta", portField, 0.0);
        addField(panel, 0, 1, "Usuário", usernameField, 0.5);
        addField(panel, 2, 1, "Senha", passwordField, 0.5);

        var actions = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        actions.add(connectionStatus);
        actions.add(connectButton);
        var constraints = constraints(0, 2);
        constraints.gridwidth = 4;
        constraints.anchor = GridBagConstraints.LINE_END;
        panel.add(actions, constraints);
        return panel;
    }

    private JPanel createActionsPanel() {
        var panel = new JPanel(new BorderLayout());
        addProjectButton.addActionListener(event -> addMappingRow());
        panel.add(addProjectButton, BorderLayout.WEST);

        stopButton.setEnabled(false);
        styleSuccessButton(synchronizeButton);
        styleDangerButton(stopButton);
        var right = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        right.add(stopButton);
        right.add(synchronizeButton);
        panel.add(right, BorderLayout.EAST);
        return panel;
    }

    private void connectEvents() {
        connectButton.addActionListener(event -> testConnection());
        synchronizeButton.addActionListener(event -> startSynchronization());
        stopButton.addActionListener(event -> stopSynchronization());
        getRootPane().setDefaultButton(connectButton);
    }

    private void addMappingRow() {
        var row = new PathMappingRow();
        mappingRows.add(row);
        mappingsPanel.add(row);
        mappingsPanel.add(Box.createVerticalStrut(8));
        mappingsPanel.revalidate();
        mappingsPanel.repaint();
    }

    private void removeMappingRow(PathMappingRow row) {
        if (mappingRows.size() == 1) {
            appendLog("Mantenha ao menos um projeto para sincronização.");
            return;
        }
        mappingRows.remove(row);
        mappingsPanel.remove(row);
        mappingsPanel.revalidate();
        mappingsPanel.repaint();
    }

    private void testConnection() {
        FtpConnectionConfig config;
        try {
            config = readConnectionConfig();
        } catch (IllegalArgumentException exception) {
            showConnectionError(exception.getMessage());
            return;
        }
        setConnectionWorking(true);

        new SwingWorker<String, Void>() {
            @Override
            protected String doInBackground() throws Exception {
                return connectionService.test(config);
            }

            @Override
            protected void done() {
                try {
                    String message = get();
                    connectionStatus.setForeground(new Color(70, 180, 90));
                    connectionStatus.setText("Conectado");
                    appendLog("Conexão estabelecida: " + message);
                    saveSettings();
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    showConnectionError("Teste de conexão interrompido.");
                } catch (ExecutionException exception) {
                    showConnectionError(safeMessage(exception.getCause()));
                } finally {
                    setConnectionWorking(false);
                }
            }
        }.execute();
    }

    private void browseRemote(PathMappingRow row) {
        try {
            FtpConnectionConfig config = readConnectionConfig();
            RemoteDirectoryDialog.show(this, config, row.remotePath(), connectionService)
                    .ifPresent(row::setRemotePath);
        } catch (IllegalArgumentException exception) {
            showConnectionError(exception.getMessage());
        }
    }

    private void startSynchronization() {
        FtpConnectionConfig config;
        List<SyncMapping> mappings;
        try {
            config = readConnectionConfig();
            mappingRows.forEach(PathMappingRow::validatePaths);
            mappings = mappingRows.stream().map(PathMappingRow::mapping).toList();
        } catch (IllegalArgumentException exception) {
            appendLog("Falha ao iniciar sincronização: " + exception.getMessage());
            return;
        }

        try {
            synchronizationService = new SynchronizationService(
                    config, mappings, this::appendLog, connectionService);
            synchronizationService.start();
            synchronizeButton.setEnabled(false);
            stopButton.setEnabled(true);
            setConfigurationEnabled(false);
            appendLog("Sincronização iniciada para " + mappings.size() + " projeto(s).");
            mappings.forEach(mapping -> appendLog(
                    "Monitorando " + mapping.localRoot() + " -> " + mapping.remoteRoot()));
            saveSettings();
        } catch (Exception exception) {
            synchronizationService = null;
            appendLog("Falha ao iniciar sincronização: " + safeMessage(exception));
        }
    }

    private void stopSynchronization() {
        if (synchronizationService == null) {
            return;
        }
        synchronizationService.stop();
        synchronizationService = null;
        stopButton.setEnabled(false);
        synchronizeButton.setEnabled(true);
        setConfigurationEnabled(true);
        appendLog("Sincronização parada.");
    }

    private boolean loadSettings() {
        try {
            var saved = settingsRepository.load();
            if (saved.isEmpty()) {
                return false;
            }
            AppSettings settings = saved.get();
            urlField.setText(settings.url());
            portField.setValue(settings.port());
            usernameField.setText(settings.username());
            passwordField.setText(settings.password());
            appearance = settings.appearance();
            applyLogFont();
            settings.mappings().forEach(this::addMappingRow);
            appendLog("Configurações carregadas de " + settingsRepository.configFile());
            return !settings.mappings().isEmpty();
        } catch (Exception exception) {
            appendLog("Não foi possível carregar as configurações: " + safeMessage(exception));
            return false;
        }
    }

    private void saveSettings() {
        char[] password = passwordField.getPassword();
        try {
            List<SyncMapping> mappings = mappingRows.stream()
                    .filter(row -> !row.localPath().isBlank())
                    .map(PathMappingRow::mapping)
                    .toList();
            settingsRepository.save(new AppSettings(
                    urlField.getText().trim(),
                    (int) portField.getValue(),
                    usernameField.getText().trim(),
                    new String(password),
                    mappings,
                    appearance
            ));
        } catch (Exception exception) {
            appendLog("Não foi possível salvar as configurações com segurança: " + safeMessage(exception));
        } finally {
            Arrays.fill(password, '\0');
        }
    }

    private void setConfigurationEnabled(boolean enabled) {
        urlField.setEnabled(enabled);
        portField.setEnabled(enabled);
        usernameField.setEnabled(enabled);
        passwordField.setEnabled(enabled);
        connectButton.setEnabled(enabled);
        addProjectButton.setEnabled(enabled);
        mappingRows.forEach(row -> row.setInputsEnabled(enabled));
    }

    private void openSettings() {
        new SettingsDialog(this, appearance, selected -> {
            appearance = selected;
            AppearanceManager.apply(selected, true);
            applyLogFont();
            saveSettings();
            appendLog("Aparência atualizada: tema " + selected.theme()
                    + ", fonte " + selected.fontSize() + " pt.");
        }).setVisible(true);
    }

    private void styleSuccessButton(JButton button) {
        button.putClientProperty("FlatLaf.style",
                "background: #2E7D32; foreground: #FFFFFF;"
                        + "hoverBackground: #388E3C; pressedBackground: #1B5E20;"
                        + "disabledBackground: #365A39; disabledText: #A8A8A8");
    }

    private void applyLogFont() {
        logArea.setFont(new Font(Font.MONOSPACED, Font.PLAIN, appearance.fontSize()));
    }

    private void styleDangerButton(JButton button) {
        button.putClientProperty("FlatLaf.style",
                "background: #C62828; foreground: #FFFFFF;"
                        + "hoverBackground: #D32F2F; pressedBackground: #8E0000;"
                        + "disabledBackground: #613737; disabledText: #A8A8A8");
    }

    private FtpConnectionConfig readConnectionConfig() {
        String host = extractHost(urlField.getText());
        String username = usernameField.getText().trim();
        if (username.isBlank()) {
            throw new IllegalArgumentException("Informe o usuário.");
        }
        char[] password = passwordField.getPassword();
        try {
            return new FtpConnectionConfig(host, (int) portField.getValue(), username, new String(password));
        } finally {
            Arrays.fill(password, '\0');
        }
    }

    private String extractHost(String value) {
        String input = value.trim();
        if (input.isEmpty()) {
            throw new IllegalArgumentException("Informe a URL do servidor.");
        }
        if (!input.contains("://")) {
            return input;
        }
        try {
            URI uri = URI.create(input);
            if ("ftp".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null) {
                return uri.getHost();
            }
        } catch (IllegalArgumentException ignored) {
            // A mensagem amigável abaixo é suficiente para a interface.
        }
        throw new IllegalArgumentException("Use uma URL como ftp://servidor.com.");
    }

    private void setConnectionWorking(boolean working) {
        connectButton.setEnabled(!working);
        connectButton.setText(working ? "Conectando..." : "Testar conexão");
        if (working) {
            connectionStatus.setForeground(null);
            connectionStatus.setText("Conectando...");
        }
    }

    private void showConnectionError(String message) {
        connectionStatus.setForeground(new Color(220, 80, 80));
        connectionStatus.setText("Falha na conexão");
        appendLog("Falha na conexão: " + message);
        setConnectionWorking(false);
    }

    private void appendLog(String message) {
        if (!SwingUtilities.isEventDispatchThread()) {
            SwingUtilities.invokeLater(() -> appendLog(message));
            return;
        }
        logArea.append("[" + LocalTime.now().format(LOG_TIME) + "] " + message + System.lineSeparator());
        logArea.setCaretPosition(logArea.getDocument().getLength());
    }

    private void addField(JPanel panel, int column, int row, String label, Component input, double weight) {
        var labelConstraints = constraints(column, row);
        labelConstraints.anchor = GridBagConstraints.LINE_START;
        panel.add(new JLabel(label), labelConstraints);
        var inputConstraints = constraints(column + 1, row);
        inputConstraints.fill = GridBagConstraints.HORIZONTAL;
        inputConstraints.weightx = weight;
        panel.add(input, inputConstraints);
    }

    private void addMappingRow(SyncMapping mapping) {
        var row = new PathMappingRow();
        row.localPathField.setText(mapping.localRoot().toString());
        row.remotePathField.setText(mapping.remoteRoot());
        mappingRows.add(row);
        mappingsPanel.add(row);
        mappingsPanel.add(Box.createVerticalStrut(8));
    }

    private GridBagConstraints constraints(int column, int row) {
        var constraints = new GridBagConstraints();
        constraints.gridx = column;
        constraints.gridy = row;
        constraints.insets = new Insets(5, 6, 5, 6);
        return constraints;
    }

    private String safeMessage(Throwable throwable) {
        return throwable == null || throwable.getMessage() == null || throwable.getMessage().isBlank()
                ? "erro desconhecido" : throwable.getMessage();
    }

    private final class PathMappingRow extends JPanel {
        private final JTextField localPathField = new JTextField();
        private final JTextField remotePathField = new JTextField("/");

        private PathMappingRow() {
            super(new GridBagLayout());
            setAlignmentX(Component.LEFT_ALIGNMENT);
            setMaximumSize(new Dimension(Integer.MAX_VALUE, 105));
            setBorder(BorderFactory.createCompoundBorder(
                    BorderFactory.createLineBorder(new Color(90, 90, 90)),
                    BorderFactory.createEmptyBorder(8, 8, 8, 8)));

            var localButton = new JButton("Escolher...");
            localButton.addActionListener(event -> chooseLocalDirectory());
            var remoteButton = new JButton("Explorar FTP...");
            remoteButton.addActionListener(event -> browseRemote(this));
            var removeButton = new JButton("Remover");
            styleDangerButton(removeButton);
            removeButton.addActionListener(event -> removeMappingRow(this));

            addMappingField(0, "Caminho local", localPathField, localButton);
            addMappingField(1, "Caminho FTP", remotePathField, remoteButton);
            add(removeButton, constraints(3, 1));
        }

        private void addMappingField(int row, String label, JTextField field, JButton button) {
            var labelConstraints = constraints(0, row);
            labelConstraints.anchor = GridBagConstraints.LINE_START;
            add(new JLabel(label), labelConstraints);
            var fieldConstraints = constraints(1, row);
            fieldConstraints.weightx = 1;
            fieldConstraints.fill = GridBagConstraints.HORIZONTAL;
            add(field, fieldConstraints);
            add(button, constraints(2, row));
        }

        private void chooseLocalDirectory() {
            var chooser = new JFileChooser();
            chooser.setDialogTitle("Selecionar pasta local");
            chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
            if (!localPathField.getText().isBlank()) {
                chooser.setCurrentDirectory(new File(localPathField.getText()));
            }
            if (chooser.showOpenDialog(FtpConnectionFrame.this) == JFileChooser.APPROVE_OPTION) {
                localPathField.setText(chooser.getSelectedFile().getAbsolutePath());
            }
        }

        private void validatePaths() {
            if (localPath().isBlank()) {
                throw new IllegalArgumentException("selecione o caminho local de todos os projetos.");
            }
            if (!Files.isDirectory(Path.of(localPath()))) {
                throw new IllegalArgumentException("o caminho local não é uma pasta: " + localPath());
            }
            if (remotePath().isBlank() || !remotePath().startsWith("/")) {
                throw new IllegalArgumentException("o caminho FTP deve começar com '/'.");
            }
        }

        private SyncMapping mapping() {
            return new SyncMapping(Path.of(localPath()), remotePath());
        }

        private void setInputsEnabled(boolean enabled) {
            for (Component component : getComponents()) {
                component.setEnabled(enabled);
            }
        }

        private String localPath() { return localPathField.getText().trim(); }
        private String remotePath() { return remotePathField.getText().trim(); }
        private void setRemotePath(String path) { remotePathField.setText(path); }
    }
}
