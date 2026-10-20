import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = selector => document.querySelector(selector);
const container = $('#scene');
if (!container) throw new Error('No se encontró el contenedor #scene.');

// ================================================
// MEDIDAS (en metros)
// ================================================
// Las paredes se dibujan hacia afuera del piso, así que el interior
// mide exactamente 250 × 300 cm y los muebles apoyan sin luz.

const largo = 3, ancho = 2.5, alto = 2.6, t = 0.06;
const xA = -(ancho / 2 + t / 2);   // centro de la pared A (izquierda, puerta)
const xC = ancho / 2 + t / 2;      // centro de la pared C (derecha, placard)
const zB = -(largo / 2 + t / 2);   // centro de la pared B (fondo, ventana)

// ================================================
// TEMAS DE COLOR DEL MODELO
// ================================================

const TEMAS = {
  claro:  { fondo: '#cdd4da', piso: '#a58a6c', pared: '#b3bec8', paredOp: 0.7, techo: '#dfe4e8', hemi: 1.1, sol: 2.0, punto: 9, env: 0.35 },
  oscuro: { fondo: '#10161c', piso: '#4a4036', pared: '#3a4651', paredOp: 0.75, techo: '#2a343d', hemi: 0.35, sol: 0.8, punto: 5, env: 0.1 }
};

// ================================================
// ESCENA, CÁMARA Y CONTROLES
// ================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(TEMAS.claro.fondo);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
const posicionInicial = new THREE.Vector3(4.8, 4.1, 5.8);
const objetivoInicial = new THREE.Vector3(0, 1.1, 0);
camera.position.copy(posicionInicial);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;   // colores más fieles y con más contraste
renderer.toneMappingExposure = 0.95;
// Las sombras son estáticas: se calculan una sola vez.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
container.appendChild(renderer.domElement);
const canvas = renderer.domElement;

// Entorno suave: da luz ambiente y reflejos más realistas.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

// Se dibuja solo cuando algo cambia: más fluido y con menos consumo.
let sucio = true;
const pedirRender = () => { sucio = true; };

const controls = new OrbitControls(camera, canvas);
controls.target.copy(objetivoInicial);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.5;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.49;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
controls.update();

canvas.addEventListener('dragstart', e => e.preventDefault());
controls.addEventListener('change', pedirRender);

// Movimiento suave al cambiar de vista.
let vuelo = null;
controls.addEventListener('start', () => { vuelo = null; });
const irA = (pos, objetivo) => { vuelo = { pos, objetivo }; };

// ================================================
// LUCES
// ================================================

const hemi = new THREE.HemisphereLight('#fff8e9', '#777267', 1.7);
const sol = new THREE.DirectionalLight('#fff2d8', 2.2);
sol.position.set(-3, 6, 4);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
// Zona de sombra ajustada al cuarto: bordes más nítidos.
const camSombra = sol.shadow.camera;
camSombra.left = -3.5; camSombra.right = 3.5; camSombra.top = 3.5; camSombra.bottom = -3.5;
camSombra.near = 1; camSombra.far = 14;
sol.shadow.bias = -0.0005;
sol.shadow.normalBias = 0.02;
const punto = new THREE.PointLight('#fff0d9', 14, 8);
punto.position.set(0, 2.2, 0);
scene.add(hemi, sol, punto);

// ================================================
// MATERIALES Y FUNCIONES BASE
// ================================================

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, ...extra });

const matPiso = mat(TEMAS.claro.piso);
const matPared = mat(TEMAS.claro.pared, { transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
const matTecho = mat(TEMAS.claro.techo, { transparent: true, opacity: 0.9, side: THREE.DoubleSide });
const matMarco = mat('#e9edf0');
const matParedC = matPared.clone();   // la pared que está delante de la cámara es más transparente

function box(name, w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// Tramos de pared: no proyectan sombra para no oscurecer el interior.
function pared(name, w, h, d, x, y, z, material = matPared) {
  const mesh = box(name, w, h, d, x, y, z, material);
  mesh.castShadow = false;
  return mesh;
}

// Planos invisibles que sirven para seleccionar paredes.
function plano(name, w, h, x, y, z, rotY = 0) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false, side: THREE.DoubleSide })
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  scene.add(mesh);
  return mesh;
}

