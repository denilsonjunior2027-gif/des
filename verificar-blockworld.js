const fs = require('fs');

const files = [
  'platform/index.html',
  'platform/index.html.backup-20261011-115454',
  'platform/index.html.backup-catalogo-20261011-120924',
  'platform/index.html.backup-login-20261011-135517',
  'platform/index.html.bak-20261011-184751',
  'platform/index.html.before-dark-20261011-115007.bak'
];

const out = [];

for (const file of files) {
  if (!fs.existsSync(file)) {
    out.push('\nNAO ENCONTRADO: ' + file);
    continue;
  }

  const s = fs.readFileSync(file, 'utf8');
  const broken = (s.match(/Ãƒ|Ã‚|Ã°Å¸|â€|Â·/g) || []).length;

  out.push('\n=== ' + file + ' ===');
  out.push('Tamanho: ' + s.length);
  out.push('Sinais de texto corrompido: ' + broken);

  for (const term of ['bw-classic-nav', 'Obby Cl', 'bwCreateGame']) {
    const i = s.indexOf(term);
    if (i >= 0) {
      out.push(s.slice(Math.max(0, i - 80), Math.min(s.length, i + 220)).replace(/\r?\n/g, ' '));
    }
  }
}

const play = fs.readFileSync('platform/play.js', 'utf8');
out.push('\n=== CONTROLES DE SALA ===');

for (const term of ['bwCreate', 'bwRoomStatus', 'roomJoined', 'bwJoin', 'bwLeave']) {
  const i = play.indexOf(term);
  out.push('\n--- ' + term + ' ---');
  out.push(i < 0 ? 'Nao encontrado' : play.slice(Math.max(0, i - 180), Math.min(play.length, i + 400)));
}

fs.writeFileSync('relatorio-correcao.txt', out.join('\n'), 'utf8');
console.log('Relatorio criado: relatorio-correcao.txt');