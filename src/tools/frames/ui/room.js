import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// A small bedroom corner for the "Room" view: wall, floor and Poly Haven (CC0) props on a nightstand.
// Units are mm, y is up, the wall is the plane z = WALL_Z and the tabletop is y = 0.
export const WALL_Z = -180;

const std = (color, roughness = 0.8, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function mesh(geo, mat, x, y, z, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

const PROPS = {
  stand: "ClassicNightstand_01",
  lamp: "vintage_oil_lamp",
  plant: "potted_plant_04",
  clock: "alarm_clock_01",
};
const STAND_W = 0.568; // nightstand model width in metres, for scaling it up under wide frames
let propsLoad = null;

/** Load the glTF props once (they ship in /models/room/); resolves to { stand, lamp, plant, clock }. */
export function loadProps() {
  propsLoad ??= (async () => {
    const loader = new GLTFLoader();
    const out = {};
    await Promise.all(
      Object.entries(PROPS).map(async ([key, id]) => {
        const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/room/${id}/${id}.gltf`);
        g.scene.traverse((o) => {
          o.userData.shared = true;
          if (!o.isMesh) return;
          const m = o.material;
          const glass = /glass/i.test(m.name);
          o.castShadow = !glass && !/flame/i.test(m.name);
          o.receiveShadow = true;
          if (glass)
            Object.assign(m, {
              map: null,
              color: new THREE.Color("#ffffff"),
              opacity: 0.18,
              transparent: true,
              depthWrite: false,
            });
        });
        out[key] = g.scene;
      }),
    );
    return out;
  })();
  propsLoad.catch(() => (propsLoad = null));
  return propsLoad;
}

/** Scale `obj` by `k`, then put its bounding box's bottom centre at (x, y, z). */
function stand(obj, k, x, y, z, rotY = 0) {
  obj.removeFromParent();
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, rotY, 0);
  obj.scale.setScalar(k);
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  const c = b.getCenter(new THREE.Vector3());
  obj.position.set(x - c.x, y - b.min.y, z - c.z);
  return obj;
}

/** @param {number} tw wanted nightstand width in mm; the model scales up to fit, to 1.8x */
export function buildRoom(tw, props) {
  const room = new THREE.Group();
  const k = Math.min(1.8, Math.max(1, tw / (STAND_W * 1000)));
  const w = STAND_W * 1000 * k;
  const d = 424 * k;
  const floorY = -700 * k;

  // Shell
  room.add(
    mesh(new THREE.PlaneGeometry(6000, 3200), std("#d9d0c3", 0.95), 0, floorY + 1500, WALL_Z, {
      cast: false,
    }),
  );
  const floor = mesh(new THREE.PlaneGeometry(6000, 4000), std("#8c6b4c", 0.7), 0, floorY, 0, {
    cast: false,
  });
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);
  room.add(box(6000, 90, 12, std("#f1ece3", 0.6), 0, floorY + 45, WALL_Z + 6));

  // Nightstand: top surface at y = 0, back against the wall, legs on the floor
  const tz = WALL_Z + d / 2;
  const nightstand = stand(props.stand, 1000 * k, 0, floorY, tz);
  room.add(nightstand);

  // Oil lamp (left), plant (right), alarm clock (front right)
  const lamp = stand(props.lamp, 400, -(w / 2 - 80), 0, WALL_Z + 100);
  room.add(lamp);
  room.add(stand(props.plant, 1000, w / 2 - 80, 0, WALL_Z + 90));
  room.add(stand(props.clock, 850, w / 2 - 70, 0, WALL_Z + d - 110, -0.5));

  const glow = new THREE.PointLight("#ffb866", 1.3, 1500, 1);
  glow.position.set(-(w / 2 - 80), 0.5 * 400 * 0.8 + 14, WALL_Z + 100);
  glow.castShadow = true;
  glow.shadow.mapSize.set(1024, 1024);
  glow.shadow.bias = -0.002;
  glow.shadow.normalBias = 1;
  room.add(glow);

  // Window-ish daylight from the front left, plus soft ambient
  const sun = new THREE.DirectionalLight("#fff1dc", 2.4);
  sun.position.set(-500, 700, 700);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -700;
  sc.right = sc.top = 700;
  sc.near = 100;
  sc.far = 2500;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 3;
  room.add(sun, sun.target);
  room.add(new THREE.HemisphereLight("#fff6e8", "#6b5a4a", 1.8));
  return room;
}

/** Depth of the nightstand top in mm for a given width, so the frame can be set toward its front. */
export const standDepth = (tw) => 424 * Math.min(1.8, Math.max(1, tw / (STAND_W * 1000)));

let cat = null;
/** A cute cartoon cat on a warm background, drawn to a canvas texture of the given aspect (w / h). */
export function catTexture(aspect) {
  const key = aspect.toFixed(2);
  if (cat?.key === key) return cat.tex;
  const W = 640;
  const H = Math.round(W / aspect);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const s = Math.min(W, H) / 600; // the cat is drawn in a 600-unit square, centred
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#ffe9c9");
  bg.addColorStop(1, "#f7bfa0");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.translate(W / 2, H / 2 + 20 * s);
  g.scale(s, s);
  const fill = (color, path) => {
    g.fillStyle = color;
    g.beginPath();
    path();
    g.fill();
  };
  const stroke = (color, width, path) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = "round";
    g.beginPath();
    path();
    g.stroke();
  };
  const fur = "#f0a24b";
  const dark = "#c9792a";
  // tail, body, paws
  stroke(fur, 46, () => g.arc(150, 150, 120, 0.2, 2.6, true));
  fill(fur, () => g.ellipse(0, 150, 150, 170, 0, 0, 7));
  fill("#fff4e4", () => g.ellipse(0, 190, 80, 120, 0, 0, 7));
  fill("#fff4e4", () => g.ellipse(-55, 300, 50, 32, 0, 0, 7));
  fill("#fff4e4", () => g.ellipse(55, 300, 50, 32, 0, 0, 7));
  for (const x of [-100, 100])
    for (const y of [90, 140, 190])
      stroke(dark, 14, () => {
        g.moveTo(x, y);
        g.lineTo(x + Math.sign(x) * -45, y + 8);
      });
  // ears, head
  for (const sx of [-1, 1]) {
    fill(fur, () => {
      g.moveTo(sx * 40, -190);
      g.lineTo(sx * 150, -300);
      g.lineTo(sx * 175, -130);
    });
    fill("#f7a3b0", () => {
      g.moveTo(sx * 75, -185);
      g.lineTo(sx * 142, -252);
      g.lineTo(sx * 150, -150);
    });
  }
  fill(fur, () => g.ellipse(0, -80, 185, 150, 0, 0, 7));
  for (const x of [-30, 0, 30])
    stroke(dark, 12, () => {
      g.moveTo(x, -228);
      g.lineTo(x * 0.8, -190);
    });
  // face
  fill("#fff4e4", () => g.ellipse(0, -30, 95, 70, 0, 0, 7));
  for (const sx of [-1, 1]) {
    fill("#2a1d1a", () => g.ellipse(sx * 70, -95, 30, 38, 0, 0, 7));
    fill("#ffffff", () => g.arc(sx * 70 + 9, -108, 11, 0, 7));
    fill("#ffffff", () => g.arc(sx * 70 - 8, -84, 5, 0, 7));
    fill("rgba(255,120,140,0.45)", () => g.ellipse(sx * 125, -35, 30, 20, 0, 0, 7));
    for (const dy of [-10, 14])
      stroke("#5b4a42", 4, () => {
        g.moveTo(sx * 105, -32 + dy * 0.4);
        g.lineTo(sx * 215, -45 + dy * 2);
      });
  }
  fill("#f27d95", () => {
    g.moveTo(-14, -48);
    g.lineTo(14, -48);
    g.lineTo(0, -30);
  });
  stroke("#5b4a42", 5, () => {
    g.moveTo(0, -30);
    g.lineTo(0, -16);
    g.moveTo(-26, -8);
    g.quadraticCurveTo(-12, 6, 0, -16);
    g.quadraticCurveTo(12, 6, 26, -8);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cat = { key, tex };
  return tex;
}

let catGrey = null;
/** The cartoon cat as a grey picture, for the lithophane preview when no picture is loaded. */
export function sampleSource() {
  if (catGrey) return catGrey;
  const c = catTexture(0.7).image;
  const g = c.getContext("2d", { willReadFrequently: true });
  const rgba = g.getImageData(0, 0, c.width, c.height).data;
  const gray = new Uint8Array(c.width * c.height);
  for (let i = 0; i < gray.length; i++)
    gray[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  catGrey = { w: c.width, h: c.height, gray };
  return catGrey;
}