const piso = box('Piso', ancho, 0.08, largo, 0, -0.04, 0, matPiso);

const paredes = [
  plano('Pared A', largo, alto, -ancho / 2, alto / 2, 0, Math.PI / 2),
  plano('Pared B', ancho, alto, 0, alto / 2, -largo / 2),
  pared('Pared C', t, alto, largo + 2 * t, xC, alto / 2, 0, matParedC),
  plano('Pared D', ancho, alto, 0, alto / 2, largo / 2)   // frente abierto para ver el interior
];

// ================================================
// PARED A: PUERTA (a 6 cm de la esquina con la pared D)
// ================================================

const puertaAncho = 0.65, puertaAlto = 2.02;
const zInicio = largo / 2 - 0.06;
const zFin = zInicio - puertaAncho;
const zPuerta = (zInicio + zFin) / 2;

pared('Pared A: tramo junto a D', t, alto, 0.06 + t, xA, alto / 2, (zInicio + largo / 2 + t) / 2);
pared('Pared A: tramo junto a B', t, alto, zFin + largo / 2 + t, xA, alto / 2, (zFin - largo / 2 - t) / 2);
pared('Pared A: sobre la puerta', t, alto - puertaAlto, puertaAncho, xA, (alto + puertaAlto) / 2, zPuerta);

box('Puerta: hoja', 0.035, puertaAlto, puertaAncho - 0.035, xA, puertaAlto / 2, zPuerta, mat('#7a5a3c'));
for (const z of [zInicio, zFin]) box('Puerta: marco', 0.08, puertaAlto, 0.035, xA, puertaAlto / 2, z, matMarco);
box('Puerta: marco', 0.08, 0.035, puertaAncho + 0.035, xA, puertaAlto, zPuerta, matMarco);

// ================================================
// PARED B: VENTANA Y TAPARROLLO
// ================================================

const vw = 1.67, vh = 1.57, vBase = 0.40;
const vSup = vBase + vh;
const taparrolloAlto = 0.33;
// La ubicación vertical del taparrollo es provisional.
const taparrolloBase = Math.min(vSup, alto - taparrolloAlto);

pared('Pared B: lateral izquierdo', (ancho - vw) / 2, alto, t, -(ancho + vw) / 4, alto / 2, zB);
pared('Pared B: lateral derecho', (ancho - vw) / 2, alto, t, (ancho + vw) / 4, alto / 2, zB);
pared('Pared B: debajo de la ventana', vw, vBase, t, 0, vBase / 2, zB);
pared('Pared B: sobre la ventana', vw, alto - vSup, t, 0, (alto + vSup) / 2, zB);

box('Ventana: marco', vw, 0.045, 0.075, 0, vBase, zB, matMarco);
box('Ventana: marco', vw, 0.045, 0.075, 0, vSup, zB, matMarco);
for (const x of [-vw / 2, vw / 2]) box('Ventana: marco', 0.045, vh, 0.075, x, vBase + vh / 2, zB, matMarco);
box('Ventana: cristal', vw - 0.08, vh - 0.08, 0.018, 0, vBase + vh / 2, zB,
  mat('#9fd0dc', { roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.45 }));
box('Taparrollo', vw, taparrolloAlto, 0.12, 0, taparrolloBase + taparrolloAlto / 2, zB + t, mat('#c9d1d7'));

// ================================================
// PARED A: ESCRITORIO
// ================================================

