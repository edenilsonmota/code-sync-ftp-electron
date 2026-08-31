# FTP File Synchronizer

> Ferramenta de sincronização FTP automática, agnóstica a editor.
> **Versão atual:** 1.7.1

O **FTP File Synchronizer** é um aplicativo desktop leve que monitora pastas locais e envia automaticamente arquivos alterados para um servidor FTP. Funciona com Zed, Cursor, VS Code, Sublime Text, Notepad++ ou qualquer outro editor.

<img src="Screenshot.png" alt="Screenshot do FTP File Synchronizer" width="100%"/>

## Arquitetura

O arquivo `main.js` é apenas o ponto de entrada. Os componentes do processo principal ficam separados em `src/main`:

- `application.js`: composição dos serviços e ciclo de vida do Electron;
- `config/`: identidade, validação e persistência das configurações;
- `ftp/`: operações e conexões FTP;
- `sync/`: watchers, fila e execução da sincronização;
- `ipc/`: canais entre o processo principal e a interface;
- `ui/`: gerenciamento da janela e da bandeja.

A interface fica em `src/renderer` e acessa somente a API permitida por `src/preload.js`.

As credenciais são protegidas pelo armazenamento seguro do sistema operacional quando disponível. Configurações da identidade antiga `CodeSyncFtp` são migradas automaticamente no primeiro uso.

## Funcionalidades

- Monitoramento e sincronização de arquivos em tempo real;
- sincronização inicial dos arquivos existentes;
- espelhamento de exclusões locais no servidor;
- múltiplos mapeamentos local/remoto;
- regras de arquivos ignorados por projeto;
- execução em segundo plano pela bandeja do sistema;
- suporte a Windows, Linux e macOS.

## Instalação

Acesse a página de [Releases](https://github.com/edenilsonmota/ftp-file-synchronizer/releases) e baixe o pacote correspondente ao seu sistema:

- **Windows:** `FTP File Synchronizer Setup x.x.x.exe`;
- **Linux:** `FTP File Synchronizer-x.x.x.AppImage` ou `ftp-file-synchronizer_x.x.x_amd64.deb`;
- **macOS:** `FTP File Synchronizer-x.x.x.dmg`.

## Como usar

1. Preencha host, usuário, senha e porta do FTP.
2. Adicione um projeto selecionando a pasta local e informando a pasta remota, como `/public_html/site`.
3. Clique em **INICIAR**.
4. Trabalhe normalmente no seu editor; as mudanças serão sincronizadas.

Ao fechar a janela, o aplicativo continua na bandeja. Para encerrá-lo, use a opção **Sair** no menu do ícone.

## Desenvolvimento

### Pré-requisitos

- Node.js 22.12.0 ou superior;
- npm;
- ferramentas nativas exigidas pelo Electron Builder para o sistema de destino.

Clone o projeto e instale as dependências:

```bash
git clone https://github.com/edenilsonmota/ftp-file-synchronizer.git
cd ftp-file-synchronizer
npm install
```

Para iniciar em modo de desenvolvimento:

```bash
npm start
```

Para executar as verificações automatizadas:

```bash
npm run check
npm test
```

## Builds

Gere o pacote para o sistema atual com:

```bash
npm run dist
```

Ou escolha explicitamente o destino:

```bash
npm run dist -- --win
npm run dist -- --linux
npm run dist -- --mac
```

O build deve ser feito preferencialmente no próprio sistema de destino. Builds para outras plataformas podem exigir ferramentas adicionais, como Wine para gerar o instalador Windows a partir do Linux. Os artefatos são gravados em `dist/`.

### Ícone de bandeja no GNOME

O Electron publica o ícone pelo protocolo StatusNotifierItem. Caso o GNOME não o exiba, instale e habilite o suporte a AppIndicator:

```bash
sudo apt install gnome-shell-extension-appindicator
```

Depois, habilite **AppIndicator and KStatusNotifierItem Support** (ou **Status Icons**, no GNOME 50) e reinicie a sessão gráfica.

## Agradecimentos

Projeto criado por [Edenilson Mota](https://github.com/edenilsonmota).
