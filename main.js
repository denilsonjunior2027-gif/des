
const { app, BrowserWindow } = require("electron");
const path = require("path");

function criarJanela() {
  const janela = new BrowserWindow({
    width: 1450,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    title: "BlockWorld Studio",
    backgroundColor: "#101522",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  janela.loadFile(path.join(__dirname, "index.html"));

  janela.webContents.on("did-fail-load", (_event, codigo, descricao) => {
    console.error("Falha ao abrir a interface:", codigo, descricao);
  });
}

app.whenReady().then(() => {
  criarJanela();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
