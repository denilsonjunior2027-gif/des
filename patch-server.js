'use strict';
// Executar na raiz do projeto da plataforma. Cria backup e adiciona publicação de cenas JSON.
const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'server.js');
if (!fs.existsSync(file)) {
  console.error('ERRO: server.js não encontrado. Execute este script na pasta que contém server.js.');
  process.exit(1);
}
let code = fs.readFileSync(file, 'utf8');
if (code.includes("app.post('/api/publish-scene'")) {
  console.log('O sistema de publicação já parece estar instalado. Nenhuma alteração feita.');
  process.exit(0);
}
const backup = file + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
fs.copyFileSync(file, backup);
// Suporta a pasta usada pelo usuário: platform. Preserva o nome correto se já configurado.
code = code.replace("path.join(ROOT, 'plataforma')", "path.join(ROOT, 'platform')");
code = code.replace("app.use(express.json({ limit: '32kb' }));", "app.use(express.json({ limit: '3mb' }));");
const marker = "app.get(/.*/, (req, res) => res.sendFile(path.join(PLATFORM_DIR, 'index.html')));";
if (!code.includes(marker)) {
  console.error('ERRO: não encontrei a rota final esperada no server.js. O backup foi salvo em: ' + backup);
  console.error('Nenhuma alteração foi gravada. Envie seu server.js para adaptar o patch.');
  process.exit(2);
}
const addition = String.raw`
// ===== BLOCKWORLD: PUBLICAÇÃO E EXECUÇÃO DE CENAS =====
const PUBLISHED_DIR = path.join(ROOT, 'published');
fs.mkdirSync(PUBLISHED_DIR, { recursive: true });
function validScene(scene) {
  if (!scene || typeof scene !== 'object' || !Array.isArray(scene.objects)) return false;
  if (scene.objects.length > 500) return false;
  const allowed = new Set(['Box', 'Sphere', 'Plane', 'Cylinder']);
  for (const o of scene.objects) {
    if (!o || typeof o !== 'object' || !allowed.has(o.type)) return false;
    for (const key of ['position', 'rotation', 'scale']) {
      const v = o[key];
      if (!Array.isArray(v) || v.length !== 3 || !v.every(n => Number.isFinite(Number(n)))) return false;
    }
    if (typeof o.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(o.color)) return false;
    if (o.name !== undefined && (typeof o.name !== 'string' || o.name.length > 80)) return false;
  }
  return true;
}
app.post('/api/publish-scene', requireUser, (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const category = typeof req.body?.category === 'string' ? req.body.category : 'Outro';
  const scene = req.body?.scene;
  if (title.length < 2 || title.length > 60) return res.status(400).json({ error: 'O título deve ter de 2 a 60 caracteres.' });
  if (description.length < 5 || description.length > 500) return res.status(400).json({ error: 'A descrição deve ter de 5 a 500 caracteres.' });
  if (!validScene(scene)) return res.status(400).json({ error: 'Cena inválida. Use o formato JSON de exemplo e no máximo 500 objetos compatíveis.' });
  if (games.filter(g => g.creatorId === req.user.id).length >= 30) return res.status(429).json({ error: 'Limite de 30 publicações por conta.' });
  const id = crypto.randomUUID();
  const safeScene = { version: 1, objects: scene.objects.map(o => ({ type: o.type, name: String(o.name || o.type).slice(0,80), position: o.position.map(Number), rotation: o.rotation.map(Number), scale: o.scale.map(n => Math.max(0.05, Math.min(100, Number(n)))), color: o.color })) };
  const game = { id, title, description, category: ['Aventura','Construção','Corrida','Obby','Simulação','Outro'].includes(category) ? category : 'Outro', url: '/play/' + id, creatorId: req.user.id, creator: req.user.username, createdAt: Date.now(), published: true, icon: '🎮', sceneFile: id + '.json' };
  const scenePath = path.join(PUBLISHED_DIR, id + '.json');
  try { fs.writeFileSync(scenePath, JSON.stringify(safeScene), { flag: 'wx', mode: 0o600 }); games.unshift(game); writeJson(GAMES_FILE, games); }
  catch (e) { try { fs.unlinkSync(scenePath); } catch {} return res.status(500).json({ error: 'Não foi possível salvar a publicação.' }); }
  res.status(201).json({ game: { id, title, description, category: game.category, url: game.url, creator: game.creator, createdAt: game.createdAt, icon: game.icon, playUrl: game.url } });
});
app.get('/api/scenes/:id', (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
  const game = games.find(g => g.id === req.params.id && g.published && g.sceneFile);
  if (!game) return res.status(404).json({ error: 'Jogo publicado não encontrado.' });
  try { res.setHeader('Cache-Control', 'no-store'); res.json(JSON.parse(fs.readFileSync(path.join(PUBLISHED_DIR, game.sceneFile), 'utf8'))); }
  catch { res.status(404).json({ error: 'Os dados deste jogo não foram encontrados.' }); }
});
app.get('/play/:id', (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).send('ID inválido.');
  const game = games.find(g => g.id === req.params.id && g.published && g.sceneFile);
  if (!game) return res.status(404).send('Jogo publicado não encontrado.');
  res.sendFile(path.join(PLATFORM_DIR, 'play.html'));
});
// ===== FIM BLOCKWORLD: PUBLICAÇÃO =====

`;
code = code.replace(marker, addition + '\n' + marker);
fs.writeFileSync(file, code, 'utf8');
console.log('Publicação de cenas instalada!');
console.log('Backup original: ' + backup);
console.log('Confirme que a pasta platform contém publish.html, publish.js, play.html e play.js.');
