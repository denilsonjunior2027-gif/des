const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'server.js');
let code = fs.readFileSync(file, 'utf8');

const route = "app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules', 'three')));";
const marker = "app.get(/.*/, (req, res) => res.sendFile(path.join(PLATFORM_DIR, 'index.html')));";

if (code.includes(route)) {
  console.log('A rota do Three.js ja existe.');
} else if (!code.includes(marker)) {
  console.error('ERRO: nao encontrei a rota final do servidor. Nenhuma alteracao aplicada.');
  process.exit(1);
} else {
  code = code.replace(marker, route + '\n' + marker);
  fs.writeFileSync(file, code, 'utf8');
  console.log('Rota do Three.js adicionada.');
}
