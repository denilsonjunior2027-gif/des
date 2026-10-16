const fs = require('fs');

function trecho(arquivo, termos) {
  const s = fs.readFileSync(arquivo, 'utf8');
  console.log('\n========== ' + arquivo + ' ==========');

  for (const termo of termos) {
    const i = s.indexOf(termo);
    console.log('\n--- ' + termo + ' | posição ' + i + ' ---');

    if (i >= 0) {
      console.log(s.slice(Math.max(0, i - 250), Math.min(s.length, i + 900)));
    }
  }
}

trecho('platform/play.js', [
  'let roomCode',
  'panel.innerHTML',
  "socket.on('roomJoined'",
  "socket.on('playerJoined'",
  "socket.on('playerMoved'",
  "socket.on('roomClosed'",
  "socket.on('move'",
  "document.getElementById('bwCreate')",
  "document.getElementById('bwJoin')",
  "document.getElementById('bwLeave')",
  'function clearRoom',
  'function upsertPlayer'
]);

trecho('server.js', [
  'const rooms',
  'function makeCode',
  'function leaveSocketRoom',
  "socket.on('createRoom'",
  "socket.on('joinRoom'",
  "socket.on('move'",
  "socket.on('leaveRoom'",
  "socket.on('disconnect'"
]);

console.log('\nInspecao concluida. Nenhum arquivo foi alterado.');