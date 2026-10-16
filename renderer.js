
const THREE = require("three");
const canvas = document.getElementById("scene");
const viewport = document.getElementById("viewport");
const status = document.getElementById("status");
const count = document.getElementById("count");
const objectName = document.getElementById("objectName");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#91c9ed");

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
camera.position.set(10, 9, 12);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.add(new THREE.HemisphereLight(0xffffff, 0x61718b, 2));

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(8, 15, 10);
sun.castShadow = true;
scene.add(sun);

// Chão
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: "#79a85b" })
);

floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.06;
floor.receiveShadow = true;
scene.add(floor);

// Grade de construção
const grid = new THREE.GridHelper(100, 100, 0x526c50, 0x91aa88);
grid.position.y = 0.01;
scene.add(grid);

const objects = [];
let selected = null;
let nextId = 1;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function updateStatus(message) {
  status.textContent = message;
}

function updateCount() {
  count.textContent = objects.length;
}

function selectObject(object) {
  if (selected) {
    selected.material.emissive?.setHex(0x000000);
  }

  selected = object;

  if (selected) {
    selected.material.emissive?.setHex(0x333333);
    objectName.textContent = selected.userData.name;
    updateStatus("Selecionado: " + selected.userData.name);
  } else {
    objectName.textContent = "Nenhum objeto";
  }
}

function addObject(type) {
  let geometry;
  let color;

  if (type === "Esfera") {
    geometry = new THREE.SphereGeometry(0.8, 32, 24);
    color = "#ffca4b";
  } else {
    geometry = new THREE.BoxGeometry(2, 2, 2);
    color = new THREE.Color().setHSL(Math.random(), 0.65, 0.55);
  }

  const material = new THREE.MeshStandardMaterial({ color });

  const object = new THREE.Mesh(geometry, material);

  object.position.set(
    (Math.random() - 0.5) * 4,
    1,
    (Math.random() - 0.5) * 4
  );

  object.castShadow = true;
  object.receiveShadow = true;
  object.userData.name = type + "_" + nextId++;

  scene.add(object);
  objects.push(object);

  selectObject(object);
  updateCount();
  updateStatus(type + " criado!");

  return object;
}

function removeLastObject() {
  if (objects.length === 0) {
    updateStatus("Não há objetos para remover.");
    return;
  }

  const object = objects.pop();

  if (selected === object) selectObject(null);

  scene.remove(object);
  object.geometry.dispose();
  object.material.dispose();

  updateCount();
  updateStatus("Último objeto removido.");
}

function resetScene() {
  while (objects.length > 0) {
    const object = objects.pop();
    scene.remove(object);
    object.geometry.dispose();
    object.material.dispose();
  }

  selectObject(null);
  updateCount();
  updateStatus("Cena reiniciada!");
  addObject("Bloco");
}

// Botões
document.getElementById("block").addEventListener("click", () => {
  addObject("Bloco");
});

document.getElementById("ball").addEventListener("click", () => {
  addObject("Esfera");
});

document.getElementById("remove").addEventListener("click", removeLastObject);
document.getElementById("reset").addEventListener("click", resetScene);

// Selecionar objetos clicando na cena
renderer.domElement.addEventListener("pointerdown", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();

  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(objects);

  if (hits.length > 0) {
    selectObject(hits[0].object);
  } else {
    selectObject(null);
  }
});

// Ajustar a tela
function resize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;

  if (!width || !height) return;

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

// Criar o primeiro bloco automaticamente
addObject("Bloco");

// Renderização contínua
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();

console.log("BlockWorld Studio: motor 3D iniciado.");

/* =========================================
   BLOCKWORLD LUA ENGINE
   Integração com Fengari
   ========================================= */

const luaUI = {
  editor: document.getElementById("luaCode"),
  run: document.getElementById("luaRun"),
  clear: document.getElementById("luaClear"),
  console: document.getElementById("luaConsole")
};

