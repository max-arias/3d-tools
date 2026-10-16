import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { h } from "../../../shell/h.js";
import { MODULES } from "../model/modules.js";
import { layoutModules } from "../geom/overlay.js";
import { langStore, t } from "../lib/i18n.js";
import { project, result, update, view } from "./state.js";

const css = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
const WALLS = ["#b9c4cc", "#f6f4ef", "#c9c3b6", "#9fb4c4", "#d9b8a5", "#5b6770"];

function roundedRectShape(w, hh, r) {
  r = Math.min(r, w / 2, hh / 2);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -hh / 2);
  s.lineTo(w / 2 - r, -hh / 2);
  s.absarc(w / 2 - r, -hh / 2 + r, r, -Math.PI / 2, 0);
  s.lineTo(w / 2, hh / 2 - r);
  s.absarc(w / 2 - r, hh / 2 - r, r, 0, Math.PI / 2);
  s.lineTo(-w / 2 + r, hh / 2);
  s.absarc(-w / 2 + r, hh / 2 - r, r, Math.PI / 2, Math.PI);
  s.lineTo(-w / 2, -hh / 2 + r);
  s.absarc(-w / 2 + r, -hh / 2 + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

export function createStage() {
  const canvasWrap = h("div", { class: "canvas" });
  const status = h("div", { class: "status" });
  const busy = h("div", { class: "busy", role: "status" });
  const tools = h("div", { class: "viewtools" });
  const wallPick = h("div", { class: "walls" });
  const root = h("main", { class: "stage" }, canvasWrap, tools, wallPick, busy, status);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  canvasWrap.append(renderer.domElement);
  const scene = new THREE.Scene();
  const persp = new THREE.PerspectiveCamera(32, 1, 1, 5000);
  persp.position.set(-90, 120, 330);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  ortho.position.set(0, 0, 1000);
  const orbit = new OrbitControls(persp, renderer.domElement);
  orbit.enableDamping = true;
  const flat = new OrbitControls(ortho, renderer.domElement);
  flat.enableRotate = false;
  flat.screenSpacePanning = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-150, 220, 260);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(200, -100, 120);
  scene.add(fill);

  const mainMat = new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true });
  const patMat = new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true });
  const wallMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), wallMat);
  scene.add(wall);
  const cover = new THREE.Group();
  const stock = new THREE.Group();
  scene.add(cover, stock);

  const paintColors = () => {
    const p = project.get();
    scene.background = new THREE.Color(css("--m-bg"));
    mainMat.color.set(p.color);
    patMat.color.set(p.color2);
    wallMat.color.set(p.wall);
  };
  new MutationObserver(paintColors).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  const dispose = (group) => {
    for (const m of group.children.slice()) {
      group.remove(m);
      m.geometry.dispose();
    }
  };

  function showCover(part) {
    dispose(cover);
    for (const body of part.bodies) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(body.mesh.positions, 3));
      geo.setIndex(new THREE.BufferAttribute(body.mesh.indices, 1));
      geo.computeVertexNormals();
      // Plate centre to the origin, rim on the wall plane (z = 0) after the turn below.
      geo.translate(-part.center[0], -part.center[1], -part.size[2]);
      const mesh = new THREE.Mesh(geo, body.role === "pattern" ? patMat : mainMat);
      // Printed face down; turn it over so the face looks at the camera with y still up.
      mesh.rotation.y = Math.PI;
      cover.add(mesh);
    }
  }

  // The hardware as it is today: plate plus module faces, in the same view coordinates.
  function showStock(p) {
    dispose(stock);
    const { w, h: hh, d, r } = p.plate;
    const plateGeo = new THREE.ExtrudeGeometry(roundedRectShape(w, hh, r), {
      depth: d,
      bevelEnabled: false,
    });
    stock.add(
      new THREE.Mesh(
        plateGeo,
        new THREE.MeshStandardMaterial({ color: "#f4f2ec", roughness: 0.6 }),
      ),
    );
    for (const m of layoutModules(p)) {
      const win = MODULES[m.type].win;
      const x = -m.x; // the cover is turned over, so plate x runs the other way in view space
      const mat = new THREE.MeshStandardMaterial({
        color: m.type === "toma" ? "#3b3b3b" : "#e2dfd6",
        roughness: 0.7,
      });
      const geo = win
        ? win.kind === "circle"
          ? new THREE.CylinderGeometry(win.d / 2, win.d / 2, 0.8, 40).rotateX(Math.PI / 2)
          : new THREE.ExtrudeGeometry(roundedRectShape(win.x - 2, win.y - 1.5, win.r), {
              depth: 0.8,
              bevelEnabled: false,
            })
        : new THREE.ExtrudeGeometry(
            roundedRectShape(MODULES[m.type].span ? 42 : 42, p.mods.pitch - 2, 1.5),
            { depth: 0.3, bevelEnabled: false },
          );
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, m.y, d);
      stock.add(mesh);
    }
  }

  // ---- view state ------------------------------------------------------------------------------
  let span = 130;
  const camera = () => (view.get().mode === "wall" ? ortho : persp);
  function frame() {
    const wallMode = view.get().mode === "wall";
    orbit.enabled = !wallMode;
    flat.enabled = wallMode;
    wall.visible = true;
    if (wallMode) {
      ortho.position.set(0, 0, 1000);
      flat.target.set(0, 0, 0);
      flat.update();
      resize();
    }
    apply();
  }
  function apply() {
    const { stock: showStockNow, mode } = view.get();
    const prod = project.get().product;
    cover.visible = !showStockNow;
    stock.visible = prod !== "keycap" && (showStockNow || prod === "frame");
    wallPick.style.display = mode === "wall" ? "" : "none";
  }

  function paintTools() {
    const v = view.get();
    const seg = (items, active, on) =>
      h(
        "span",
        { class: "segmented" },
        items.map(([id, label]) =>
          h("button", { "aria-pressed": String(active === id), onclick: () => on(id) }, label),
        ),
      );
    tools.replaceChildren(
      ...[
        seg(
          [
            ["3d", t("view3d")],
            ["wall", t("viewWall")],
          ],
          v.mode,
          (mode) => (view.set({ mode }), frame(), paintTools()),
        ),
        project.get().product !== "keycap" &&
          seg(
            [
              [false, t("withCover")],
              [true, t("original")],
            ],
            v.stock,
            (s) => (view.set({ stock: s }), apply(), paintTools()),
          ),
      ].filter(Boolean),
    );
    const p = project.get();
    wallPick.replaceChildren(
      ...WALLS.map((c) =>
        h("button", {
          class: "swatch",
          style: `background:${c}`,
          "aria-label": `${t("wallColor")} ${c}`,
          "aria-pressed": String(p.wall.toLowerCase() === c),
          onclick: () => {
            update((q) => (q.wall = c));
            paintTools();
          },
        }),
      ),
    );
  }

  let lastProduct = project.get().product;
  project.subscribe((p) => {
    paintColors();
    showStock(p);
    if (p.product !== lastProduct) {
      lastProduct = p.product;
      paintTools();
    }
    apply();
  });

  const paintStatus = () => {
    const r = result.get();
    busy.textContent =
      r.status === "loading"
        ? t("loading")
        : r.status === "error"
          ? `${t("error")}: ${r.error}`
          : "";
    busy.dataset.state = r.status;
    status.replaceChildren();
    if (r.part) {
      const [x, y, z] = r.part.size;
      status.append(
        h("span", {}, `${x.toFixed(1)} × ${y.toFixed(1)} × ${z.toFixed(1)} mm`),
        h("span", { class: "muted" }, `${r.part.triangles.toLocaleString()} ${t("triangles")}`),
        ...r.part.warnings.map((w) => h("span", { class: "bad" }, t(`w_${w}`))),
      );
    }
  };

  let lastSpan = 0;
  result.subscribe((r) => {
    if (r.status === "ok") {
      showCover(r.part);
      showStock(project.get());
      wall.position.z = -0.05;
      span = Math.max(...r.part.size);
      if (!lastSpan) persp.position.set(-span * 0.35, span * 0.5, span * 2.2);
      else persp.position.multiplyScalar(span / lastSpan); // keep the framing as the part grows
      lastSpan = span;
      orbit.update();
      resize();
    }
    paintStatus();
  });
  langStore.subscribe(() => {
    paintStatus();
    paintTools();
  });

  function resize() {
    const { clientWidth: w, clientHeight: hh } = canvasWrap;
    if (!w || !hh) return;
    renderer.setSize(w, hh, false);
    persp.aspect = w / hh;
    persp.updateProjectionMatrix();
    const half = span * 0.62;
    const a = w / hh;
    ortho.left = -half * Math.max(a, 1);
    ortho.right = half * Math.max(a, 1);
    ortho.top = half * Math.max(1 / a, 1);
    ortho.bottom = -half * Math.max(1 / a, 1);
    ortho.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvasWrap);
  renderer.setAnimationLoop(() => {
    (view.get().mode === "wall" ? flat : orbit).update();
    renderer.render(scene, camera());
  });

  paintColors();
  paintTools();
  paintStatus();
  apply();
  return root;
}
