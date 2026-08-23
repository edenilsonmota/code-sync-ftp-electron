package com.edenilson.ftpsync.ui;

import javax.imageio.ImageIO;
import java.awt.Image;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public final class ApplicationIcons {

    private static final int[] WINDOW_ICON_SIZES = {16, 20, 24, 32, 48, 64, 128, 256, 512};

    private ApplicationIcons() {
    }

    public static List<Image> loadWindowIcons() {
        var icons = new ArrayList<Image>();
        for (int size : WINDOW_ICON_SIZES) {
            String resource = "/icons/app/icon-" + size + ".png";
            try (InputStream input = ApplicationIcons.class.getResourceAsStream(resource)) {
                if (input != null) {
                    icons.add(ImageIO.read(input));
                }
            } catch (IOException ignored) {
                // A ausência de um tamanho não impede o uso dos demais ícones.
            }
        }
        return List.copyOf(icons);
    }
}