const escAncho = 1.00, escProf = 0.45, escAlto = 0.75;
const sepEscritorio = 0.50;   // distancia entre el final de la puerta y el escritorio (poné 0.56 si preferís 56 cm)
const z1 = zFin - sepEscritorio;   // borde del escritorio más cercano a la puerta
const z2 = z1 - escAncho;          // borde más cercano a la ventana
const escZ = (z1 + z2) / 2;
const escX = -ancho / 2 + escProf / 2;
const escFrente = -ancho / 2 + escProf;

box('Escritorio: tablero', escProf, 0.045, escAncho, escX, escAlto - 0.0225, escZ, mat('#b08a5e'));
const pataAlto = escAlto - 0.045;
const matPata = mat('#2f3a44');
for (const dx of [-1, 1]) {
  for (const dz of [-1, 1]) {
    box('Escritorio: pata', 0.035, pataAlto, 0.035,
      escX + dx * (escProf / 2 - 0.045), pataAlto / 2, escZ + dz * (escAncho / 2 - 0.045), matPata);
  }
}

// ================================================
// PARED C: PLACARD (desde la esquina con la pared B)
// ================================================

const placardLargo = 2.00, placardProf = 0.40, placardAlto = 1.80;
const placardX = ancho / 2 - placardProf / 2;
const placardZ = -largo / 2 + placardLargo / 2;
const pFrente = ancho / 2 - placardProf;   // cara frontal del placard

box('Placard: cuerpo', placardProf, placardAlto, placardLargo, placardX, placardAlto / 2, placardZ, mat('#7f8e9a'));
const matPuertaPlacard = mat('#a3b0ba');
for (const dz of [-1, 1]) {
  box('Placard: puerta', 0.025, placardAlto - 0.06, placardLargo / 2 - 0.025,
    pFrente - 0.0125, placardAlto / 2, placardZ + dz * placardLargo / 4, matPuertaPlacard);
  box('Placard: tirador', 0.025, 0.12, 0.025, pFrente - 0.04, placardAlto / 2, placardZ + dz * 0.06, mat('#27323b'));
}
box('Placard: división', 0.03, placardAlto - 0.06, 0.018, pFrente - 0.02, placardAlto / 2, placardZ, mat('#5f6d78'));

// ================================================
// CAMA: cabecera contra la pared C, pies hacia la puerta
// ================================================
// Entra justo en el metro libre de la pared C (300 − 200 cm del placard).

const camaLargo = 1.90, camaAncho = 1.00;
const camaBaseY = 0.20, colchonTop = 0.50, cabeceraAlto = 1.00, cabeceraEsp = 0.07;
const baseAlto = 0.12, colchonAlto = 0.18;   // 12 + 18 = 30 cm (de 20 a 50 cm)
const camaX = ancho / 2 - camaLargo / 2;
const camaZ = largo / 2 - camaAncho / 2;
const cuerpoLargo = camaLargo - cabeceraEsp;
const cuerpoX = camaX - cabeceraEsp / 2;

box('Cama: base', cuerpoLargo, baseAlto, camaAncho, cuerpoX, camaBaseY + baseAlto / 2, camaZ, mat('#6b5a4c'));
box('Cama: colchón', cuerpoLargo - 0.025, colchonAlto, camaAncho - 0.025, cuerpoX, colchonTop - colchonAlto / 2, camaZ, mat('#e8e4dc'));
box('Cama: cabecera', cabeceraEsp, cabeceraAlto, camaAncho, ancho / 2 - cabeceraEsp / 2, cabeceraAlto / 2, camaZ, mat('#586a78'));
for (const dz of [-1, 1]) {
  box('Cama: almohada', 0.27, 0.10, 0.36, ancho / 2 - cabeceraEsp - 0.155, colchonTop + 0.035, camaZ + dz * camaAncho * 0.24, mat('#f6f3ee'));
}

// ================================================
// ESCRITORIO COMPLETO: monitor, teclado, mousepad, mouse y PC
// ================================================
// Medidas típicas, fáciles de ajustar. La persona mira hacia la pared A (hacia -x).

