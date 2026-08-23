# Gerando os instaladores

Ainda estou acertando a distribuição do projeto. Este arquivo reúne os comandos
que já podem ser usados para criar os pacotes em cada sistema.

Não é necessário usar Docker. Para desenvolver, basta ter o **JDK 25** e o Git.
Quem instalar um dos pacotes finais não precisará instalar Java separadamente.

Antes de empacotar, compile o projeto:

```bash
./mvnw clean package
```

No Windows, o mesmo comando é:

```powershell
.\mvnw.cmd clean package
```

As dependências e o JAR principal serão colocados em `target/jpackage-input`.

## Linux

### RPM

No Fedora, instale primeiro o `rpm-build`:

```bash
sudo dnf install rpm-build
```

Depois gere o pacote:

```bash
mkdir -p dist/linux

jpackage \
  --type rpm \
  --dest dist/linux \
  --input target/jpackage-input \
  --main-jar ftp-file-synchronizer.jar \
  --main-class com.edenilson.ftpsync.app.Main \
  --name FTPFileSynchronizer \
  --linux-package-name ftp-file-synchronizer \
  --linux-shortcut \
  --app-version 1.0.0 \
  --vendor "Edenilson Mota" \
  --description "Sincronizador de arquivos locais com FTP" \
  --icon packaging/linux/ftp-file-synchronizer.png
```

Esse comando já foi testado e gera o arquivo RPM dentro de `dist/linux`.

### DEB

No Ubuntu ou Debian, instale o `fakeroot`:

```bash
sudo apt install fakeroot
```

Use o mesmo comando do RPM, trocando `--type rpm` por `--type deb`.

### AppImage

O `jpackage` gera uma pasta executável com `--type app-image`, mas não gera o
arquivo `.AppImage`. Para isso ainda precisamos finalizar a integração com o
`appimagetool`. Os arquivos iniciais estão em `packaging/linux`.

## Windows

O instalador do Windows precisa ser gerado no próprio Windows, com JDK 25 e WiX
Toolset instalados.

No PowerShell:

```powershell
New-Item -ItemType Directory -Force dist\windows | Out-Null

jpackage `
  --type exe `
  --dest dist\windows `
  --input target\jpackage-input `
  --main-jar ftp-file-synchronizer.jar `
  --main-class com.edenilson.ftpsync.app.Main `
  --name FTPFileSynchronizer `
  --app-version 1.0.0 `
  --vendor "Edenilson Mota" `
  --icon packaging\windows\ftp-file-synchronizer.ico `
  --win-menu `
  --win-shortcut `
  --win-dir-chooser
```

Para gerar MSI, troque `--type exe` por `--type msi`.

## macOS

O pacote do macOS precisa ser gerado em um Mac. Use um JDK Intel para criar a
versão `x86_64` ou um JDK Apple Silicon para criar a versão dos Macs M1, M2, M3 e
mais recentes.

Primeiro transforme o conjunto de ícones em um arquivo `.icns`:

```bash
iconutil --convert icns \
  --output packaging/macos/ftp-file-synchronizer.icns \
  packaging/macos/AppIcon.iconset
```

Depois gere o DMG:

```bash
mkdir -p dist/macos

jpackage \
  --type dmg \
  --dest dist/macos \
  --input target/jpackage-input \
  --main-jar ftp-file-synchronizer.jar \
  --main-class com.edenilson.ftpsync.app.Main \
  --name FTPFileSynchronizer \
  --mac-package-name "FTP File Synchronizer" \
  --mac-package-identifier com.edenilson.ftpsync \
  --app-version 1.0.0 \
  --vendor "Edenilson Mota" \
  --icon packaging/macos/ftp-file-synchronizer.icns
```

Para gerar PKG, troque `--type dmg` por `--type pkg`.

## Builds no GitHub

Mais adiante podemos automatizar tudo com GitHub Actions. A ideia é usar uma
máquina para cada plataforma, porque o `jpackage` não cria instaladores de outro
sistema operacional:

- Ubuntu para DEB e AppImage;
- Fedora para RPM;
- Windows para EXE e MSI;
- macOS Intel e Apple Silicon para os dois tipos de Mac.

Os pacotes públicos para Windows e macOS também precisarão de assinatura. Isso
pode ficar para quando o projeto estiver pronto para uma release oficial.
