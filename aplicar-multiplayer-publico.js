
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const SERVER_PATH = path.join(ROOT, 'server.js');
const CLIENT_PATH = path.join(ROOT, 'platform', 'play.js');

const DEFAULT_AVATAR = {
  skin: '#d9a078',
  hair: '#38251c',
  shirt: '#635bdb',
  pants: '#27344d'
};

function fail(message) {
  throw new Error(message);
}

function readFile(file) {
  if (!fs.existsSync(file)) {
    fail('Arquivo não encontrado: ' + file);
  }

  return fs.readFileSync(file, 'utf8');
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);

  if (start < 0) {
    fail('Início da seção não encontrado: ' + label);
  }

  const end = source.indexOf(endMarker, start + startMarker.length);

  if (end < 0) {
    fail('Final da seção não encontrado: ' + label);
  }

  return source.slice(0, start) +
    replacement +
    '\n\n' +
    source.slice(end);
}

function validateJavaScript(file) {
  const result = spawnSync(
    process.execPath,
    ['--check', file],
    { encoding: 'utf8', windowsHide: true }
  );

  if (result.error) {
    fail('Não foi possível validar ' + path.basename(file) +
      ': ' + result.error.message);
  }

  if (result.status !== 0) {
    fail('Erro de sintaxe em ' + path.basename(file) + ':\n' +
      (result.stderr || result.stdout || 'Erro desconhecido'));
  }
}

function normalizeAvatar(value) {
  const avatar = {};

  for (const key of Object.keys(DEFAULT_AVATAR)) {
    const color = value && value[key];

    avatar[key] = typeof color === 'string' &&
      /^#[0-9a-f]{6}$/i.test(color)
      ? color
      : DEFAULT_AVATAR[key];
  }

  return avatar;
}

