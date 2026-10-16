import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { h } from "../../../shell/h.js";
import { MODULES } from "../model/modules.js";
import { layoutModules } from "../geom/overlay.js";
import { langStore, t } from "../lib/i18n.js";
import { project, result, update, view } from "./state.js";

const css = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
// Real wall paints, light to dark.
const WALLS = ["#ece7dc", "#d4d3cd", "#b9c6b2", "#b3c4d1", "#d8b4a3", "#46586b"];
// Camera spots for the hallway scene, relative to the switch (mm).
const SHOTS = {
  near: { pos: [420, 80, 520], target: [-40, 0, 0], fov: 40, key: "shotNear" },
  mid: { pos: [1000, 120, 800], target: [-120, -30, 0], fov: 46, key: "shotMid" },
  hall: { pos: [1500, 140, 1050], target: [-500, -60, 150], fov: 50, key: "shotHall" },
};
const SWITCH_HEIGHT = 1100; // standard switch height above the floor
const CEILING = 2500;
const HALL_W = 1700;

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

const std = (color, roughness = 0.7, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function plankTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  const planks = 8;
  for (let i = 0; i < planks; i++) {
    const tone = 150 + ((i * 53) % 40);
    g.fillStyle = `rgb(${tone + 30},${tone - 10},${tone - 55})`;
    g.fillRect(0, (i * c.height) / planks, c.width, c.height / planks);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, (i * c.height) / planks, c.width, 2);
    const joint = (i * 97) % c.width;
    g.fillRect(joint, (i * c.height) / planks, 2, c.height / planks);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The switch hardware behind the cover: one small model per module type, local origin at its centre. */
function moduleModel(type) {
  const win = MODULES[type].win;
  if (!win) return null;
  const face = std("#f4f1ea", 0.55);
  const dark = std("#2a2a2a", 0.8);
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  const slab = (w, hh, r, depth) =>
    new THREE.ExtrudeGeometry(roundedRectShape(w, hh, r), {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.5,
      bevelSize: 0.5,
      bevelSegments: 2,
    });
  if (type === "tecla") {
    add(slab(win.x - 3.5, win.y - 2.4, 2, 2.2), face);
    g.rotation.x = 0.07; // a rocker key rests slightly tilted
  } else if (type === "toma") {
    add(
      new THREE.CylinderGeometry(win.d / 2 - 0.8, win.d / 2 - 0.8, 1.6, 48).rotateX(Math.PI / 2),
      face,
      0,
      0,
      0.8,
    );
    const slot = new THREE.BoxGeometry(2, 9.5, 0.6);
    add(slot, dark, -8, 4, 1.6, 0.5);
    add(slot, dark, 8, 4, 1.6, -0.5);
    add(slot, dark, 0, -8, 1.6);
  } else if (type === "usb") {
    add(slab(win.x - 4, win.y - 2.5, 1.5, 1.6), face);
    add(new THREE.BoxGeometry(12, 5.5, 0.6), dark, -7, 0, 2.2);
    add(new THREE.BoxGeometry(12, 5.5, 0.6), dark, 7, 0, 2.2);
  } else if (type === "rj45") {
    add(slab(win.x - 4, win.y - 2.5, 1.5, 1.6), face);
    add(new THREE.BoxGeometry(13, 8, 0.6), dark, 0, 0, 2.2);
  } else if (type === "perilla") {
    add(
      new THREE.CylinderGeometry(win.d / 2 - 1.5, win.d / 2 - 1.5, 7, 40).rotateX(Math.PI / 2),
      face,
      0,
      0,
      3.5,
    );
    add(new THREE.BoxGeometry(1.2, 7, 0.5), dark, 0, 3, 7.2);
  }
  return g;
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasWrap.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 2, 12000);
  camera.position.set(-90, 120, 330);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  const hallCtl = new OrbitControls(camera, renderer.domElement);
  hallCtl.enableDamping = true;
  hallCtl.minDistance = 180;
  hallCtl.maxDistance = 1500;
  hallCtl.minAzimuthAngle = -1.5;
  hallCtl.maxAzimuthAngle = 1.5;
  hallCtl.minPolarAngle = 0.9;
  hallCtl.maxPolarAngle = 1.8;
  hallCtl.enabled = false;

  // Studio lighting for the plain 3D view.
  const studio = new THREE.Group();
  studio.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-150, 220, 260);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(200, -100, 120);
  studio.add(key, fill);
  scene.add(studio);

  const mainMat = new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true });
  const patMat = new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true });
  const backdropMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), backdropMat);
  backdrop.position.z = -0.05;
  scene.add(backdrop);

  // The plate being designed: origin at the plate centre, wall plane at z = 0, face toward +z.
  const holder = new THREE.Group();
  const cover = new THREE.Group();
  const stockPlate = new THREE.Group();
  const stockMods = new THREE.Group();
  holder.add(cover, stockPlate, stockMods);
  scene.add(holder);

  // ---- hallway: the same wall plane, with a room around it ---------------------------------------
  const hall = new THREE.Group();
  const wallMat = std("#ece7dc", 0.95);
  const trimMat = std("#f6f3ec", 0.6);
  const floorTex = plankTexture();
  floorTex.repeat.set(5, HALL_W / 900);
  const floorMat = std("#ffffff", 0.55, { map: floorTex });
  const floorY = -SWITCH_HEIGHT;
  const box = (w, hh, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    hall.add(m);
    return m;
  };
  const plane = (w, hh, mat, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.receiveShadow = true;
    hall.add(m);
    return m;
  };
  const X0 = -3600;
  const X1 = 2600;
  const len = X1 - X0;
  const cx = (X0 + X1) / 2;
  const midY = floorY + CEILING / 2;
  plane(len, CEILING, wallMat, [cx, midY, 0], [0, 0, 0]); // the switch wall
  plane(len, CEILING, wallMat, [cx, midY, HALL_W], [0, Math.PI, 0]); // opposite wall
  plane(HALL_W, CEILING, wallMat, [X0, midY, HALL_W / 2], [0, Math.PI / 2, 0]); // far end
  plane(HALL_W, CEILING, wallMat, [X1, midY, HALL_W / 2], [0, -Math.PI / 2, 0]); // near end
  plane(len, HALL_W, floorMat, [cx, floorY, HALL_W / 2], [-Math.PI / 2, 0, 0]);
  plane(len, HALL_W, std("#fbfaf6", 1), [cx, floorY + CEILING, HALL_W / 2], [Math.PI / 2, 0, 0]);
  // Skirting boards.
  box(len, 90, 14, trimMat, cx, floorY + 45, 7);
  box(len, 90, 14, trimMat, cx, floorY + 45, HALL_W - 7);
  // A door on the switch wall, latch side toward the switch.
  const doorX = -640;
  box(820, 2060, 14, std("#c19a68", 0.55), doorX, floorY + 1030, 7);
  box(70, 2130, 24, trimMat, doorX - 445, floorY + 1065, 12);
  box(70, 2130, 24, trimMat, doorX + 445, floorY + 1065, 12);
  box(960, 70, 24, trimMat, doorX, floorY + 2095, 12);
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 9, 120, 16).rotateZ(Math.PI / 2),
    std("#b9b6ae", 0.3, { metalness: 0.8 }),
  );
  handle.position.set(doorX + 330, floorY + 1000, 55);
  hall.add(handle);
  // A picture and a rug for scale and depth.
  box(520, 700, 20, std("#2f2a26", 0.6), -700, floorY + 1450, HALL_W - 12);
  box(440, 620, 4, std("#c9a86a", 0.9), -700, floorY + 1450, HALL_W - 24);
  plane(3600, 620, std("#8d5b4a", 1), [-900, floorY + 2, HALL_W / 2], [-Math.PI / 2, 0, 0]);
  // Daylight at the end of the hall gives the depth.
  plane(
    900,
    1500,
    new THREE.MeshBasicMaterial({ color: 0xfff7e6 }),
    [X0 + 2, floorY + 1350, HALL_W / 2],
    [0, Math.PI / 2, 0],
  );
  const lamp = new THREE.PointLight(0xfff0dc, 2600, 0, 1);
  lamp.position.set(250, floorY + CEILING - 120, 650);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.bias = -0.0004;
  lamp.shadow.camera.near = 20;
  lamp.shadow.camera.far = 7000;
  hall.add(lamp);
  hall.add(new THREE.HemisphereLight(0xffffff, 0x8a7a68, 0.45));
  const lampBulb = new THREE.Mesh(
    new THREE.CylinderGeometry(120, 120, 18, 32),
    new THREE.MeshBasicMaterial({ color: 0xfffaf0 }),
  );
  lampBulb.position.set(250, floorY + CEILING - 9, 650);
  hall.add(lampBulb);
  hall.visible = false;
  scene.add(hall);

  // ---- colours, geometry -------------------------------------------------------------------------
  const paintColors = () => {
    const p = project.get();
    scene.background = new THREE.Color(css("--m-bg"));
    backdropMat.color.set(css("--m-bg-2"));
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
      m.traverse((o) => o.geometry?.dispose());
    }
  };

  const colourMats = new Map();
  const matFor = (c) => {
    if (!colourMats.has(c))
      colourMats.set(
        c,
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, flatShading: true }),
      );
    return colourMats.get(c);
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
      const mesh = new THREE.Mesh(
        geo,
        body.role === "pattern" ? (body.color ? matFor(body.color) : patMat) : mainMat,
      );
      // Printed face down; turn it over so the face looks at the camera with y still up.
      mesh.rotation.y = Math.PI;
      mesh.castShadow = mesh.receiveShadow = true;
      cover.add(mesh);
    }
  }

  // The hardware as it is today: the plate and the module faces, in view coordinates.
  function showStock(p) {
    dispose(stockPlate);
    dispose(stockMods);
    const { w, h: hh, d, r } = p.plate;
    const plate = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedRectShape(w, hh, r), { depth: d, bevelEnabled: false }),
      std("#f4f2ec", 0.6),
    );
    plate.castShadow = plate.receiveShadow = true;
    stockPlate.add(plate);
    // A replacement tapa leaves the modules where the new face sits; everything else sits on the plate.
    const base = p.product === "tapa" ? p.tapa.skirt : d;
    for (const m of layoutModules(p)) {
      const model = moduleModel(m.type);
      if (!model) continue;
      model.position.set(-m.x, m.y, base - 0.6); // the cover is turned over, so plate x runs the other way
      stockMods.add(model);
    }
  }

  // ---- what is visible --------------------------------------------------------------------------
  function apply() {
    const { stock: original, mode } = view.get();
    const prod = project.get().product;
    cover.visible = !original;
    // Through the windows you see the real switch. A key cap fits over the key, so none is shown.
    stockMods.visible = prod !== "keycap";
    stockPlate.visible = prod !== "keycap" && prod !== "tapa";
    const wallMode = mode === "wall";
    hall.visible = wallMode;
    studio.visible = !wallMode;
    backdrop.visible = !wallMode;
    wallPick.style.display = wallMode ? "" : "none";
  }

  let shot = "mid";
  function setShot(name) {
    shot = name;
    const { pos, target, fov } = SHOTS[name];
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.set(...pos);
    hallCtl.target.set(...target);
    hallCtl.update();
  }

  function frame() {
    const wallMode = view.get().mode === "wall";
    orbit.enabled = !wallMode;
    hallCtl.enabled = wallMode;
    if (wallMode) setShot(shot);
    else {
      camera.fov = 32;
      camera.updateProjectionMatrix();
      orbit.target.set(0, 0, span / 4);
      camera.position.set(-span * 0.35, span * 0.5, span * 2.2);
      orbit.update();
    }
    apply();
    paintTools();
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
          (mode) => (view.set({ mode }), frame()),
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
      seg(
        Object.entries(SHOTS).map(([id, s]) => [id, t(s.key)]),
        shot,
        (id) => (setShot(id), paintTools()),
      ),
      h(
        "span",
        { class: "swatches" },
        WALLS.map((c) =>
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

  let span = 130;
  let lastSpan = 0;
  result.subscribe((r) => {
    if (r.status === "ok") {
      showCover(r.part);
      showStock(project.get());
      span = Math.max(...r.part.size);
      if (!lastSpan) camera.position.set(-span * 0.35, span * 0.5, span * 2.2);
      else if (view.get().mode === "3d") camera.position.multiplyScalar(span / lastSpan); // keep the framing as the part grows
      lastSpan = span;
      orbit.update();
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
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvasWrap);
  renderer.setAnimationLoop(() => {
    if (view.get().mode === "wall") {
      // Stay inside the hallway.
      camera.position.z = Math.min(camera.position.z, HALL_W - 120);
      camera.position.y = Math.min(Math.max(camera.position.y, -800), 1250);
      hallCtl.update();
    } else orbit.update();
    renderer.render(scene, camera);
  });

  paintColors();
  paintTools();
  paintStatus();
  showStock(project.get());
  apply();
  return root;
}
