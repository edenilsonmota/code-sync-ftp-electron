package com.edenilson.ftpsync.ui;

import com.edenilson.ftpsync.config.AppearanceSettings;

import com.formdev.flatlaf.FlatDarkLaf;
import com.formdev.flatlaf.FlatLaf;
import com.formdev.flatlaf.FlatLightLaf;

import javax.swing.UIManager;
import java.awt.Font;

public final class AppearanceManager {

    private AppearanceManager() {
    }

    public static void apply(AppearanceSettings settings, boolean updateOpenWindows) {
        if (settings.theme() == AppearanceSettings.Theme.LIGHT) {
            FlatLightLaf.setup();
        } else {
            FlatDarkLaf.setup();
        }
        UIManager.put("defaultFont", new Font(Font.SANS_SERIF, Font.PLAIN, settings.fontSize()));
        if (updateOpenWindows) {
            FlatLaf.updateUI();
        }
    }
}
