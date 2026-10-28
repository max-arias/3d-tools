import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { h } from "../../../shell/h.js";
import { langStore, t } from "../lib/i18n.js";
import { result, view } from "./state.js";

const css = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** How far the lid lifts off when the view is open, in mm. */
const LIFT = 60;

/** Hooks other modules use: camera reset. Filled in by createStage. */
export const stageApi = { resetView: () => {} };

const geometryOf = (mesh) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geo.computeVertexNormals();
  return geo;
};

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
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-150, 300, 360);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(200, -100, 160);
  scene.add(key, fill);

  // The box is modelled Z-up (x across the front, y toward the back); this group stands it up.
  const world = new THREE.Group();
  world.rotation.x = -Math.PI / 2;
  scene.add(world);
  const content = new THREE.Group();
  const lidGroup = new THREE.Group();
  world.add(content, lidGroup);

  const mat = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      ...extra,
    });
  // base and lid one colour, latches/hinges/label/handle the accent, label text dark, bins a third.
  const mats = {
    shell: mat("#aeb4c0"),
    accent: mat("#d9622b"),
    text: mat("#1d1a17"),
    bin: mat("#3f9d94"),
  };
  const materialFor = (kind, body) =>
    kind === "base" || kind === "lid"
      ? mats.shell
      : kind === "bin"
        ? mats.bin
        : kind === "label" && body > 0
          ? mats.text
          : mats.accent;

  let geos = [];
  let framed = null;
  const disposeContent = () => {
    for (const g of geos) g.dispose();
    geos = [];
    content.clear();
    lidGroup.clear();
  };

  /** Fit the closed box in view, seen from the front, a little right and above. */
  function frame(dims) {
    const W = dims.W;
    const D = dims.D;
    const H = dims.closedH;
    // Scene coordinates: x across, y up, z toward the viewer (modelled y runs away from it).
    const target = new THREE.Vector3(W / 2, H / 2, -D / 2);
    const radius = Math.hypot(W, D, H + LIFT / 2) / 2;
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const dist = (radius / (half * Math.min(1, camera.aspect))) * 1.05;
    camera.position
      .copy(target)
      .add(new THREE.Vector3(0.45, 0.55, 0.9).normalize().multiplyScalar(dist));
    orbit.target.copy(target);
    orbit.minDistance = 30;
    orbit.maxDistance = dist * 4 + 1000;
  }

  /** Rebuild the scene from the latest result: every entry of `scene` places a part's meshes. */
  function build() {
    const { data } = result.get();
    if (!data) return;
    disposeContent();
    const parts = new Map(data.parts.map((p) => [p.id, p]));
    const shared = new Map();
    for (const { id, matrix } of data.scene) {
      const part = parts.get(id);
      if (!part) continue;
      part.bodies.forEach((body, i) => {
        const k = `${id}#${i}`;
        if (!shared.has(k)) {
          const geo = geometryOf(body.mesh);
          geos.push(geo);
          shared.set(k, geo);
        }
        const mesh = new THREE.Mesh(shared.get(k), materialFor(part.kind, i));
        mesh.matrixAutoUpdate = false;
        mesh.matrix.fromArray(matrix);
        (part.kind === "lid" ? lidGroup : content).add(mesh);
      });
    }
    const sig = `${data.dims.W}x${data.dims.D}x${data.dims.closedH}`;
    if (framed !== sig) {
      frame(data.dims);
      framed = sig;
    }
  }

  const reset = h("button", { title: "R", onclick: () => stageApi.resetView() });
  const lidBtn = h("label", { class: "check" });
  const paintTools = () => {
    const box = h("input", {
      type: "checkbox",
      checked: view.get().open,
      dataset: { key: "view.open" },
      onchange: () => view.set({ open: box.checked }),
    });
    lidBtn.replaceChildren(box, h("span", {}, t("openLid")));
    reset.textContent = t("resetView");
  };
  tools.append(lidBtn, reset);
  langStore.subscribe(paintTools);
  view.subscribe(paintTools);
  paintTools();

  const resize = () => {
    const { clientWidth: w, clientHeight: hh } = canvasWrap;
    if (!w || !hh) return;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvasWrap);

  const paintStatus = () => {
    const { status: st, data, error } = result.get();
    busy.dataset.state = st === "ok" ? "" : st;
    busy.textContent = st === "loading" ? t("building") : st === "error" ? error : "";
    if (data) {
      const d = data.dims;
      const tris = data.parts.reduce(
        (n, x) => n + x.bodies.reduce((m, b) => m + b.mesh.indices.length / 3, 0),
        0,
      );
      status.textContent = `${d.W.toFixed(1)} × ${d.D.toFixed(1)} × ${d.closedH.toFixed(1)} mm · ${tris.toLocaleString()} ${t("triangles")}`;
    }
  };
  let built = null;
  result.subscribe(({ status: st, data }) => {
    paintStatus();
    if (st === "ok" && data && data !== built) {
      built = data;
      build();
    }
  });
  langStore.subscribe(paintStatus);

  stageApi.resetView = () => {
    framed = null;
    build();
  };

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lift = 0;
  (function loop() {
    scene.background = new THREE.Color(css("--m-bg", "#efe8da"));
    const goal = view.get().open ? LIFT : 0;
    lift = still ? goal : lift + (goal - lift) * 0.18;
    lidGroup.position.z = lift;
    orbit.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
  return root;
}