function luaLog(mensagem, tipo = "normal") {
  if (!luaUI.console) return;

  const linha = document.createElement("div");
  linha.textContent = String(mensagem);

  if (tipo === "erro") {
    linha.style.color = "#ff8585";
  } else if (tipo === "sucesso") {
    linha.style.color = "#8ee6a2";
  }

  luaUI.console.appendChild(linha);
  luaUI.console.scrollTop = luaUI.console.scrollHeight;
}

function criarAmbienteLua() {
  const fengari = require("fengari");
  
  // ==========================================
  // BLOCKWORLD: SISTEMA DE RIG E GUI
  // ==========================================

  // Criar um personagem R6 básico
  lua.lua_pushjsfunction(L, function (estado) {
    const nome = lua.lua_tostring(estado, 1);
    const nomeRig = nome ? to_jsstring(nome) : "Rig_R6";

    const partes = [
      ["Torso",  [0, 2.5, 0], [1.5, 2, 0.8]],
      ["Head",   [0, 4, 0],   [1, 1, 1]],
      ["LeftArm",[-1.25, 2.5, 0], [0.5, 2, 0.6]],
      ["RightArm",[1.25, 2.5, 0], [0.5, 2, 0.6]],
      ["LeftLeg",[-0.4, 0.5, 0], [0.6, 1, 0.7]],
      ["RightLeg",[0.4, 0.5, 0], [0.6, 1, 0.7]]
    ];

    const cor = new THREE.Color("#3987db");

    for (const [nomeParte, pos, tamanho] of partes) {
      const material = new THREE.MeshStandardMaterial({
        color: nomeParte === "Head" ? "#f1c49a" : cor
      });

      const parte = new THREE.Mesh(
        new THREE.BoxGeometry(...tamanho),
        material
      );

      parte.position.set(pos[0] + 4, pos[1], pos[2]);
      parte.castShadow = true;
      parte.receiveShadow = true;
      parte.userData.name = nomeRig + "_" + nomeParte;
      parte.userData.rig = nomeRig;

      scene.add(parte);
      objects.push(parte);
    }

    updateCount();
    updateStatus("Rig R6 criado: " + nomeRig);
    luaLog("Rig R6 criado: " + nomeRig, "sucesso");

    return 0;
  });

  lua.lua_setglobal(L, to_luastring("criarRig"));

  // Criar uma GUI de teste com botão clicável
  lua.lua_pushjsfunction(L, function (estado) {
    const textoLua = lua.lua_tostring(estado, 1);
    const titulo = textoLua ? to_jsstring(textoLua) : "Minha GUI";

    let painel = document.getElementById("bwGameGui");

    if (!painel) {
      painel = document.createElement("div");
      painel.id = "bwGameGui";

      Object.assign(painel.style, {
        position: "absolute",
        top: "55px",
        right: "15px",
        zIndex: "20",
        padding: "16px",
        minWidth: "190px",
        background: "#182334",
        color: "white",
        border: "1px solid #56a8ff",
        borderRadius: "10px",
        fontFamily: "Segoe UI, sans-serif",
        boxShadow: "0 8px 25px #0007"
      });

      viewport.appendChild(painel);
    }

    painel.replaceChildren();

    const cabecalho = document.createElement("div");
    cabecalho.textContent = titulo;
    cabecalho.style.fontWeight = "bold";
    cabecalho.style.marginBottom = "12px";
    painel.appendChild(cabecalho);

    const botao = document.createElement("button");
    botao.textContent = "Clique aqui!";
    botao.style.background = "#287bd2";
    botao.style.color = "white";
    botao.style.width = "100%";

    botao.addEventListener("click", function () {
      luaLog("Botão da GUI clicado!", "sucesso");
    });

    painel.appendChild(botao);

    luaLog("GUI criada: " + titulo, "sucesso");
    return 0;
  });

  lua.lua_setglobal(L, to_luastring("criarGUI"));

  const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  // Redireciona print() para o console do editor.
  lua.lua_pushjsfunction(L, function (estado) {
    const quantidade = lua.lua_gettop(estado);
    const partes = [];

    for (let i = 1; i <= quantidade; i++) {
      const valor = lua.lua_tostring(estado, i);
      partes.push(valor ? to_jsstring(valor) : "(valor)");
    }

    luaLog(partes.join("\t"));
    return 0;
  });

  lua.lua_setglobal(L, to_luastring("print"));

  // criarBloco(x, y, z)
  lua.lua_pushjsfunction(L, function (estado) {
    const x = lua.lua_tonumber(estado, 1) || 0;
    const y = lua.lua_tonumber(estado, 2) || 1;
    const z = lua.lua_tonumber(estado, 3) || 0;

    const objeto = addObject("Bloco");
    objeto.position.set(x, y, z);

    luaLog(
      "Bloco criado em (" + x + ", " + y + ", " + z + ")",
      "sucesso"
    );

    return 0;
  });

  lua.lua_setglobal(L, to_luastring("criarBloco"));

  // criarEsfera(x, y, z)
  lua.lua_pushjsfunction(L, function (estado) {
    const x = lua.lua_tonumber(estado, 1) || 0;
    const y = lua.lua_tonumber(estado, 2) || 1;
    const z = lua.lua_tonumber(estado, 3) || 0;

    const objeto = addObject("Esfera");
    objeto.position.set(x, y, z);

    luaLog(
      "Esfera criada em (" + x + ", " + y + ", " + z + ")",
      "sucesso"
    );

    return 0;
  });

  lua.lua_setglobal(L, to_luastring("criarEsfera"));

  return { L, lua, lauxlib, to_luastring, to_jsstring };
}

