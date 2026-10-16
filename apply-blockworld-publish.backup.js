'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const engine = path.join(root, 'BlockWorld-Engine-V2');
const files = {
  main: path.join(engine, 'main.js'),
  renderer: path.join(engine, 'renderer.js'),
  html: path.join(engine, 'index.html'),
  publish: path.join(root, 'platform', 'publish.js')
};

const original = {};
for (const [key, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error('Arquivo não encontrado: ' + file);
  original[key] = fs.readFileSync(file, 'utf8');
}

function requireOnce(source, pattern, description) {
  const matches = source.match(pattern) || [];
  if (matches.length !== 1) {
    throw new Error('Não foi possível identificar unicamente: ' + description);
  }
}

requireOnce(original.main, /const \{ app, BrowserWindow, dialog, ipcMain \} = require\('electron'\);/, 'imports do Electron');
requireOnce(original.main, /^\s*  createWindow\(\);\s*$/m, 'inicialização da janela');
requireOnce(original.renderer, /\$\('saveProjectBtn'\)\.addEventListener\('click',saveProject\);\$\('openProjectBtn'\)\.addEventListener\('click',openProject\);\$\('exportBtn'\)\.addEventListener\('click',exportScene\);/, 'eventos dos botões');
requireOnce(original.html, /<button class="btn primary" id="exportBtn"[^>]*>[\s\S]*?<\/button><\/div>/, 'barra superior');
requireOnce(original.publish, /async function api\(url, options=\{\}\)/, 'cliente da API');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backups = {};
for (const [key, file] of Object.entries(files)) {
  backups[key] = file + '.backup-' + timestamp;
}

let changed = false;

try {
  let main = original.main;
  const ipcCode = `
  ipcMain.handle('platform:publish', async (_event, project) => {
    if (!project || !Array.isArray(project.objects) || project.objects.length > 500) {
      throw new Error('Projeto inválido ou com mais de 500 objetos.');
    }

    const allowed = { cube: 'Box', sphere: 'Sphere', plane: 'Plane' };
    const objects = [];

    for (const item of project.objects) {
      const type = allowed[item.kind];
      if (!type || item.visible === false) continue;

      const vectors = [item.position, item.rotation, item.scale];
      if (!vectors.every(v => Array.isArray(v) && v.length >= 3 &&
          v.slice(0, 3).every(n => Number.isFinite(Number(n))))) continue;

      const color = /^#[0-9a-fA-F]{6}$/.test(item.color || '') ? item.color : '#6d7cff';
      const position = item.position.slice(0, 3).map(Number);
      const rotation = item.rotation.slice(0, 3).map(Number);
      const scale = item.scale.slice(0, 3).map(Number);

      if (type === 'Plane') {
        scale[0] *= 4;
        scale[2] *= 4;
      }
      if (type === 'Sphere') {
        scale[0] *= 1.3;
        scale[1] *= 1.3;
        scale[2] *= 1.3;
      }

      objects.push({
        type,
        name: String(item.name || type).slice(0, 80),
        position,
        rotation,
        scale,
        color
      });
    }

    if (objects.length === 0) {
      throw new Error('Adicione pelo menos um cubo, esfera ou plano visível antes de publicar.');
    }

    const publishWindow = new BrowserWindow({
      width: 1100,
      height: 850,
      minWidth: 760,
      minHeight: 600,
      title: 'Publicar jogo — BlockWorld',
      backgroundColor: '#0b1020',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    try {
      await publishWindow.loadURL('http://localhost:3000/publish.html?fromEngine=1');
      const sceneJson = JSON.stringify({ version: 1, objects });
      await publishWindow.webContents.executeJavaScript(
        'localStorage.setItem("bw_engine_scene", ' + JSON.stringify(sceneJson) + ');'
      );
      await publishWindow.webContents.executeJavaScript('location.reload();');
      return { opened: true };
    } catch (error) {
      if (!publishWindow.isDestroyed()) publishWindow.destroy();
      throw new Error('Não consegui abrir a plataforma. Confira se o servidor está rodando em http://localhost:3000. ' + error.message);
    }
  });
`;
  main = main.replace(/^\s*  createWindow\(\);\s*$/m, ipcCode + '\n  createWindow();');

  let renderer = original.renderer;
  const oldEvents = "$('saveProjectBtn').addEventListener('click',saveProject);$('openProjectBtn').addEventListener('click',openProject);$('exportBtn').addEventListener('click',exportScene);";
  const newEvents = oldEvents + `
  $('publishProjectBtn').addEventListener('click', async () => {
    const button = $('publishProjectBtn');
    button.disabled = true;
    try {
      await ipcRenderer.invoke('platform:publish', collectProject());
      log('Janela de publicação aberta. Entre na sua conta e preencha os dados do jogo.', 'success');
      showToast('Publicação aberta');
    } catch (error) {
      log('Falha ao abrir publicação: ' + error.message, 'error');
      showModal('Não foi possível publicar', error.message);
    } finally {
      button.disabled = false;
    }
  });`;
  renderer = renderer.replace(oldEvents, newEvents);

  let html = original.html;
  html = html.replace(
    /<button class="btn primary" id="exportBtn"[^>]*>[\s\S]*?<\/button><\/div>/,
    match => match.replace('</div>', '<button class="btn primary" id="publishProjectBtn">Publicar jogo</button></div>')
  );

  const publish = String.raw\`'use strict';
const $ = id => document.getElementById(id);
const statusBox = $('status');
const storedSceneKey = 'bw_engine_scene';
let engineScene = null;

function status(message) {
  statusBox.textContent = message;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || 'Erro HTTP ' + response.status);
  return data;
}

function readEngineScene() {
  try {
    const raw = localStorage.getItem(storedSceneKey);
    if (!raw) return null;
    const scene = JSON.parse(raw);
    if (!scene || !Array.isArray(scene.objects) || scene.objects.length < 1 || scene.objects.length > 500) {
      throw new Error('A cena enviada pela Engine não é válida.');
    }
    return scene;
  } catch (error) {
    status('Não foi possível ler a cena da Engine: ' + error.message);
    return null;
  }
}

(async () => {
  engineScene = readEngineScene();

  try {
    const { user } = await api('/api/me');
    if (!user) {
      $('account').textContent = 'Entre na sua conta da BlockWorld para publicar. ';
      const link = document.createElement('a');
      link.href = '/';
      link.textContent = 'Abrir a plataforma e entrar';
      link.style.color = '#bdb5ff';
      $('account').appendChild(link);
      status('Faça login nesta janela. Depois volte à página de publicação.');
      $('publishForm').classList.remove('hidden');
    } else {
      $('account').textContent = 'Conectado como ' + user.username;
      $('publishForm').classList.remove('hidden');
      status(engineScene
        ? 'Cena recebida da Engine. Preencha os dados e publique seu jogo.'
        : 'Escolha um arquivo JSON de cena e preencha os dados do jogo.');
    }
  } catch (error) {
    status('Não consegui conectar ao servidor: ' + error.message);
  }

  if (engineScene) {
    const file = $('sceneFile');
    file.required = false;
    const label = document.querySelector('label[for="sceneFile"]');
    if (label) label.style.display = 'none';
    file.style.display = 'none';
    const container = file.parentElement;
    if (container) container.style.display = 'none';
    const help = document.querySelector('.help');
    if (help) help.textContent = 'Cena enviada diretamente pela BlockWorld Engine.';
  }
})();

$('publishForm').addEventListener('submit', async event => {
  event.preventDefault();

  let scene = engineScene;
  const file = $('sceneFile').files[0];

  try {
    if (!scene) {
      if (!file) {
        status('Escolha um arquivo JSON de cena.');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        status('O arquivo é maior que 2 MB.');
        return;
      }
      scene = JSON.parse(await file.text());
    }

    const button = $('publishButton');
    button.disabled = true;

    try {
      const result = await api('/api/publish-scene', {
        method: 'POST',
        body: JSON.stringify({
          title: $('title').value,
          description: $('description').value,
          category: $('category').value,
          scene
        })
      });

      localStorage.removeItem(storedSceneKey);
      engineScene = null;
      status('Jogo publicado com sucesso!\\n\\nLink para jogar: ' + location.origin + result.game.playUrl);

      const link = document.createElement('a');
      link.href = result.game.playUrl;
      link.textContent = 'Abrir jogo publicado';
      link.className = 'button';
      link.style.marginTop = '12px';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      statusBox.appendChild(document.createElement('br'));
      statusBox.appendChild(link);
    } finally {
      button.disabled = false;
    }
  } catch (error) {
    status('Não foi possível publicar: ' + error.message);
  }
});
\`;

  const updates = { main, renderer, html, publish };
  for (const key of Object.keys(files)) {
    fs.copyFileSync(files[key], backups[key]);
  }

  for (const [key, content] of Object.entries(updates)) {
    fs.writeFileSync(files[key], content, 'utf8');
  }
  changed = true;

  for (const key of ['main', 'renderer', 'publish']) {
    execFileSync(process.execPath, ['--check', files[key]], { stdio: 'inherit' });
  }

  console.log('Integração instalada e sintaxe validada.');
  console.log('Backups criados:');
  for (const file of Object.values(backups)) console.log('  ' + file);
  console.log('Próximo passo: iniciar o servidor da plataforma e abrir a Engine V2.');
} catch (error) {
  console.error('ERRO: ' + error.message);
  if (changed) {
    for (const [key, file] of Object.entries(files)) {
      try { fs.writeFileSync(file, original[key], 'utf8'); } catch {}
    }
    console.error('Os arquivos originais foram restaurados.');
  } else {
    console.error('Nenhum arquivo do projeto foi alterado.');
  }
  process.exitCode = 1;
}
