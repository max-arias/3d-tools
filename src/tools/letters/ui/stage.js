import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { h } from "../../../shell/h.js";
import { segmented } from "../../../shell/widgets.js";
import { colorAt } from "../led/effects.js";
import { langStore, t } from "../lib/i18n.js";
import { EFFECTS } from "../model/effects.js";
import { arrange, printItems } from "../lib/plates.js";
import { project, result, view } from "./state.js";

const css = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export const MODES = ["assembled", "plates"];

/** Hooks other modules use: PNG snapshot and camera reset. Filled in by createStage. */
export const stageApi = { snapshot: async () => null, resetView: () => {} };

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
  const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1.1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-150, 300, 360);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(200, -100, 160);
  scene.add(key, fill);

  // Everything is modelled Z-up (z = depth); this group stands it up in the Y-up scene.
  const world = new THREE.Group();
  world.rotation.x = -Math.PI / 2;
  scene.add(world);
  const content = new THREE.Group();
  world.add(content);

  const mats = {
    box: new THREE.MeshStandardMaterial({
      flatShading: true,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
    lid: new THREE.MeshStandardMaterial({
      flatShading: true,
      color: "#f4f1ea",
      roughness: 0.3,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    }),
    wire: new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.4 }),
    bed: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 }),
  };

  let framed = null;
  let leds = null; // { chips: InstancedMesh, glow: Points, n } while the LED preview is on
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const glowTexture = (() => {
    const c = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const disposeContent = () => {
    leds = null;
    for (const o of content.children.splice(0)) {
      o.geometry?.dispose();
      o.removeFromParent();
    }
  };

  const colors = () => {
    mats.box.color.set("#aeb4c0");
    mats.wire.color.set(css("--muted", "#8a8378"));
    mats.bed.color.set(css("--muted", "#8a8378"));
  };

  /** Fit `ext` ({ cx, cz, w, h }: centre and size on the ground, in scene units) in view. */
  function frame(ext, plates) {
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const dist = (Math.max(ext.w / camera.aspect, ext.h) / (2 * half)) * 1.15 + 40;
    if (plates) camera.position.set(ext.cx, dist * 0.9, ext.cz + dist * 0.45);
    else camera.position.set(0, dist * 0.35 + ext.depth / 2, dist);
    orbit.target.set(ext.cx, plates ? 0 : ext.depth / 2, ext.cz);
    orbit.minDistance = 30;
    orbit.maxDistance = dist * 6 + 2000;
  }

  /** Chips and a soft glow at every LED, in data-line order. */
  function addLeds(part) {
    const pts = part.parts.flatMap((x) =>
      (x.led?.runs ?? []).flatMap((r) => r.pts.map(([px, py]) => [px, py, x.led.z])),
    );
    if (!pts.length) return;
    const chips = new THREE.InstancedMesh(
      new THREE.BoxGeometry(5, 5, 1.6),
      new THREE.MeshBasicMaterial(),
      pts.length,
    );
    const glow = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        size: 30,
        map: glowTexture,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const flat = new Float32Array(pts.flat());
    glow.geometry.setAttribute("position", new THREE.BufferAttribute(flat, 3));
    glow.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(pts.length * 3), 3),
    );
    const m = new THREE.Matrix4();
    pts.forEach((pt, i) => chips.setMatrixAt(i, m.setPosition(pt[0], pt[1], pt[2])));
    chips.setColorAt(0, new THREE.Color());
    content.add(chips, glow);
    leds = { chips, glow, n: pts.length };
  }

  const tint = new THREE.Color();
  function paintLeds(time) {
    if (!leds) return;
    const e = EFFECTS.find((x) => x.key === view.get().fx) ?? EFFECTS[0];
    const sx = view.get().speed ?? e.sx;
    const col = leds.glow.geometry.attributes.color;
    for (let i = 0; i < leds.n; i++) {
      const [r, g, b] = colorAt(e.fx, time, i, leds.n, sx, e.ix);
      tint.setRGB(r / 255, g / 255, b / 255);
      leds.chips.setColorAt(i, tint);
      col.setXYZ(i, tint.r, tint.g, tint.b);
    }
    leds.chips.instanceColor.needsUpdate = true;
    col.needsUpdate = true;
  }

  /** Rebuild the scene from the latest result and view. */
  function build() {
    const { part } = result.get();
    if (!part) return;
    const p = project.get();
    const v = view.get();
    colors();
    disposeContent();
    let ext = { cx: 0, cz: 0, w: part.size[0], h: part.size[1], depth: part.size[2] };
    const add = (mesh, material, x = 0, y = 0, z = 0) => {
      const geo = geometryOf(mesh);
      const m = new THREE.Mesh(geo, v.wire ? mats.wire : material);
      m.position.set(x, y, z);
      content.add(m);
    };
    if (v.mode === "assembled") {
      for (const x of part.parts) {
        add(x.box.mesh, mats.box);
        if (x.lid && v.lid) add(x.lid.mesh, mats.lid, 0, 0, part.lidZ);
      }
      if (v.leds) addLeds(part);
    } else {
      const items = printItems(part.parts, p.build);
      const plan = arrange(items, p.build);
      items.forEach((it, i) =>
        add(it.mesh, it.kind === "lid" ? mats.lid : mats.box, plan.at[i].x, plan.at[i].y),
      );
      for (let n = 0; n < plan.plates; n++) {
        const ox = (n % plan.cols) * p.build.x * 1.2;
        const oy = -Math.floor(n / plan.cols) * p.build.y * 1.2;
        const pts = [
          [0, 0],
          [p.build.x, 0],
          [p.build.x, p.build.y],
          [0, p.build.y],
          [0, 0],
        ].map(([x, y]) => new THREE.Vector3(ox + x, oy + y, 0));
        content.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mats.bed));
      }
      const rows = Math.ceil(plan.plates / plan.cols);
      const w = (plan.cols - 1) * p.build.x * 1.2 + p.build.x;
      const hh = (rows - 1) * p.build.y * 1.2 + p.build.y;
      ext = { cx: w / 2, cz: -(p.build.y - (rows - 1) * p.build.y * 1.2) / 2, w, h: hh, depth: 0 };
    }
    const group = `${v.mode}:${v.mode === "plates" ? ext.w : 0}`;
    if (framed !== group) {
      frame(ext, v.mode === "plates");
      framed = group;
    }
  }

  const modeBar = h("span", { class: "modes" });
  const lidBox = h("label", { class: "check" });
  const paintTools = () => {
    modeBar.replaceChildren(
      segmented({
        value: view.get().mode,
        options: MODES.map((m) => ({ value: m, label: t(`mode_${m}`) })),
        onChange: (mode) => view.set({ mode }),
      }),
    );
    const lid = h("input", {
      type: "checkbox",
      checked: view.get().lid,
      dataset: { key: "view.lid" },
      onchange: () => view.set({ lid: lid.checked }),
    });
    const wire = h("input", {
      type: "checkbox",
      checked: view.get().wire,
      dataset: { key: "view.wire" },
      onchange: () => view.set({ wire: wire.checked }),
    });
    const ledsOn = h("input", {
      type: "checkbox",
      checked: view.get().leds,
      dataset: { key: "view.leds" },
      onchange: () => view.set({ leds: ledsOn.checked }),
    });
    ledBox.replaceChildren(ledsOn, h("span", {}, t("showLeds")));
    fxSelect.replaceChildren(
      ...EFFECTS.map((e) =>
        h("option", { value: e.key, selected: e.key === view.get().fx }, t(`fx_${e.key}`)),
      ),
    );
    fxSelect.hidden = !view.get().leds;
    lidBox.replaceChildren(lid, h("span", {}, t("showLid")));
    wireBox.replaceChildren(wire, h("span", {}, t("wire")));
    reset.textContent = t("resetView");
  };
  const wireBox = h("label", { class: "check" });
  const ledBox = h("label", { class: "check" });
  const fxSelect = h("select", {
    dataset: { key: "view.fx" },
    onchange: () => view.set({ fx: fxSelect.value, speed: null }),
  });
  const reset = h("button", { title: "R", onclick: () => stageApi.resetView() });
  tools.append(modeBar, lidBox, ledBox, fxSelect, wireBox, reset);
  langStore.subscribe(paintTools);
  paintTools();

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
    busy.textContent = st === "loading" ? t("building") : st === "error" ? error : "";
    if (st === "ok" && part) {
      const tris = part.parts.reduce((n, x) => n + x.box.triangles + (x.lid?.triangles ?? 0), 0);
      status.textContent = part.parts.length
        ? `${part.size.map((v) => v.toFixed(1)).join(" × ")} mm · ${tris.toLocaleString()} ${t("triangles")}`
        : "";
      build();
    }
  });
  let lastView = view.get();
  view.subscribe((v) => {
    if (v.mode !== lastView.mode) framed = null;
    const same = ["mode", "lid", "wire", "leds"].every((k) => v[k] === lastView[k]);
    lastView = v;
    fxSelect.hidden = !v.leds;
    if (!same) build();
  });
  project.subscribe(() => view.get().mode === "plates" && result.get().part && build());

  stageApi.resetView = () => {
    framed = null;
    build();
  };
  stageApi.snapshot = () =>
    new Promise((resolve) => {
      renderer.render(scene, camera);
      renderer.domElement.toBlob(resolve, "image/png");
    });

  (function loop() {
    const night = view.get().leds && view.get().mode === "assembled";
    scene.background = new THREE.Color(night ? "#14110e" : css("--m-bg", "#efe8da"));
    hemi.intensity = night ? 0.3 : 1.1;
    key.intensity = night ? 0.5 : 2.2;
    fill.intensity = night ? 0.15 : 0.6;
    mats.lid.opacity = night ? 0.3 : 0.72;
    paintLeds(still ? 3 : performance.now() / 1000);
    orbit.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
  return root;
}