luaUI.run.addEventListener("click", () => {
  luaUI.console.textContent = "";

  try {
    const ambiente = criarAmbienteLua();
    const { L, lua, lauxlib, to_luastring, to_jsstring } = ambiente;
    const codigo = luaUI.editor.value;

    const resultado = lauxlib.luaL_loadstring(
      L,
      to_luastring(codigo)
    );

    if (resultado !== lua.LUA_OK) {
      const mensagem = lua.lua_tostring(L, -1);
      luaLog(
        "Erro de sintaxe: " +
        (mensagem ? to_jsstring(mensagem) : "código inválido"),
        "erro"
      );
      return;
    }

    const execucao = lua.lua_pcall(
      L,
      0,
      lua.LUA_MULTRET,
      0
    );

    if (execucao !== lua.LUA_OK) {
      const mensagem = lua.lua_tostring(L, -1);
      luaLog(
        "Erro Lua: " +
        (mensagem ? to_jsstring(mensagem) : "falha na execução"),
        "erro"
      );
      return;
    }

    luaLog("Script executado!", "sucesso");
  } catch (erro) {
    luaLog("Falha ao iniciar Lua: " + erro.message, "erro");
    console.error("BlockWorld Lua Engine:", erro);
  }
});

luaUI.clear.addEventListener("click", () => {
  luaUI.console.textContent = "";
});

luaLog("BlockWorld Lua Engine carregada.", "sucesso");

function criarBotaoEditor(texto, acao) {
  const botao = document.createElement("button");
  botao.textContent = texto;
  botao.style.margin = "4px";
  botao.addEventListener("click", acao);
  document.querySelector(".toolbar")?.appendChild(botao);
}

criarBotaoEditor("🧍 Criar Rig R6", () => {
  const ambiente = criarAmbienteLua();
  const { L, lua, lauxlib, to_luastring } = ambiente;

  const resultado = lauxlib.luaL_loadstring(
    L,
    to_luastring('criarRig("MeuPersonagem")')
  );

  if (resultado === lua.LUA_OK) {
    lauxlib.lua_pcall(L, 0, 0, 0);
  }

  lua.lua_close(L);
});

criarBotaoEditor("🖥 Criar GUI", () => {
  const ambiente = criarAmbienteLua();
  const { L, lua, lauxlib, to_luastring } = ambiente;

  const resultado = lauxlib.luaL_loadstring(
    L,
    to_luastring('criarGUI("Minha Interface")')
  );

  if (resultado === lua.LUA_OK) {
    lauxlib.lua_pcall(L, 0, 0, 0);
  }

  lua.lua_close(L);
});