const matNegro = mat('#161b21', { roughness: 0.5 });
const matPantalla = mat('#0e2433', { roughness: 0.3, emissive: '#1f6f9a', emissiveIntensity: 0.7 });
const monX = -ancho / 2 + 0.13;

box('Monitor: base', 0.16, 0.012, 0.22, monX + 0.03, escAlto + 0.006, escZ, matNegro);
box('Monitor: pie', 0.02, 0.10, 0.04, monX, escAlto + 0.062, escZ, matNegro);
box('Monitor: pantalla', 0.02, 0.32, 0.54, monX, escAlto + 0.272, escZ, matNegro);
box('Monitor: panel', 0.004, 0.29, 0.51, monX + 0.012, escAlto + 0.272, escZ, matPantalla);

const tecX = escFrente - 0.11;
box('Teclado: base', 0.14, 0.018, 0.44, tecX, escAlto + 0.009, escZ, mat('#2b333b'));
box('Teclado: teclas', 0.125, 0.006, 0.42, tecX, escAlto + 0.021, escZ, mat('#4a5560'));
box('Mousepad', 0.20, 0.004, 0.24, tecX, escAlto + 0.002, escZ - 0.36, mat('#2c4a52'));
box('Mouse', 0.115, 0.035, 0.065, tecX, escAlto + 0.0215, escZ - 0.36, mat('#cfd6dc'));

// PC debajo del escritorio, del lado de la ventana.
const pcX = escX, pcZ = escZ - 0.30;
box('PC: gabinete', 0.42, 0.44, 0.20, pcX, 0.22, pcZ, mat('#1e252c', { roughness: 0.55 }));
box('PC: frente', 0.008, 0.42, 0.18, pcX + 0.214, 0.22, pcZ, mat('#2f3a44'));
box('PC: luz', 0.004, 0.012, 0.012, pcX + 0.219, 0.40, pcZ, mat('#35e0c8', { emissive: '#35e0c8', emissiveIntensity: 1.6 }));

// ================================================
// SILLA DE OFICINA: cinco patas con ruedas, columna de gas,
// respaldo de malla inclinado y apoyabrazos
// ================================================

