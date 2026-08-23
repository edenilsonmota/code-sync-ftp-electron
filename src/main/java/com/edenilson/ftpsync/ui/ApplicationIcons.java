package com.edenilson.ftpsync.ui;

import javax.imageio.ImageIO;
import java.awt.Image;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public final class ApplicationIcons {

    private static final int[] WINDOW_ICON_SIZES = {16, 20, 24, 32, 48, 64, 128, 256, 512};

    private ApplicationIcons() {
    }

    public static List<Image> loadWindowIcons() {
        var icons = new ArrayList<Image>();
        for (int size : WINDOW_ICON_SIZES) {
            loadIcon(size).ifPresent(icons::add);
        }
        return List.copyOf(icons);
    }

    public static Optional<Image> loadTrayIcon() {
        return loadIcon(32).or(() -> loadIcon(48));
    }

    private static Optional<Image> loadIcon(int size) {
        String resource = "/icons/app/icon-" + size + ".png";
        try (InputStream input = ApplicationIcons.class.getResourceAsStream(resource)) {
            return input == null ? Optional.empty() : Optional.ofNullable(ImageIO.read(input));
        } catch (IOException ignored) {
            return Optional.empty();
        }
    }
}
