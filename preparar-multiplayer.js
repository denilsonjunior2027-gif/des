const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, 'backups', 'multiplayer-' + stamp);
const reportFile = path.join(ROOT, 'relatorio-multiplayer.txt');

const files = [
  'server.js',
  'platform/index.html',
  'platform/play.html',
  'platform/play.js',
  'data/games.json',
  'data/users.json',
  'package.json',
  'patch-server.js'
];

const directories = [
  'published',
  'games',
  'data/published',
  'data/games',
  'platform/games'
];

const report = [];

function log(value = '') {
  report.push(String(value));
}

function copyFile(relative) {
  const source = path.join(ROOT, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    log('NAO ENCONTRADO: ' + relative);
    return;
  }

  const destination = path.join(backupDir, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);

  const content = fs.readFileSync(source);
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  log('BACKUP OK: ' + relative);
  log('  Tamanho: ' + content.length + ' bytes');
  log('  SHA256: ' + hash);
}

function copyDirectory(relative) {
  const source = path.join(ROOT, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) return;

  const destination = path.join(backupDir, relative);
  fs.cpSync(source, destination, {
    recursive: true,
    filter: item => !item.includes(`${path.sep}node_modules${path.sep}`)
      && !item.includes(`${path.sep}backups${path.sep}`)
  });

  log('PASTA COPIADA: ' + relative);
}

function inspect(relative, patterns) {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) return;

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  log('\n========== ANALISE: ' + relative + ' ==========');
  log('Linhas: ' + lines.length);

  const selected = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (patterns.some(pattern => pattern.test(lines[i]))) {
      for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j++) {
        selected.add(j);
      }
    }
  }

  const indexes = [...selected].sort((a, b) => a - b);
  let previous = -2;

  for (const i of indexes) {
    if (i > previous + 1) log('...');
    log(String(i + 1).padStart(4, ' ') + ': ' + lines[i].slice(0, 350));
    previous = i;
  }
}

try {
  fs.mkdirSync(backupDir, { recursive: true });

  log('BLOCKWORLD - PREPARACAO DO MULTIPLAYER');
  log('Data: ' + new Date().toISOString());
  log('Pasta do projeto: ' + ROOT);
  log('Pasta de backup: ' + path.relative(ROOT, backupDir));

  log('\n========== BACKUP DOS ARQUIVOS ==========');
  for (const file of files) copyFile(file);

  log('\n========== BACKUP DOS DIRETORIOS DE JOGOS ==========');
  for (const dir of directories) copyDirectory(dir);

  inspect('server.js', [
    /const (app|server|io|rooms|games|sessions)\b/,
    /socket\.use/,
    /io\.on\(['"]connection/,
    /socket\.on\(/,
    /publish-scene|api\/scenes|\/play\/:id/,
    /setAvatar|avatarSaved|publicUser|socketUser/,
    /listen\(/
  ]);

  inspect('platform/play.js', [
    /function ensureSocket/,
    /function main/,
    /function (upsertPlayer|removePlayer|clearRoom|buildAvatar)/,
    /roomCode|bwCreate|bwJoin|bwLeave|bwCode|bwRoomStatus/,
    /setAvatar|avatarSaved|playerMoved3d|playerJoined|playerLeft/,
    /requestAnimationFrame|WebSocket|window\.io|socket\.emit/,
    /fetch\(|\/api\/scenes/
  ]);

  inspect('platform/play.html', [
    /script|three|viewport|play\.js|socket\.io|importmap/i
  ]);

  inspect('platform/index.html', [
    /data-bw-play|bwCreateGame|socket|onlineCount|jogadores|jogar/i
  ]);

  inspect('package.json', [
    /"scripts"|"start"|"dependencies"|"socket\.io"|"three"|"express"/
  ]);

  log('\n========== ARQUIVOS E PASTAS PRINCIPAIS ==========');
  for (const name of fs.readdirSync(ROOT)) {
    if (/^(data|platform|published|games|server\.js|package\.json|node_modules|backups)$/i.test(name)) {
      const full = path.join(ROOT, name);
      const stat = fs.statSync(full);
      log((stat.isDirectory() ? '[PASTA] ' : '[ARQUIVO] ') + name);
    }
  }

  fs.writeFileSync(reportFile, report.join('\n'), 'utf8');

  console.log('Analise concluida.');
  console.log('Backups: ' + path.relative(ROOT, backupDir));
  console.log('Relatorio: ' + path.relative(ROOT, reportFile));
  console.log('Nenhum arquivo original foi alterado.');
} catch (error) {
  console.error('ERRO: ' + error.stack);
  process.exitCode = 1;
}