function pieza(name, geometria, x, y, z, material, rotY = 0) {
  const mesh = new THREE.Mesh(geometria, material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

const sillaX = escFrente + 0.28;
const sillaZ = escZ;
const matSillaOscuro = mat('#1b2127', { roughness: 0.5 });
const matSillaTela = mat('#43525e');

for (let i = 0; i < 5; i++) {
  const a = Math.PI + i * 2 * Math.PI / 5;   // una pata apunta hacia el escritorio
  pieza('Silla: pata', new THREE.BoxGeometry(0.30, 0.03, 0.05),
    sillaX + 0.15 * Math.cos(a), 0.075, sillaZ + 0.15 * Math.sin(a), matSillaOscuro, -a);
  pieza('Silla: rueda', new THREE.SphereGeometry(0.03, 12, 8),
    sillaX + 0.30 * Math.cos(a), 0.03, sillaZ + 0.30 * Math.sin(a), matSillaOscuro);
}
pieza('Silla: centro', new THREE.CylinderGeometry(0.055, 0.055, 0.06, 16), sillaX, 0.09, sillaZ, matSillaOscuro);
pieza('Silla: columna', new THREE.CylinderGeometry(0.028, 0.028, 0.26, 16), sillaX, 0.245, sillaZ,
  mat('#aeb8c1', { metalness: 0.6, roughness: 0.35 }));
box('Silla: mecanismo', 0.28, 0.035, 0.28, sillaX, 0.3925, sillaZ, matSillaOscuro);
box('Silla: asiento', 0.48, 0.08, 0.50, sillaX, 0.45, sillaZ, matSillaTela);

const respaldo = box('Silla: respaldo', 0.04, 0.46, 0.46, sillaX + 0.27, 0.77, sillaZ, matSillaOscuro);
const malla = box('Silla: malla', 0.046, 0.40, 0.40, sillaX + 0.27, 0.77, sillaZ, matSillaTela);
respaldo.rotation.z = malla.rotation.z = -0.12;   // inclinado hacia atrás
box('Silla: soporte', 0.03, 0.14, 0.06, sillaX + 0.25, 0.56, sillaZ, matSillaOscuro);

for (const dz of [-1, 1]) {
  box('Silla: apoyabrazos', 0.03, 0.28, 0.03, sillaX + 0.02, 0.55, sillaZ + dz * 0.27, matSillaOscuro);
  box('Silla: apoyabrazos', 0.26, 0.03, 0.06, sillaX + 0.02, 0.705, sillaZ + dz * 0.27, matSillaOscuro);
}

// ================================================
// TECHO (opcional, empieza oculto)
// ================================================

const techo = box('Techo', ancho + 2 * t, 0.06, largo + 2 * t, 0, alto + 0.03, 0, matTecho);
techo.castShadow = false;

// ================================================
// ETIQUETAS (nombres de paredes y objetos) Y MEDIDAS
// ================================================

const grupoEtiquetas = new THREE.Group();
const grupoMedidas = new THREE.Group();
scene.add(grupoEtiquetas, grupoMedidas);

// Rótulo de tamaño constante en pantalla, siempre visible.
function etiqueta(destino, titulo, sub, [x, y, z], { bg = '#1f2933', fg = '#ffffff', h = 0.05 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = sub ? 512 : 256;
  cv.height = sub ? 160 : 96;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(4, 4, cv.width - 8, cv.height - 8, 24);
  g.fill();
  g.stroke();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 58px system-ui, sans-serif';
  g.fillText(titulo, cv.width / 2, sub ? 60 : cv.height / 2 + 2, cv.width - 30);
  if (sub) {
    g.font = '500 38px system-ui, sans-serif';
    g.fillText(sub, cv.width / 2, 117, cv.width - 30);
  }
  const textura = new THREE.CanvasTexture(cv);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, transparent: true, depthTest: false, sizeAttenuation: false }));
  sprite.position.set(x, y, z);
  sprite.scale.set(h * cv.width / cv.height, h, 1);
  sprite.renderOrder = 20;
  destino.add(sprite);
  return sprite;
}

const estiloPared = { bg: '#17676b' };
const nombresParedes = [
  ['Pared A', 'Puerta', [-ancho / 2 + 0.02, 2.3, -0.2]],
  ['Pared B', 'Ventana', [0.55, 2.43, -largo / 2 + 0.05]],
  ['Pared C', 'Placard', [ancho / 2 - 0.02, 2.2, -0.5]],
  ['Pared D', 'Frente', [0, 2.0, largo / 2]]
];
for (const [titulo, sub, pos] of nombresParedes) etiqueta(grupoEtiquetas, titulo, sub, pos, estiloPared);

const nombresObjetos = [
  ['Escritorio', '100 × 45 × 75 cm', [escX, escAlto + 0.62, escZ]],
  ['Placard', '200 × 40 × 180 cm', [placardX, placardAlto + 0.28, placardZ]],
  ['Cama', '190 × 100 cm', [camaX, 0.95, camaZ]],
  ['Ventana', '167 × 157 cm', [-0.45, vBase + vh / 2, -largo / 2 + 0.1]],
  ['Puerta', '65 × 202 cm', [-ancho / 2 + 0.2, puertaAlto + 0.22, zPuerta]],
  ['Silla de oficina', 'Con ruedas', [sillaX, 1.2, sillaZ]],
  ['PC', '20 × 42 × 44 cm', [pcX, 0.5, pcZ]]
];
for (const [titulo, sub, pos] of nombresObjetos) etiqueta(grupoEtiquetas, titulo, sub, pos);