function createServerSection() {
  return String.raw`const MAX_PLAYERS_PER_MATCH = 20;
const MAX_ACTIVE_MATCHES = 500;

const DEFAULT_AVATAR = {
  skin: '#d9a078',
  hair: '#38251c',
  shirt: '#635bdb',
  pants: '#27344d'
};

function normalizeAvatar(value) {
  const result = {};

  for (const key of Object.keys(DEFAULT_AVATAR)) {
    const color = value && value[key];

    result[key] = typeof color === 'string' &&
      /^#[0-9a-f]{6}$/i.test(color)
      ? color
      : DEFAULT_AVATAR[key];
  }

  return result;
}

function roomPlayer(socket) {
  return {
    id: socket.id,
    username: socket.user.username,
    x: 0,
    z: 0,
    rotation: 0,
    avatar: normalizeAvatar(socket.user.avatar)
  };
}

function roomList(room) {
  return [...room.players.values()];
}

function sendRoomJoined(socket, room) {
  socket.emit('roomJoined', {
    room: {
      code: room.id,
      gameId: room.gameId
    },
    players: roomList(room)
  });
}

function leaveSocketRoom(socket) {
  const id = socket.data.roomCode;

  if (!id) return;

  const room = rooms.get(id);

  socket.leave(id);
  socket.data.roomCode = null;

  if (!room) return;

  room.players.delete(socket.id);

  if (room.players.size === 0) {
    rooms.delete(id);
    io.emit('roomClosed', { code: id });
    return;
  }

  socket.to(id).emit('playerLeft', socket.id);

  io.to(id).emit('roomInfo', {
    code: room.id,
    count: room.players.size
  });
}

io.on('connection', socket => {
  io.emit('onlineCount', io.engine.clientsCount);

  socket.on('findMatch', (payload = {}) => {
    const gameId = typeof payload.gameId === 'string'
      ? payload.gameId.slice(0, 80)
      : '';

    if (!gameId) {
      socket.emit('roomError', 'Identificador de jogo inválido.');
      return;
    }

    // O ID precisa existir no catálogo de jogos carregado pelo servidor.
    const gameExists = games.some(game =>
      game && String(game.id) === gameId
    );

    if (!gameExists) {
      socket.emit('roomError', 'Jogo não encontrado no catálogo.');
      return;
    }

    const currentId = socket.data.roomCode;
    const currentRoom = currentId ? rooms.get(currentId) : null;

    if (currentRoom && currentRoom.gameId === gameId) {
      sendRoomJoined(socket, currentRoom);
      return;
    }

    if (currentRoom) {
      leaveSocketRoom(socket);
    }

    // Procura uma partida do mesmo jogo que ainda tenha vaga.
    let room = [...rooms.values()].find(candidate =>
      candidate.gameId === gameId &&
      candidate.players.size < MAX_PLAYERS_PER_MATCH
    );

    if (!room) {
      if (rooms.size >= MAX_ACTIVE_MATCHES) {
        socket.emit(
          'roomError',
          'O servidor atingiu o limite de partidas. Tente novamente.'
        );
        return;
      }

      room = {
        id: crypto.randomUUID(),
        gameId,
        players: new Map(),
        createdAt: Date.now()
      };

      rooms.set(room.id, room);
    }

    const player = roomPlayer(socket);

    room.players.set(socket.id, player);
    socket.join(room.id);
    socket.data.roomCode = room.id;

    sendRoomJoined(socket, room);

    socket.to(room.id).emit('playerJoined', player);

    io.to(room.id).emit('roomInfo', {
      code: room.id,
      count: room.players.size
    });
  });

  socket.on('move3d', (payload = {}) => {
    const id = socket.data.roomCode;
    const room = id ? rooms.get(id) : null;
    const player = room && room.players.get(socket.id);

    if (!player) return;

    const now = Date.now();

    // Limita a frequência das atualizações de movimento.
    if (
      socket.data.lastMoveAt &&
      now - socket.data.lastMoveAt < 40
    ) {
      return;
    }

    const x = Number(payload.x);
    const z = Number(payload.z);
    const rotation = Number(payload.rotation);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      !Number.isFinite(rotation)
    ) {
      return;
    }

    socket.data.lastMoveAt = now;

    player.x = Math.max(-500, Math.min(500, x));
    player.z = Math.max(-500, Math.min(500, z));
    player.rotation = Math.max(
      -Math.PI * 2,
      Math.min(Math.PI * 2, rotation)
    );

    socket.to(room.id).emit('playerMoved3d', {
      id: player.id,
      x: player.x,
      z: player.z,
      rotation: player.rotation
    });
  });

  socket.on('setAvatar', payload => {
    const user = users.find(entry =>
      entry.id === socket.user.id
    );

    if (!user) {
      socket.emit('roomError', 'Conta não encontrada.');
      return;
    }

    const avatar = normalizeAvatar(payload);

    try {
      // Persiste no mesmo arquivo de usuários já usado pela plataforma.
      user.avatar = avatar;
      writeJson(USERS_FILE, users);

      socket.user.avatar = avatar;

      const id = socket.data.roomCode;
      const room = id ? rooms.get(id) : null;
      const player = room && room.players.get(socket.id);

      if (player) {
        player.avatar = avatar;
        io.to(room.id).emit('playerUpdated', player);
      }

      socket.emit('avatarSaved', avatar);
    } catch (error) {
      console.error('[AVATAR] Erro ao salvar:', error);

      socket.emit(
        'roomError',
        'Não foi possível salvar o avatar.'
      );
    }
  });

  socket.on('leaveRoom', () => {
    leaveSocketRoom(socket);
  });

  socket.on('disconnect', () => {
    leaveSocketRoom(socket);

    io.emit(
      'onlineCount',
      Math.max(0, io.engine.clientsCount - 1)
    );
  });
});`;
}

function createClientPanel() {
  return [
    'panel.innerHTML = `',
    '  <strong>Multiplayer público</strong>',
    '  <button id="bwFindMatch">Encontrar partida</button>',
    '  <button id="bwLeave">Sair da partida</button>',
    '  <span id="bwRoomStatus">Conectando...</span>',
    '  <div style="flex-basis:100%;height:1px;background:#26334c"></div>',
    '  <strong>Personalizar avatar</strong>',
    '  <label>Pele <input type="color" id="bwSkin" value="#d9a078"></label>',
    '  <label>Cabelo <input type="color" id="bwHair" value="#38251c"></label>',
    '  <label>Camisa <input type="color" id="bwShirt" value="#635bdb"></label>',
    '  <label>Calça <input type="color" id="bwPants" value="#27344d"></label>',
    '  <button id="bwSaveAvatar">Salvar avatar</button>',
    '  <span style="color:#9ca9c5">WASD ou setas · Máximo de 20 jogadores.</span>',
    '`;'
  ].join('\n');
}

