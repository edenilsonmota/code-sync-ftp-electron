package com.edenilson.ftpsync.ui;

import javax.swing.SwingUtilities;
import java.awt.AWTException;
import java.awt.MenuItem;
import java.awt.PopupMenu;
import java.awt.SystemTray;
import java.awt.TrayIcon;

final class ApplicationTray implements AutoCloseable {

    private final SystemTray systemTray;
    private final TrayIcon trayIcon;

    private ApplicationTray(SystemTray systemTray, TrayIcon trayIcon) {
        this.systemTray = systemTray;
        this.trayIcon = trayIcon;
    }

    static ApplicationTray create(Runnable openAction, Runnable exitAction) {
        if (!SystemTray.isSupported()) {
            return null;
        }

        var image = ApplicationIcons.loadTrayIcon();
        if (image.isEmpty()) {
            return null;
        }

        var openItem = new MenuItem("Abrir");
        openItem.addActionListener(event -> SwingUtilities.invokeLater(openAction));
        var exitItem = new MenuItem("Sair");
        exitItem.addActionListener(event -> SwingUtilities.invokeLater(exitAction));

        var menu = new PopupMenu();
        menu.add(openItem);
        menu.addSeparator();
        menu.add(exitItem);

        var icon = new TrayIcon(image.get(), "FTP File Synchronizer", menu);
        icon.setImageAutoSize(true);
        icon.addActionListener(event -> SwingUtilities.invokeLater(openAction));

        var tray = SystemTray.getSystemTray();
        try {
            tray.add(icon);
            return new ApplicationTray(tray, icon);
        } catch (AWTException | SecurityException exception) {
            return null;
        }
    }

    void notifyHidden() {
        trayIcon.displayMessage(
                "FTP File Synchronizer",
                "O aplicativo continua executando na bandeja.",
                TrayIcon.MessageType.INFO);
    }

    @Override
    public void close() {
        systemTray.remove(trayIcon);
    }
}