// Cotas: líneas de medida con marcas diagonales y texto.
const matCota = new THREE.LineBasicMaterial({ color: '#e08a1e', depthTest: false, transparent: true });

function cota(a, b, texto, desvio) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), O = new THREE.Vector3(...desvio);
  const dir = O.clone().normalize();
  const A2 = A.clone().add(O), B2 = B.clone().add(O);
  const marcaVec = B.clone().sub(A).normalize().add(dir).normalize().multiplyScalar(0.05);
  const sobresale = dir.clone().multiplyScalar(0.04);

  const lineas = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      A, A2.clone().add(sobresale),
      B, B2.clone().add(sobresale),
      A2, B2,
      A2.clone().sub(marcaVec), A2.clone().add(marcaVec),
      B2.clone().sub(marcaVec), B2.clone().add(marcaVec)
    ]),
    matCota
  );
  lineas.renderOrder = 10;
  grupoMedidas.add(lineas);

  const medio = A2.clone().add(B2).multiplyScalar(0.5).add(dir.multiplyScalar(0.1));
  etiqueta(grupoMedidas, texto, null, [medio.x, medio.y, medio.z], { bg: '#e08a1e', fg: '#1a1206', h: 0.03 });
}

const xi = -ancho / 2 + 0.01;       // cara interior de la pared A
const zi = -largo / 2 + 0.08;       // delante de la ventana
const xo = ancho / 2 + t;           // cara exterior de la pared C
const cm = n => Math.round(n * 100) + ' cm';

const cotas = [
  // Habitación
  [[-ancho / 2, 0.01, largo / 2], [ancho / 2, 0.01, largo / 2], '250 cm', [0, 0, 0.4]],
  [[xo, 0.01, -largo / 2], [xo, 0.01, largo / 2], '300 cm', [0.4, 0, 0]],
  [[xo, 0, -largo / 2], [xo, alto, -largo / 2], '260 cm', [0.4, 0, 0]],
  // Ventana
  [[-vw / 2, vBase, zi], [vw / 2, vBase, zi], '167 cm', [0, -0.18, 0]],
  [[-vw / 2, vBase, zi], [-vw / 2, vSup, zi], '157 cm', [-0.2, 0, 0]],
  // Puerta y separación con el escritorio
  [[xi, puertaAlto, zInicio], [xi, puertaAlto, zFin], '65 cm', [0, 0.18, 0]],
  [[xi, 0, zFin], [xi, puertaAlto, zFin], '202 cm', [0, 0, -0.2]],
  [[xi, 0.01, zFin], [xi, 0.01, z1], cm(sepEscritorio), [0.25, 0, 0]],
  // Escritorio
  [[escFrente, escAlto, z1], [escFrente, escAlto, z2], '100 cm', [0.2, 0, 0]],
  [[-ancho / 2, escAlto, z2], [escFrente, escAlto, z2], '45 cm', [0, 0, -0.2]],
  [[escFrente, 0.01, z2], [escFrente, escAlto, z2], '75 cm', [0.2, 0, 0]],
  // Placard
  [[pFrente, placardAlto, -largo / 2], [pFrente, placardAlto, -largo / 2 + placardLargo], '200 cm', [-0.2, 0, 0]],
  [[pFrente, placardAlto, -largo / 2], [ancho / 2, placardAlto, -largo / 2], '40 cm', [0, 0.2, 0]],
  [[pFrente, 0.01, -largo / 2], [pFrente, placardAlto, -largo / 2], '180 cm', [0, 0, -0.2]],
  // Cama
  [[camaX - camaLargo / 2, colchonTop, largo / 2], [ancho / 2, colchonTop, largo / 2], '190 cm', [0, 0, 0.2]],
  [[camaX - camaLargo / 2, colchonTop, largo / 2 - camaAncho], [camaX - camaLargo / 2, colchonTop, largo / 2], '100 cm', [-0.2, 0, 0]],
  [[camaX - camaLargo / 2, 0.01, largo / 2], [camaX - camaLargo / 2, colchonTop, largo / 2], '50 cm', [0, 0, 0.2]]
];
for (const c of cotas) cota(...c);

