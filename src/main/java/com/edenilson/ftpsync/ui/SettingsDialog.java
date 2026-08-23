package com.edenilson.ftpsync.ui;

import com.edenilson.ftpsync.config.AppearanceSettings;

import javax.swing.*;
import java.awt.*;
import java.util.function.Consumer;

public final class SettingsDialog extends JDialog {

    public SettingsDialog(
            JFrame owner,
            AppearanceSettings current,
            Consumer<AppearanceSettings> onApply
    ) {
        super(owner, "Configurações", true);
        setDefaultCloseOperation(DISPOSE_ON_CLOSE);
        setResizable(false);

        var themeField = new JComboBox<>(AppearanceSettings.Theme.values());
        themeField.setSelectedItem(current.theme());
        var fontSizeField = new JSpinner(new SpinnerNumberModel(
                current.fontSize(),
                AppearanceSettings.MIN_FONT_SIZE,
                AppearanceSettings.MAX_FONT_SIZE,
                1));

        var form = new JPanel(new GridBagLayout());
        addRow(form, 0, "Tema", themeField);
        addRow(form, 1, "Tamanho da fonte", fontSizeField);

        var cancelButton = new JButton("Cancelar");
        cancelButton.addActionListener(event -> dispose());
        var applyButton = new JButton("Aplicar");
        applyButton.addActionListener(event -> {
            var selected = new AppearanceSettings(
                    (AppearanceSettings.Theme) themeField.getSelectedItem(),
                    (int) fontSizeField.getValue());
            onApply.accept(selected);
            dispose();
        });

        var actions = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        actions.add(cancelButton);
        actions.add(applyButton);

        var content = new JPanel(new BorderLayout(0, 16));
        content.setBorder(BorderFactory.createEmptyBorder(20, 20, 16, 20));
        content.add(form, BorderLayout.CENTER);
        content.add(actions, BorderLayout.SOUTH);
        setContentPane(content);
        getRootPane().setDefaultButton(applyButton);

        pack();
        setMinimumSize(new Dimension(390, getHeight()));
        setLocationRelativeTo(owner);
    }

    private void addRow(JPanel panel, int row, String label, Component input) {
        var labelConstraints = new GridBagConstraints();
        labelConstraints.gridx = 0;
        labelConstraints.gridy = row;
        labelConstraints.anchor = GridBagConstraints.LINE_START;
        labelConstraints.insets = new Insets(8, 0, 8, 18);
        panel.add(new JLabel(label), labelConstraints);

        var inputConstraints = new GridBagConstraints();
        inputConstraints.gridx = 1;
        inputConstraints.gridy = row;
        inputConstraints.weightx = 1;
        inputConstraints.fill = GridBagConstraints.HORIZONTAL;
        inputConstraints.insets = new Insets(8, 0, 8, 0);
        panel.add(input, inputConstraints);
    }
}
