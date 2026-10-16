const fs = require("fs");

const clientPath = "BlockWorld-Client/main.js";
const enginePath = "BlockWorld-Engine-V2/main.js";

function replaceOnce(source, oldText, newText, label) {
  const first = source.indexOf(oldText);
  if (first < 0 || source.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error("Trecho ausente ou ambiguo: " + label);
  }
  return source.slice(0, first) + newText +
    source.slice(first + oldText.length);
}

let client = fs.readFileSync(clientPath, "utf8");
let engine = fs.readFileSync(enginePath, "utf8");

/* CLIENT: acesso ao armazenamento protegido do Windows. */
client = replaceOnce(
  client,
  'const { app, BrowserWindow, ipcMain, shell } = require("electron");',
  'const { app, BrowserWindow, ipcMain, shell, safeStorage } = require("electron");',
  "import do Electron no Client"
);

client = replaceOnce(
  client,
  'let sessionCookie = "";',
  `let sessionCookie = "";

const SHARED_DIR = path.join(app.getPath("appData"), "BlockWorld");
const SHARED_SESSION_PATH = path.join(SHARED_DIR, "shared-session.json");

function clearSharedSession() {
  try {
    fs.unlinkSync(SHARED_SESSION_PATH);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function writeSharedSession() {
  if (!sessionCookie) {
    clearSharedSession();
    return;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("A protecao de armazenamento do Windows nao esta disponivel.");
  }

  fs.mkdirSync(SHARED_DIR, { recursive: true });

  const record = {
    version: 1,
    serverUrl: readConfig().serverUrl,
    encryptedCookie: safeStorage.encryptString(sessionCookie).toString("base64"),
    updatedAt: Date.now()
  };

  fs.writeFileSync(
    SHARED_SESSION_PATH,
    JSON.stringify(record, null, 2),
    { encoding: "utf8", mode: 0o600 }
  );
}

function restoreSharedSession(serverUrl) {
  try {
    if (!fs.existsSync(SHARED_SESSION_PATH) ||
        !safeStorage.isEncryptionAvailable()) return;

    const record = JSON.parse(fs.readFileSync(SHARED_SESSION_PATH, "utf8"));
    if (record.version !== 1 || record.serverUrl !== serverUrl ||
        typeof record.encryptedCookie !== "string") return;

    const cookie = safeStorage.decryptString(
      Buffer.from(record.encryptedCookie, "base64")
    );

    if (/^bw_session=[a-f0-9]{64}$/i.test(cookie)) {
      sessionCookie = cookie;
    }
  } catch (error) {
    console.error("[BlockWorld] Nao foi possivel recuperar a sessao compartilhada:", error.message);
  }
}

function syncSharedSession() {
  try {
    if (sessionCookie) writeSharedSession();
    else clearSharedSession();
  } catch (error) {
    console.error("[BlockWorld] Nao foi possivel sincronizar a sessao:", error.message);
  }
}`,
  "funcoes de sessao compartilhada"
);

client = replaceOnce(
  client,
  `  const config = readConfig();
  const url = new URL(route, config.serverUrl + "/");`,
  `  const config = readConfig();
  if (!sessionCookie) restoreSharedSession(config.serverUrl);
  const url = new URL(route, config.serverUrl + "/");`,
  "recuperacao da sessao antes da API"
);

client = replaceOnce(
  client,
  `  sessionCookie = "";
  return config;`,
  `  sessionCookie = "";
  clearSharedSession();
  return config;`,
  "limpeza ao mudar servidor"
);

client = replaceOnce(
  client,
  `  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}`,
  `  if (["/api/login", "/api/register", "/api/logout"].includes(route)) {
    syncSharedSession();
  }

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}

  if (route === "/api/me" && data.user === null && sessionCookie) {
    sessionCookie = "";
    clearSharedSession();
  }`,
  "sincronizacao da sessao apos autenticacao"
);

/* ENGINE: ler o mesmo arquivo e validar que o servidor e local. */
engine = replaceOnce(
  engine,
  "const { app, BrowserWindow, dialog, ipcMain } = require('electron');",
  "const { app, BrowserWindow, dialog, ipcMain, safeStorage } = require('electron');",
  "import do Electron na Engine"
);

engine = replaceOnce(
  engine,
  "let mainWindow;",
  `let mainWindow;

const SHARED_SESSION_PATH = path.join(
  app.getPath('appData'),
  'BlockWorld',
  'shared-session.json'
);

function readSharedSession() {
  try {
    if (!fs.existsSync(SHARED_SESSION_PATH) ||
        !safeStorage.isEncryptionAvailable()) return null;

    const record = JSON.parse(fs.readFileSync(SHARED_SESSION_PATH, 'utf8'));
    if (record.version !== 1 ||
        typeof record.serverUrl !== 'string' ||
        typeof record.encryptedCookie !== 'string') return null;

    const parsed = new URL(record.serverUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username || parsed.password || parsed.search || parsed.hash ||
        !['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname)) {
      return null;
    }

    const cookie = safeStorage.decryptString(
      Buffer.from(record.encryptedCookie, 'base64')
    );
    const match = cookie.match(/^bw_session=([a-f0-9]{64})$/i);
    if (!match) return null;

    return {
      serverUrl: parsed.toString().replace(/\\/+$/, ''),
      token: match[1]
    };
  } catch (error) {
    console.error('[BlockWorld Engine] Sessao compartilhada indisponivel:', error.message);
    return null;
  }
}`,
  "leitor seguro da sessao na Engine"
);

engine = replaceOnce(
  engine,
  `    try {
      await publishWindow.loadURL('http://localhost:3000/publish.html?fromEngine=1');`,
  `    try {
      const sharedSession = readSharedSession();
      const serverUrl = sharedSession
        ? sharedSession.serverUrl
        : 'http://localhost:3000';

      if (sharedSession) {
        await publishWindow.webContents.session.cookies.set({
          url: serverUrl + '/',
          name: 'bw_session',
          value: sharedSession.token,
          httpOnly: true,
          sameSite: 'lax',
          path: '/'
        });
      }

      const publishUrl = new URL(
        '/publish.html?fromEngine=1',
        serverUrl
      ).toString();

      await publishWindow.loadURL(publishUrl);`,
  "integracao com a janela de publicacao"
);

/* Validar todos os trechos antes de gravar qualquer arquivo. */
const stamp = new Date().toISOString()
  .replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");

for (const file of [clientPath, enginePath]) {
  fs.copyFileSync(file, file + ".backup-shared-login-" + stamp);
}

fs.writeFileSync(clientPath, client, "utf8");
fs.writeFileSync(enginePath, engine, "utf8");

console.log("Backups criados com o identificador: " + stamp);
console.log("Client e Engine atualizados.");
