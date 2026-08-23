package com.edenilson.ftpsync.app;

import com.edenilson.ftpsync.config.AppearanceSettings;
import com.edenilson.ftpsync.config.SecureCredentialStore;
import com.edenilson.ftpsync.config.SettingsRepository;
import com.edenilson.ftpsync.ui.AppearanceManager;
import com.edenilson.ftpsync.ui.FtpConnectionFrame;

import javax.swing.SwingUtilities;

public final class Main {

    private Main() {
    }

    public static void main(String[] args) {
        var repository = new SettingsRepository(new SecureCredentialStore());
        AppearanceSettings appearance = repository.loadAppearance();
        AppearanceManager.apply(appearance, false);
        SwingUtilities.invokeLater(() -> new FtpConnectionFrame().setVisible(true));
    }
}
