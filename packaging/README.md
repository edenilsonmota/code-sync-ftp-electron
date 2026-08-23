# Ícones de distribuição

Os ícones ficam separados dos recursos usados em tempo de execução:

- `windows/ftp-file-synchronizer.ico`: ícone multirresolução para `jpackage` no Windows.
- `linux/ftp-file-synchronizer.png`: PNG 512x512 para `jpackage` no Linux.
- `macos/AppIcon.iconset/`: fontes nos nomes e tamanhos exigidos pelo macOS.

Antes do build no macOS, gere o arquivo ICNS:

```shell
iconutil --convert icns --output packaging/macos/ftp-file-synchronizer.icns packaging/macos/AppIcon.iconset
```

O `jpackage` não produz instaladores de outras plataformas. O build Windows deve ser
executado no Windows, o build macOS no macOS e o build Linux no Linux.

Os PNGs usados pelo Swing e futuramente pelo `SystemTray` ficam em
`src/main/resources/icons/app/`. A fonte original, que não entra no JAR, fica em
`assets/icon-master.png`.