// ================================================
// INFORMACIÓN DE OBJETOS
// ================================================

const INFO = {
  'Pared A': ['Pared A', '300 × 260 cm', 'Pared de la puerta y el escritorio. Queda a la izquierda al mirar la ventana.'],
  'Pared B': ['Pared B', '250 × 260 cm', 'Pared de la ventana.'],
  'Pared C': ['Pared C', '300 × 260 cm', 'Pared del placard. La cama apoya la cabecera contra ella.'],
  'Pared D': ['Pared D', '250 × 260 cm', 'Pared frente a la ventana. Se muestra abierta para poder ver el interior.'],
  'Piso': ['Piso', '300 × 250 cm', 'Superficie: 7,5 m².'],
  'Techo': ['Techo', '300 × 250 cm', 'Altura de la habitación: 260 cm.'],
  'Puerta': ['Puerta', '65 × 202 cm', 'En la pared A, a 6 cm de la esquina con la pared D.'],
  'Ventana': ['Ventana', '167 × 157 cm', 'Centrada en la pared B, a 40 cm del piso.'],
  'Taparrollo': ['Taparrollo', '167 × 33 cm', 'Altura de instalación provisional.'],
  'Monitor': ['Monitor', '54 × 32 cm (pantalla)', 'Sobre el escritorio, centrado. Medida típica de 24 pulgadas.'],
  'Teclado': ['Teclado', '44 × 14 cm', 'Frente al monitor.'],
  'Mousepad': ['Mousepad', '24 × 20 cm', 'A la derecha del teclado.'],
  'Mouse': ['Mouse', '11,5 × 6,5 cm', 'Sobre el mousepad.'],
  'PC': ['PC', '20 × 42 × 44 cm', 'Gabinete debajo del escritorio, del lado de la ventana.'],
  'Silla': ['Silla de oficina', '66 cm de diámetro × 100 cm de alto', 'Con ruedas, columna de gas, respaldo de malla y apoyabrazos.'],
  'Escritorio': ['Escritorio', '100 × 45 × 75 cm', 'Ancho × profundidad × alto. Apoyado en la pared A, a ' + cm(sepEscritorio) + ' de la puerta.'],
  'Placard': ['Placard', '200 × 40 × 180 cm', 'Largo × profundidad × alto. Contra la pared C, desde la esquina con la pared B.'],
  'Cama': ['Cama', '190 × 100 cm', 'Cabecera contra la pared C y pies hacia la puerta. Parte superior del colchón a 50 cm.'],
  'Cama: colchón': ['Colchón', '190 × 100 cm aprox.', 'Parte superior a 50 cm del piso.'],
  'Cama: cabecera': ['Cabecera', '100 cm de alto', 'Medida desde el piso.'],
  'Cama: almohada': ['Almohada', '36 × 27 cm', 'Apoyada sobre el colchón.']
};

const details = $('#details');

function mostrarInfo(objeto) {
  const nombre = objeto.name;
  const [titulo, medidas, detalle] = INFO[nombre] || INFO[nombre.split(':')[0]] || [nombre, '', 'Elemento de la habitación.'];
  details.innerHTML = `<strong>${titulo}</strong>${medidas ? `<p><b>Medidas:</b> ${medidas}</p>` : ''}<p>${detalle}</p>`;
}

// ================================================
// SELECCIÓN CON EL MOUSE
// ================================================

// Estructura: paredes, piso y techo. Se revisan solo si el clic no toca un mueble.
const estructura = [...paredes, piso, techo];
const muebles = scene.children.filter(o => o.isMesh && !o.name.startsWith('Pared') && o !== piso && o !== techo);

