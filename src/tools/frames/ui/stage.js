import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { h } from "../../../shell/h.js";
import { segmented } from "../../../shell/widgets.js";
import { platePlan } from "./export.js";
import { project, result, view } from "./state.js";

const css = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

// How far each kind of part moves in the exploded view: [z, radial]
const LIFT = {
  back: [-26, 6],
  key: [-26, 0],
  stand: [-40, 0],
  frame: [0, 12],
  mat: [16, 6],
  spacer: [28, 6],
  stamp: [8, 6],
  litho: [8, 0],
};
const liftOf = (name, role) => LIFT[name.split("_")[0]] ?? LIFT[role] ?? [0, 0];

export function createStage() {
  const canvasWrap = h("div", { class: "canvas" });
  const busy = h("div", { class: "busy", role: "status" });
  const tools = h("div", { class: "viewtools" });
  const status = h("div", { class: "status" });
  const root = h("main", { class: "stage" }, canvasWrap, tools, busy, status);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  canvasWrap.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 12000);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-150, 220, 360);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(200, -100, 160);
  scene.add(fill);

  const mats = new Map();
  const matFor = (color) => {
    if (!mats.has(color))
      mats.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.55, flatShading: true }),
      );
    return mats.get(color);
  };
  const colorOf = (q, colors) =>
    q.role === "frame"
      ? colors.frame
      : q.role === "mat"
        ? colors.mat
        : q.role === "litho"
          ? "#e8dfcf"
          : colors.back;

  const group = new THREE.Group();
  scene.add(group);
  let current = null;
  let framedFor = null;
  const loader = new THREE.TextureLoader();
  let photoTex = null;
  let photoUrl = null;

  const geometry = (mesh, shift = [0, 0, 0]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geo.computeVertexNormals();
    geo.translate(...shift);
    return geo;
  };

  function clear() {
    for (const o of group.children.splice(0)) {
      o.geometry?.dispose();
      if (o === photoPlane) o.material.dispose(); // the other materials are shared
    }
  }
  let photoPlane = null;

  function frameCamera(r, topDown) {
    if (topDown) camera.position.set(r * 0.05, -r * 0.05, r * 2.2);
    else camera.position.set(0, -r * 0.55, r * 1.9);
    orbit.target.set(0, 0, 0);
    orbit.minDistance = r * 0.3;
    orbit.maxDistance = r * 10;
  }

  function build() {
    clear();
    photoPlane = null;
    const { mode } = view.get();
    const p = project.get();
    const res = result.get().part;
    if (!res) return;
    if (mode === "plates") {
      const { x, y } = p.print;
      const { items } = platePlan(res, { x, y });
      const nPlates = Math.max(1, ...items.map((i) => i.plate + 1));
      const cols = Math.ceil(Math.sqrt(nPlates));
      const at = (n) => [(n % cols) * x * 1.2, -Math.floor(n / cols) * y * 1.2];
      for (let n = 0; n < nPlates; n++) {
        const [ox, oy] = at(n);
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(x, y, 1),
          matFor(css("--m-floor", "#e2d8c4")),
        );
        slab.position.set(ox + x / 2, oy + y / 2, -0.6);
        group.add(slab);
      }
      for (const it of items) {
        const [ox, oy] = at(it.plate);
        const q = res.parts.find((s) => s.name === it.name);
        group.add(
          Object.assign(
            new THREE.Mesh(
              geometry(it.mesh, [ox + it.x, oy + it.y, 0]),
              matFor(colorOf(q, p.colors)),
            ),
            {},
          ),
        );
      }
      const cx = ((cols - 1) * x * 1.2 + x) / 2;
      const rowsN = Math.ceil(nPlates / cols);
      const cy = -((rowsN - 1) * y * 1.2) / 2 + y / 2;
      group.position.set(-cx, -cy, 0);
      const r = Math.max(x * (cols * 1.2), y * (rowsN * 1.2));
      if (framedFor !== "plates") frameCamera(r, true);
      framedFor = "plates";
      return;
    }
    group.position.set(0, 0, 0);
    const e = mode === "exploded" ? 1 : 0;
    for (const q of res.parts) {
      const [lz, lr] = liftOf(q.name, q.role);
      const cx = q.min[0] + q.size[0] / 2;
      const cy = q.min[1] + q.size[1] / 2;
      const len = Math.hypot(cx, cy) || 1;
      const multi = res.parts.filter((s) => s.role === q.role).length > 1 && q.role !== "key";
      const rad = multi ? lr : 0;
      const mesh = new THREE.Mesh(
        geometry(q.mesh, [(cx / len) * rad * e, (cy / len) * rad * e, lz * e]),
        matFor(colorOf(q, p.colors)),
      );
      group.add(mesh);
    }
    const L = res.layers;
    if (!p.litho.on && res.photo && L.zPhoto != null) {
      const [pw, ph] = res.photo;
      photoPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(pw - 0.4, ph - 0.4),
        new THREE.MeshStandardMaterial({
          color: photoTex ? "#ffffff" : "#b9c7d6",
          map: photoTex,
          roughness: 0.9,
        }),
      );
      photoPlane.position.set(0, 0, L.zPhoto + L.pt + 0.02 + 10 * e);
      group.add(photoPlane);
    }
    const r = Math.max(res.outer[0], res.outer[1]);
    const key2 = `${mode === "plates"}:${Math.round(r / 50)}`;
    if (framedFor !== key2) frameCamera(r, false);
    framedFor = key2;
  }

  function setPhoto(url) {
    if (url === photoUrl) return;
    photoUrl = url;
    photoTex?.dispose();
    photoTex = null;
    if (url) {
      loader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        photoTex = t;
        build();
      });
    } else build();
  }

  const modeBar = segmented({
    value: view.get().mode,
    options: [
      { value: "assembled", label: "Assembled" },
      { value: "exploded", label: "Exploded" },
      { value: "plates", label: "Plates" },
    ],
    onChange: (mode) => {
      framedFor = null;
      view.set({ mode });
    },
  });
  tools.append(modeBar);

  const resize = () => {
    const { clientWidth: w, clientHeight: hh } = canvasWrap;
    if (!w || !hh) return;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvasWrap);

  result.subscribe(({ status: st, part, error }) => {
    busy.dataset.state = st === "ok" ? "" : st;
    busy.textContent = st === "loading" ? "Building…" : st === "error" ? error : "";
    if (st === "ok" && part) {
      current = part;
      status.textContent = `${part.size.map((v) => v.toFixed(1)).join(" × ")} mm · ${part.parts.length} part${part.parts.length > 1 ? "s" : ""} · ${part.triangles.toLocaleString()} triangles`;
      build();
    }
  });
  view.subscribe((v) => {
    setPhoto(v.photoUrl);
    if (current) build();
  });
  project.subscribe(() => current && build());

  (function loop() {
    renderer.setClearColor(css("--m-bg", "#efe8da"));
    orbit.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
  return root;
}
