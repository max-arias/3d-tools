import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Real furniture for the hallway view: Poly Haven (CC0) glTF models in public/models/hall/ (and the
// plant from the Frames room). They are in metres; the scene is in mm, y up, the switch wall at z = 0.
const PROPS = {
  console: "hall/ClassicConsole_01",
  lamp: "hall/modern_ceiling_lamp_01",
  frame: "hall/hanging_picture_frame_02",
  plant: "room/potted_plant_04",
};
let load = null;

/** Load the props once (they are fetched only when the hallway view first opens). */
export function loadHallProps() {
  load ??= (async () => {
    const loader = new GLTFLoader();
    const out = {};
    await Promise.all(
      Object.entries(PROPS).map(async ([key, path]) => {
        const id = path.split("/").pop();
        const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${path}/${id}.gltf`);
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = o.receiveShadow = true;
        });
        out[key] = g.scene;
      }),
    );
    return out;
  })();
  load.catch(() => (load = null));
  return load;
}

/** Scale `obj` by `k` (metres to mm for the models), then put its bounding box centre at (x, z) with the bottom at y. */
export function place(obj, k, x, y, z, rotY = 0) {
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, rotY, 0);
  obj.scale.setScalar(k);
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  const c = b.getCenter(new THREE.Vector3());
  obj.position.set(x - c.x, y - b.min.y, z - c.z);
  return obj;
}
