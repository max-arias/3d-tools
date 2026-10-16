import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { h } from "../../../shell/h.js";
import { projects, ui, setUi, getLayout } from "./state.js";
import { effectiveBin, binHeight } from "../model/effective.js";
import { isValid, moveRect } from "../layout/bins.js";

const cssColor = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
const EXPLODE = { bin: 40, binKey: 80, lid: 75, tileKey: -25, spread: 6 / 170 };
export function createViewer() {
  const wrap = h("div", { class: "v3-wrap" });
  const root = h("section", { class: "pane pane-3d", "data-guide": "view" }, wrap);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.AgXToneMapping;
  wrap.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 2e4);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -800, 800);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3c40, 0.55));
  for (const [pos, intensity] of [
    [[-400, -700, 900], 1.5],
    [[600, -200, 350], 0.45],
    [[200, 800, 500], 0.35],
    [[300, 500, -900], 0.9],
  ]) {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.position.set(...pos);
    scene.add(light);
  }

  const content = new THREE.Group(); // rebuilt when the result changes
  const overlay = new THREE.Group(); // ghost + handles
  scene.add(content, overlay);

  let colors = {};
  let meshes = []; // { mesh, edges, part, base: Vector3 }
  let dirty = true;
  const markDirty = () => (dirty = true);

  const readColors = () => {
    colors = Object.fromEntries(
      ["bg", "floor", "bp", "bin1", "bin2", "bin3", "key", "edge", "sel"].map((k) => [
        k,
        new THREE.Color(cssColor(`--m-${k}`)),
      ]),
    );
  };

  // ---- scene content ----------------------------------------------------------------------------------
  const partColor = (part, project) => {
    if (part.inlay || part.kind === "key" || part.kind === "lid") return colors.key;
    if (part.kind === "tile") return colors.bp;
    const bin = project.bins.find((b) => b.id === part.binId);
    if (!bin) return colors.bin1;
    const units = binHeight(effectiveBin(project, bin)) / 7;
    return units >= 6 ? colors.bin3 : units >= 4 ? colors.bin2 : colors.bin1;
  };

  function rebuild() {
    content.clear();
    for (const m of meshes) {
      m.mesh.geometry.dispose();
      m.edges.geometry.dispose();
    }
    meshes = [];
    const { result } = ui.get();
    const project = projects.get();
    if (!result) return;
    const { w, d } = project.drawer;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color: colors.floor }),
    );
    floor.position.set(w / 2, d / 2, -0.2);
    floor.userData.floor = true;
    content.add(floor);
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        [
          [0, 0],
          [w, 0],
          [w, d],
          [0, d],
        ].map(([x, y]) => new THREE.Vector3(x, y, -0.1)),
      ),
      new THREE.LineBasicMaterial({ color: colors.edge }),
    );
    content.add(outline);

    for (const part of result.parts) {
      if (part.spare) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(part.mesh.positions, 3));
      g.setIndex(new THREE.BufferAttribute(part.mesh.indices, 1));
      const flat = g.toNonIndexed();
      flat.computeVertexNormals();
      g.dispose();
      const mesh = new THREE.Mesh(
        flat,
        new THREE.MeshStandardMaterial({
          color: partColor(part, project),
          roughness: 0.85,
          metalness: 0,
          flatShading: true,
        }),
      );
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(flat, 25),
        new THREE.LineBasicMaterial({ color: colors.edge, transparent: true, opacity: 0.35 }),
      );
      const base = new THREE.Vector3(...part.place);
      mesh.userData.part = part;
      content.add(mesh, edges);
      meshes.push({ mesh, edges, part, base });
    }
    layoutParts();
  }

  function layoutParts() {
    const { exploded, showBins, showBase, showLids, partHover, partSel } = ui.get();
    const hot = partSel ?? partHover;
    for (const { mesh, edges, part, base } of meshes) {
      const isBin = part.kind === "bin" || part.binKey;
      const isLid = part.kind === "lid";
      const visible = isLid ? showLids : isBin ? showBins : showBase;
      let dz = 0;
      let dxy = 0;
      if (exploded) {
        dz = isLid
          ? EXPLODE.lid
          : part.binKey
            ? EXPLODE.binKey
            : part.kind === "bin"
              ? EXPLODE.bin
              : part.kind === "key"
                ? EXPLODE.tileKey
                : 0;
        dxy = EXPLODE.spread;
      }
      const p = new THREE.Vector3(base.x * (1 + dxy), base.y * (1 + dxy), base.z + dz);
      // Parts printed upside down are stored flipped; turn them back (a 180° turn about x, no mirroring).
      if (part.flipped) p.add(new THREE.Vector3(0, part.size[1], part.size[2]));
      const turn = part.flipped ? -1 : 1;
      mesh.scale.set(1, turn, turn);
      edges.scale.set(1, turn, turn);
      mesh.position.copy(p);
      edges.position.copy(p);
      mesh.visible = edges.visible = visible;
      const selected = part.binId && part.binId === ui.get().selected;
      mesh.material.emissive.set(part.name === hot || selected ? colors.sel : 0x000000);
      mesh.material.emissiveIntensity = part.name === hot ? 0.5 : selected ? 0.3 : 0;
    }
    markDirty();
  }

  // ---- camera ---------------------------------------------------------------------------------------------------
  function frame() {
    const { w, d } = projects.get().drawer;
    const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, d, 60));
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const aspect = camera.aspect || 1;
    const dist = (radius / Math.sin((camera.fov * Math.PI) / 360) / Math.min(1, aspect)) * 0.9;
    const dir = new THREE.Vector3(-0.35, -0.8, 0.95).normalize();
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.near = radius / 100;
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
    markDirty();
  }

  // ---- 3D editing (assembled view): select, move, resize --------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  let drag = null;

  const pointer = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray;
  };

  const groundPoint = (e) => pointer(e).ray.intersectPlane(ground, new THREE.Vector3());

  const toCells = (pt, grid, project) => ({
    x: (pt.x - project.drawer.tol - grid.x.padStart) / grid.pitchX,
    y: (pt.y - project.drawer.tol - grid.y.padStart) / grid.pitchY,
  });

  function setGhost(rect, ok, height) {
    overlay.clear();
    if (!rect) return;
    const { grid } = getLayout();
    const project = projects.get();
    const gw = rect.w * grid.pitchX;
    const gd = rect.d * grid.pitchY;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(gw, gd, height),
      new THREE.MeshBasicMaterial({
        color: ok ? cssColor("--success") : cssColor("--danger"),
        transparent: true,
        opacity: 0.35,
      }),
    );
    mesh.position.set(
      project.drawer.tol + grid.x.padStart + (rect.x + rect.w / 2) * grid.pitchX,
      project.drawer.tol + grid.y.padStart + (rect.y + rect.d / 2) * grid.pitchY,
      height / 2,
    );
    overlay.add(mesh);
    markDirty();
  }

  function onDown(e) {
    if (ui.get().exploded || !ui.get().showBins || e.button !== 0) return;
    const hits = pointer(e).intersectObjects(
      meshes.map((m) => m.mesh).filter((m) => m.visible && m.userData.part.binId),
    );
    const layout = getLayout();
    if (!hits.length || !layout.grid) return;
    const part = hits[0].object.userData.part;
    const project = projects.get();
    const bin = project.bins.find((b) => b.id === part.binId);
    if (!bin) return;
    const pt = groundPoint(e);
    if (!pt) return;
    setUi({ selected: bin.id });
    controls.enabled = false;
    const cell = toCells(pt, layout.grid, project);
    const height = binHeight(effectiveBin(project, bin)) + 4.4;
    drag = {
      bin,
      orig: { x: bin.x, y: bin.y, w: bin.w, d: bin.d },
      start: cell,
      grid: layout.grid,
      height,
      step: project.grid.halfCells ? 0.5 : 1,
      ghost: null,
    };
    renderer.domElement.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    if (!drag) return;
    const pt = groundPoint(e);
    if (!pt) return;
    const c = toCells(pt, drag.grid, projects.get());
    drag.ghost = moveRect(drag.orig, c.x - drag.start.x, c.y - drag.start.y, drag.step, drag.grid);
    const ok = isValid(drag.grid, projects.get().bins, drag.ghost, drag.bin.id);
    setGhost(drag.ghost, ok, drag.height);
  }

  function onUp() {
    if (!drag) return;
    const { ghost, bin, grid } = drag;
    drag = null;
    controls.enabled = true;
    overlay.clear();
    markDirty();
    if (ghost && isValid(grid, projects.get().bins, ghost, bin.id)) {
      projects.update(
        (p) =>
          Object.assign(
            p.bins.find((b) => b.id === bin.id),
            ghost,
          ),
        `bin:${bin.id}:move`,
      );
    }
  }

  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerup", onUp);

  // ---- state wiring -------------------------------------------------------------------------------------------
  let lastResult = null;
  let lastFrame = -1;
  const sync = () => {
    const s = ui.get();
    if (s.result !== lastResult) {
      lastResult = s.result;
      rebuild();
    } else layoutParts();
    if (s.frameNonce !== lastFrame) {
      lastFrame = s.frameNonce;
      frame();
    }
  };

  let shown = false;
  function resize() {
    const w = wrap.clientWidth;
    const hgt = wrap.clientHeight;
    if (w < 2 || hgt < 2) {
      shown = false;
      return;
    }
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
    // Frame the drawer the first time the pane has a real size (including when it is shown again).
    if (!shown) {
      shown = true;
      frame();
    }
    markDirty();
  }
  new ResizeObserver(resize).observe(wrap);

  controls.addEventListener("change", markDirty);
  new MutationObserver(() => {
    readColors();
    rebuild();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  readColors();
  ui.subscribe(sync);
  projects.subscribe(() => {
    // Drawer size changes re-frame the camera once geometry arrives.
    markDirty();
  });
  (function tick() {
    if (controls.update() || dirty) {
      renderer.render(scene, camera);
      dirty = false;
    }
    requestAnimationFrame(tick);
  })();

  frame();
  sync();
  return root;
}
