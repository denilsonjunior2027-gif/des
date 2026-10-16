
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
