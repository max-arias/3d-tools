// The "Room" view: a bedside corner (wall, floor, Poly Haven CC0 nightstand) for the lamp to sit in
// or hang over. Units are mm, y is up, the tabletop is y = 0 and the wall is the plane z = WALL_Z.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const WALL_Z = -180;
export const FLOOR_Y = -700;
export const CEILING_Y = 1700;
const STAND = "ClassicNightstand_01";

const std = (color, roughness = 0.8, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });

let standLoad = null;
/** The nightstand glTF (ships in /models/room/, loaded when the Room view first opens). */
export function loadStand() {
  standLoad ??= new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}models/room/${STAND}/${STAND}.gltf`)
    .then((g) => {
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });
      return g.scene;
    });
  standLoad.catch(() => (standLoad = null));
  return standLoad;
}

/** Walls, floor and the nightstand, with soft room lighting. Built once and kept. */
export function buildRoom(stand) {
  const room = new THREE.Group();
  const plane = (w, h, color, x, y, z, rotX = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std(color, 0.95));
    m.position.set(x, y, z);
    m.rotation.x = rotX;
    m.receiveShadow = true;
    return m;
  };
  room.add(plane(6000, CEILING_Y - FLOOR_Y, "#d9d0c3", 0, (CEILING_Y + FLOOR_Y) / 2, WALL_Z));
  room.add(plane(6000, 4000, "#8c6b4c", 0, FLOOR_Y, 0, -Math.PI / 2));
  room.add(plane(6000, 4000, "#ece6da", 0, CEILING_Y, 0, Math.PI / 2));

  const k = 1000;
  stand.position.set(0, 0, 0);
  stand.scale.setScalar(k);
  stand.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(stand);
  const c = b.getCenter(new THREE.Vector3());
  // Top of the nightstand at y = 0, back against the wall.
  stand.position.set(-c.x, -b.max.y, WALL_Z + (b.max.z - b.min.z) / 2 - c.z);
  room.add(stand);

  const sun = new THREE.DirectionalLight("#fff1dc", 1.2);
  sun.position.set(-500, 700, 700);
  room.add(sun);
  room.add(new THREE.HemisphereLight("#fff6e8", "#6b5a4a", 0.9));
  return room;
}

/** A small ceramic base for the table lamp, from the tabletop up to `top` with a pole above it. */
export function tableBase(top) {
  const g = new THREE.Group();
  const pts = [
    [0, 0],
    [60, 0],
    [78, top * 0.3],
    [66, top * 0.75],
    [26, top * 0.97],
    [10, top],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), std("#e9e1d3", 0.35));
  body.castShadow = true;
  g.add(body);
  return g;
}

/** Cord from the shade's top to the ceiling, and a canopy. */
export function ceilingCord(fromY) {
  const g = new THREE.Group();
  const len = CEILING_Y - fromY;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, len, 8), std("#1c1a18", 0.6));
  cord.position.y = fromY + len / 2;
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(45, 55, 14, 32), std("#2a2724", 0.5));
  canopy.position.y = CEILING_Y - 7;
  g.add(cord, canopy);
  return g;
}