function createClientSocketSection() {
  return String.raw`function ensureSocket() {
  if (socket) return;

  if (typeof window.io !== 'function') {
    status('Socket.IO não carregou. Atualize a página.', true);
    return;
  }

  socket = window.io();

  socket.on('connect', () => {
    status('Conectado. Procurando partida...');
    socket.emit('findMatch', { gameId });
  });

  socket.on('connect_error', error => {
    status(error.message || 'Entre na sua conta para jogar.', true);
  });

  socket.on('roomError', error => {
    status(String(error), true);
  });

  socket.on('roomJoined', data => {
    clearRoom();

    roomCode = data.room.code;
    myId = socket.id;

    for (const player of data.players) {
      upsertPlayer(player);
    }

    const ownPlayer = data.players.find(player =>
      player.id === myId
    );

    if (ownPlayer && ownPlayer.avatar) {
      Object.assign(colors, ownPlayer.avatar);

      for (const key of Object.keys(colors)) {
        const input = document.getElementById(
          'bw' + key[0].toUpperCase() + key.slice(1)
        );

        if (input) input.value = colors[key];
      }
    }

    status(
      'Partida pública · ' +
      data.players.length +
      '/20 jogadores'
    );
  });

  socket.on('playerJoined', upsertPlayer);
  socket.on('playerUpdated', upsertPlayer);

  socket.on('playerMoved3d', player => {
    const group = players.get(player.id);

    if (!group) return;

    group.position.set(player.x, 0, player.z);
    group.rotation.y = player.rotation || 0;
  });

  socket.on('playerLeft', removePlayer);

  socket.on('roomInfo', data => {
    status(
      'Partida pública · ' +
      data.count +
      '/20 jogadores'
    );
  });

  socket.on('roomClosed', data => {
    if (roomCode === data.code) {
      clearRoom();
    }
  });

  socket.on('avatarSaved', avatar => {
    Object.assign(colors, avatar);

    for (const key of Object.keys(colors)) {
      const input = document.getElementById(
        'bw' + key[0].toUpperCase() + key.slice(1)
      );

      if (input) input.value = colors[key];
    }

    status('Avatar salvo na sua conta!');
  });

  socket.on('disconnect', () => {
    clearRoom();
    status('Desconectado do servidor.', true);
  });
}

document.getElementById('bwFindMatch').onclick = () => {
  ensureSocket();

  if (socket && socket.connected) {
    status('Procurando partida...');
    socket.emit('findMatch', { gameId });
  }
};

document.getElementById('bwLeave').onclick = () => {
  if (socket && socket.connected) {
    socket.emit('leaveRoom');
  }

  clearRoom();
};

document.getElementById('bwSaveAvatar').onclick = () => {
  ensureSocket();

  if (socket && socket.connected) {
    socket.emit('setAvatar', readColors());
  } else {
    status('Conecte-se à sua conta primeiro.', true);
  }
};

`;
}

