package com.edenilson.ftpsync.config;

import com.edenilson.ftpsync.sync.SyncMapping;

import java.util.List;

public record AppSettings(
        String url,
        int port,
        String username,
        String password,
        List<SyncMapping> mappings,
        AppearanceSettings appearance
) {
    public AppSettings {
        mappings = List.copyOf(mappings);
        appearance = appearance == null ? AppearanceSettings.DEFAULT : appearance;
    }
}
