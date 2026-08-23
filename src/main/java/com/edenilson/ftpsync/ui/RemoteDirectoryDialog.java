package com.edenilson.ftpsync.ui;

import com.edenilson.ftpsync.ftp.FtpConnectionConfig;
import com.edenilson.ftpsync.ftp.FtpConnectionService;

import javax.swing.BorderFactory;
import javax.swing.DefaultListModel;
import javax.swing.JButton;
import javax.swing.JDialog;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.ListSelectionModel;
import javax.swing.SwingWorker;
import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ExecutionException;

public final class RemoteDirectoryDialog extends JDialog {

    private final FtpConnectionConfig config;
    private final FtpConnectionService service;
    private final JLabel pathLabel = new JLabel();
    private final JLabel statusLabel = new JLabel(" ");
    private final DefaultListModel<String> directoryModel = new DefaultListModel<>();
    private final JList<String> directoryList = new JList<>(directoryModel);
    private final JButton upButton = new JButton("Subir");
    private final JButton openButton = new JButton("Abrir");
    private final JButton selectButton = new JButton("Selecionar esta pasta");

    private String currentPath;
    private String selectedPath;

    private RemoteDirectoryDialog(
            JFrame owner,
            FtpConnectionConfig config,
            String initialPath,
            FtpConnectionService service
    ) {
        super(owner, "Selecionar pasta no FTP", true);
        this.config = config;
        this.service = service;
        this.currentPath = normalize(initialPath);
        createContent();
        loadDirectories();
    }

    public static Optional<String> show(
            JFrame owner,
            FtpConnectionConfig config,
            String initialPath,
            FtpConnectionService service
    ) {
        var dialog = new RemoteDirectoryDialog(owner, config, initialPath, service);
        dialog.setVisible(true);
        return Optional.ofNullable(dialog.selectedPath);
    }

    private void createContent() {
        setDefaultCloseOperation(DISPOSE_ON_CLOSE);
        setMinimumSize(new Dimension(520, 390));

        pathLabel.putClientProperty("FlatLaf.styleClass", "h3");
        directoryList.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        directoryList.addListSelectionListener(event -> updateButtons(false));
        directoryList.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseClicked(MouseEvent event) {
                if (event.getClickCount() == 2) {
                    openSelectedDirectory();
                }
            }
        });

        upButton.addActionListener(event -> navigateTo(parentOf(currentPath)));
        openButton.addActionListener(event -> openSelectedDirectory());
        selectButton.addActionListener(event -> {
            selectedPath = currentPath;
            dispose();
        });

        var header = new JPanel(new BorderLayout(8, 8));
        header.add(new JLabel("Diretório remoto atual:"), BorderLayout.NORTH);
        header.add(pathLabel, BorderLayout.CENTER);
        header.add(upButton, BorderLayout.EAST);

        var actions = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        var cancelButton = new JButton("Cancelar");
        cancelButton.addActionListener(event -> dispose());
        actions.add(statusLabel);
        actions.add(openButton);
        actions.add(cancelButton);
        actions.add(selectButton);

        var content = new JPanel(new BorderLayout(0, 12));
        content.setBorder(BorderFactory.createEmptyBorder(16, 16, 16, 16));
        content.add(header, BorderLayout.NORTH);
        content.add(new JScrollPane(directoryList), BorderLayout.CENTER);
        content.add(actions, BorderLayout.SOUTH);
        setContentPane(content);

        pack();
        setLocationRelativeTo(getOwner());
    }

    private void loadDirectories() {
        pathLabel.setText(currentPath);
        directoryModel.clear();
        statusLabel.setText("Carregando...");
        updateButtons(true);

        new SwingWorker<List<String>, Void>() {
            @Override
            protected List<String> doInBackground() throws Exception {
                return service.listDirectories(config, currentPath);
            }

            @Override
            protected void done() {
                try {
                    get().forEach(directoryModel::addElement);
                    statusLabel.setText(directoryModel.isEmpty() ? "Pasta vazia" : " ");
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    statusLabel.setText("Operação interrompida");
                } catch (ExecutionException exception) {
                    Throwable cause = exception.getCause();
                    statusLabel.setText("Erro: " + safeMessage(cause));
                } finally {
                    updateButtons(false);
                }
            }
        }.execute();
    }

    private void openSelectedDirectory() {
        String selected = directoryList.getSelectedValue();
        if (selected != null) {
            navigateTo("/".equals(currentPath) ? "/" + selected : currentPath + "/" + selected);
        }
    }

    private void navigateTo(String path) {
        currentPath = normalize(path);
        loadDirectories();
    }

    private void updateButtons(boolean loading) {
        upButton.setEnabled(!loading && !"/".equals(currentPath));
        openButton.setEnabled(!loading && directoryList.getSelectedValue() != null);
        selectButton.setEnabled(!loading);
        directoryList.setEnabled(!loading);
    }

    private String parentOf(String path) {
        int separator = path.lastIndexOf('/');
        return separator <= 0 ? "/" : path.substring(0, separator);
    }

    private String normalize(String path) {
        if (path == null || path.isBlank() || "/".equals(path.trim())) {
            return "/";
        }
        String value = path.trim().replace('\\', '/');
        value = value.startsWith("/") ? value : "/" + value;
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private String safeMessage(Throwable throwable) {
        if (throwable == null || throwable.getMessage() == null || throwable.getMessage().isBlank()) {
            return "não foi possível listar o diretório";
        }
        return throwable.getMessage();
    }
}