function main() {
  const originalServer = readFile(SERVER_PATH);
  const originalClient = readFile(CLIENT_PATH);

  // Este atualizador foi feito para a versão original do multiplayer.
  if (
    !originalServer.includes('function makeCode()') ||
    !originalServer.includes("socket.on('createRoom'") ||
    !originalServer.includes("socket.on('joinRoom'") ||
    !originalServer.includes("socket.on('move'")
  ) {
    fail(
      'O server.js não corresponde à versão original esperada. ' +
      'Nenhum arquivo foi modificado.'
    );
  }

  if (
    !originalClient.includes("document.getElementById('bwCreate')") ||
    !originalClient.includes("socket.emit('move3d'") ||
    !originalClient.includes("socket.emit('setAvatar'")
  ) {
    fail(
      'O platform/play.js não corresponde à versão original esperada. ' +
      'Nenhum arquivo foi modificado.'
    );
  }

  let server = replaceSection(
    originalServer,
    'function makeCode()',
    'setInterval(() => { const now = Date.now();',
    createServerSection(),
    'multiplayer do servidor'
  );

  // Inclui o avatar salvo na conta no objeto da sessão Socket.IO.
  const authBefore = 'socket.user = publicUser(user);';
  const authAfter =
    'socket.user = { ...publicUser(user), avatar: normalizeAvatar(user.avatar) };';

  if (!server.includes(authBefore)) {
    fail(
      'Não encontrei o ponto de integração da autenticação Socket.IO. ' +
      'Nenhum arquivo foi modificado.'
    );
  }

  server = server.replace(authBefore, authAfter);

  let client = replaceSection(
    originalClient,
    'panel.innerHTML = `',
    '\n`;',
    createClientPanel(),
    'painel do cliente'
  );

  client = replaceSection(
    client,
    'function ensureSocket()',
    "window.addEventListener('keydown'",
    createClientSocketSection(),
    'eventos Socket.IO do cliente'
  );

  // Valida as referências antes de gravar qualquer arquivo.
  const serverRequired = [
    "socket.on('findMatch'",
    "socket.on('move3d'",
    "socket.on('setAvatar'",
    'MAX_PLAYERS_PER_MATCH = 20',
    'function normalizeAvatar'
  ];

  const clientRequired = [
    "socket.emit('findMatch'",
    "socket.emit('move3d'",
    "socket.emit('setAvatar'",
    'bwFindMatch'
  ];

  for (const item of serverRequired) {
    if (!server.includes(item)) {
      fail('Validação do servidor falhou: ' + item);
    }
  }

  for (const item of clientRequired) {
    if (!client.includes(item)) {
      fail('Validação do cliente falhou: ' + item);
    }
  }

  if (
    client.includes("getElementById('bwCreate')") ||
    client.includes("getElementById('bwJoin')")
  ) {
    fail('Ainda existem referências aos controles antigos de sala.');
  }

  const backupDir = path.join(
    ROOT,
    'backups',
    'multiplayer-publico-' +
      new Date().toISOString().replace(/[:.]/g, '-')
  );

  fs.mkdirSync(backupDir, { recursive: true });

  // Guarda cópias dos originais antes da alteração.
  fs.copyFileSync(
    SERVER_PATH,
    path.join(backupDir, 'server.js')
  );

  fs.copyFileSync(
    CLIENT_PATH,
    path.join(backupDir, 'play.js')
  );

  const suffix = crypto.randomUUID();
  const serverTemp = path.join(ROOT, 'server-validacao-' + suffix + '.js');
  const clientTemp = path.join(ROOT, 'play-validacao-' + suffix + '.js');

  try {
    fs.writeFileSync(serverTemp, server, 'utf8');
    fs.writeFileSync(clientTemp, client, 'utf8');

    // Os nomes terminam em .js para o Node.js 24.
    validateJavaScript(serverTemp);
    validateJavaScript(clientTemp);

    // Grava arquivos finais somente depois de ambas as validações.
    fs.writeFileSync(SERVER_PATH, server, 'utf8');
    fs.writeFileSync(CLIENT_PATH, client, 'utf8');
  } finally {
    fs.rmSync(serverTemp, { force: true });
    fs.rmSync(clientTemp, { force: true });
  }

  console.log('\nMULTIPLAYER PUBLICO APLICADO.');
  console.log('Limite por partida: 20 jogadores.');
  console.log('Interface antiga de códigos removida.');
  console.log('Movimento 3D e avatar integrados.');
  console.log('Arquivos validados com Node.js.');
  console.log('Backups: ' + backupDir);
  console.log('\nPróximo passo: testar o servidor.');
}

try {
  main();
} catch (error) {
  console.error('\nERRO: ' + (error.stack || error.message));
  console.error('Confira a mensagem antes de tentar novamente.');
  process.exitCode = 1;
}