const resaltado = new THREE.BoxHelper(piso, '#e08a1e');
resaltado.material.depthTest = false;
resaltado.renderOrder = 15;
resaltado.visible = false;
scene.add(resaltado);

const raycaster = new THREE.Raycaster();
const puntero = new THREE.Vector2();
let inicioClic = null;

canvas.addEventListener('pointerdown', e => { inicioClic = { x: e.clientX, y: e.clientY }; });

canvas.addEventListener('pointerup', e => {
  if (!inicioClic) return;
  const movimiento = Math.hypot(e.clientX - inicioClic.x, e.clientY - inicioClic.y);
  inicioClic = null;
  if (movimiento > 5) return;   // fue un giro de cámara, no un clic

  const rect = canvas.getBoundingClientRect();
  puntero.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(puntero, camera);

  // El raycaster no ignora objetos ocultos, por eso se filtra por visible.
  let impactos = raycaster.intersectObjects(muebles.filter(o => o.visible), false);
  if (!impactos.length) impactos = raycaster.intersectObjects(estructura.filter(o => o.visible), false);
  if (!impactos.length) return;

  const objeto = impactos[0].object;
  mostrarInfo(objeto);
  resaltado.setFromObject(objeto);
  resaltado.visible = true;
  pedirRender();
});

// ================================================
// BOTONES
// ================================================

function alternar(boton, objetivo, inicial) {
  const fijar = visible => {
    objetivo.visible = visible;
    boton.setAttribute('aria-pressed', String(visible));
    pedirRender();
  };
  fijar(inicial);
  boton.addEventListener('click', () => fijar(!objetivo.visible));
}

alternar($('#toggleRoof'), techo, false);
alternar($('#toggleLabels'), grupoEtiquetas, true);
alternar($('#measure-btn'), grupoMedidas, false);

$('#view3d').addEventListener('click', () => irA(posicionInicial.clone(), objetivoInicial.clone()));
$('#viewTop').addEventListener('click', () => irA(new THREE.Vector3(0, 7, 0.01), new THREE.Vector3(0, 0, 0)));

// ================================================
// TEMA CLARO / OSCURO
// ================================================

function aplicarTema(oscuro) {
  const c = oscuro ? TEMAS.oscuro : TEMAS.claro;
  scene.background.set(c.fondo);
  matPiso.color.set(c.piso);
  matPared.color.set(c.pared);
  matPared.opacity = c.paredOp;
  matParedC.color.set(c.pared);
  matParedC.opacity = c.paredOp * 0.35;
  scene.environmentIntensity = c.env;
  matTecho.color.set(c.techo);
  hemi.intensity = c.hemi;
  sol.intensity = c.sol;
  punto.intensity = c.punto;
  pedirRender();
}

window.addEventListener('themechange', e => aplicarTema(e.detail.dark));
aplicarTema(document.body.classList.contains('dark-mode'));

// ================================================
// REDIMENSIONAMIENTO Y ANIMACIÓN
// ================================================

function ajustarTamano() {
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  pedirRender();
}
new ResizeObserver(ajustarTamano).observe(container);

let ultimo = performance.now();

function animate(ahora) {
  requestAnimationFrame(animate);
  const dt = Math.min((ahora - ultimo) / 1000, 0.05);
  ultimo = ahora;

  if (vuelo) {
    const k = 1 - Math.exp(-dt * 9);   // movimiento suave, igual en cualquier pantalla
    camera.position.lerp(vuelo.pos, k);
    controls.target.lerp(vuelo.objetivo, k);
    if (camera.position.distanceTo(vuelo.pos) < 0.005 && controls.target.distanceTo(vuelo.objetivo) < 0.005) vuelo = null;
    sucio = true;
  }
  if (controls.update()) sucio = true;

  if (sucio) {
    sucio = false;
    renderer.render(scene, camera);
  }
}
requestAnimationFrame(animate);