package com.edenilson.ftpsync.config;

public record AppearanceSettings(Theme theme, int fontSize) {

    public static final int MIN_FONT_SIZE = 10;
    public static final int MAX_FONT_SIZE = 24;
    public static final AppearanceSettings DEFAULT = new AppearanceSettings(Theme.DARK, 14);

    public AppearanceSettings {
        theme = theme == null ? Theme.DARK : theme;
        fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, fontSize));
    }

    public enum Theme {
        DARK("Escuro"),
        LIGHT("Claro");

        private final String label;

        Theme(String label) {
            this.label = label;
        }

        @Override
        public String toString() {
            return label;
        }
    }
}
