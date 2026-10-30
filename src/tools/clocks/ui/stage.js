import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { h } from "../../../shell/h.js";
import { segmented } from "../../../shell/widgets.js";
import { langStore, t } from "../lib/i18n.js";
import { arrange, printItems } from "../lib/plates.js";
import { drawStack } from "./stack.js";
import { project, result, update, view } from "./state.js";

const css = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export const MODES = ["front", "back", "side", "stack", "plates"];

/** Hooks other modules use. Filled in by createStage. */
export const stageApi = { snapshot: async () => null, resetView: () => {}, nudgeHub: () => {} };

const geometryOf = (mesh) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geo.computeVertexNormals();
  return geo;
};

/** Hand angles (radians, clockwise from 12) for a date, or frozen at 10:10:35. */
export function handAngles(date, hours = 12, reverse = false) {
  const s = date.getSeconds() + date.getMilliseconds() / 1000;
  const m = date.getMinutes() + s / 60;
  const hh = (date.getHours() % hours) + m / 60;
  const dir = reverse ? 1 : -1; // rotation about +z: negative turns clockwise
  return {
    hour: (dir * hh * Math.PI * 2) / hours,
    minute: (dir * m * Math.PI * 2) / 60,
    second: (dir * s * Math.PI * 2) / 60,
  };
}
const FROZEN = new Date(2026, 0, 1, 10, 10, 35);

export function createStage() {
  const canvasWrap = h("div", { class: "canvas" });
  const stackWrap = h("div", { class: "stack", hidden: true });
  const busy = h("div", { class: "busy", role: "status" });
  const tools = h("div", { class: "viewtools" });
  const hint = h("div", { class: "hubhint muted" });
  const status = h("div", { class: "status" });
  const root = h("main", { class: "stage" }, canvasWrap, stackWrap, tools, hint, busy, status);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  canvasWrap.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 20000);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.2);
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(-200, 260, 420);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.set(260, -120, -300);
  scene.add(hemi, key, fill);

  // Modelled with y up the dial and z out of the face, which is already the scene's frame.
  const content = new THREE.Group();
  scene.add(content);
  const dialGroup = new THREE.Group(); // moves while the hub is dragged
  content.add(dialGroup);
  const hands = { hour: [], minute: [], second: [] }; // meshes to turn every frame

  const slotMats = [];
  const matFor = (slot) => {
    if (!slotMats[slot])
      slotMats[slot] = new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.62,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
    return slotMats[slot];
  };
  const mats = {
    wire: new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.4 }),
    movement: new THREE.MeshStandardMaterial({
      color: "#3a3a3d",
      transparent: true,
      opacity: 0.55,
    }),
    stock: new THREE.MeshStandardMaterial({ color: "#1d1d1f", roughness: 0.4 }),
    bed: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 }),
    hub: new THREE.MeshBasicMaterial({
      color: "#2fbf71",
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    }),
    wall: new THREE.MeshStandardMaterial({ color: "#d9d4ca", roughness: 0.95 }),
  };
  const glowTexture = (() => {
    const c = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,236,200,1)");
    grad.addColorStop(0.4, "rgba(255,220,170,0.3)");
    grad.addColorStop(1, "rgba(255,220,170,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  const paintColors = () => {
    const slots = project.get().colors.slots;
    slots.forEach((c, i) => matFor(i).color.set(c));
    mats.wire.color.set(css("--muted", "#8a8378"));
    mats.bed.color.set(css("--muted", "#8a8378"));
  };

  const dispose = (group) => {
    for (const o of group.children.splice(0)) {
      if (o.children?.length) dispose(o);
      o.geometry?.dispose();
      o.removeFromParent();
    }
  };

  let framed = null;
  function frame(mode, ext) {
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const dist = (Math.max(ext.w / camera.aspect, ext.h) / (2 * half)) * 1.2 + 60;
    const [cx, cy] = [ext.cx, ext.cy];
    const at = {
      front: [cx + dist * 0.08, cy + dist * 0.06, dist],
      back: [cx - dist * 0.25, cy + dist * 0.1, -dist],
      side: [cx + dist * 0.95, cy + dist * 0.12, dist * 0.3],
      plates: [cx, cy - dist * 0.5, dist * 0.9],
    }[mode] ?? [cx, cy, dist];
    camera.position.set(...at);
    orbit.target.set(cx, cy, ext.cz ?? 0);
    orbit.maxDistance = dist * 6 + 2000;
    orbit.minDistance = 20;
  }

  /** A part's bodies as meshes in one group, each in its slot colour. */
  const partGroup = (part, wire) => {
    const g = new THREE.Group();
    for (const b of part.bodies)
      g.add(new THREE.Mesh(geometryOf(b.mesh), wire ? mats.wire : matFor(b.slot)));
    return g;
  };

  /** Stand-in hands when the movement's own are used. */
  function stockHand(id, info, mv) {
    const len = { hour: info.R * 0.5, minute: info.R * 0.8, second: info.R * 0.85 }[id];
    const w = { hour: 4, minute: 3, second: 1 }[id];
    const z = info.recess + mv[`${id}At`];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.8), mats.stock);
    m.position.set(0, len / 2 - 6, 0.4);
    const g = new THREE.Group();
    g.add(m);
    g.position.z = z;
    return g;
  }

  /** Rebuild the scene from the latest result and view. */
  function build() {
    const { clock } = result.get();
    if (!clock) return;
    const p = project.get();
    const v = view.get();
    paintColors();
    dispose(content);
    dialGroup.position.set(0, 0, 0);
    for (const k of Object.keys(hands)) hands[k] = [];
    const info = clock.info;
    const [x0, y0, x1, y1] = info.bounds;
    let ext = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };

    if (v.mode === "plates") {
      const items = printItems(clock.parts, p.build);
      const plan = arrange(items, p.build);
      items.forEach((it, i) => {
        const g = partGroup(it, v.wire);
        g.position.set(plan.at[i].x, plan.at[i].y, 0);
        content.add(g);
      });
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
      ext = { cx: w / 2, cy: p.build.y - hh / 2, w, h: hh };
    } else {
      const twoSided = p.type === "twoSided";
      const clockGroup = new THREE.Group();
      content.add(clockGroup);
      const sides = twoSided ? [0, 1] : [0];
      for (const side of sides) {
        const g = new THREE.Group();
        if (side === 1) {
          // The second half, turned round behind the first; they meet at the back of the rims.
          g.rotation.y = Math.PI;
          g.position.z = -2 * info.depth;
        }
        const dial = side === 0 ? dialGroup : new THREE.Group();
        for (const part of clock.parts.filter((x) => x.kind === "dial" || x.kind === "back"))
          dial.add(partGroup(part, v.wire));
        if (side === 1) g.add(dial);
        else g.add(dialGroup);
        const mv = p.movement;
        if (v.mode !== "front" || side === 1) {
          const [bw, bh, bd] = mv.body;
          const box = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mats.movement);
          box.position.z = info.recess - bd / 2;
          g.add(box);
        }
        const handIds = p.hands.print
          ? clock.parts.filter((x) => x.kind === "hand").map((x) => x.id)
          : ["hour", "minute"];
        for (const id of handIds) {
          const part = clock.parts.find((x) => x.kind === "hand" && x.id === id);
          let hg;
          if (part) {
            hg = partGroup(part, v.wire);
            hg.position.z = part.z;
          } else hg = stockHand(id, info, mv);
          const turn = new THREE.Group();
          turn.add(hg);
          g.add(turn);
          hands[id].push(turn);
        }
        clockGroup.add(g);
      }
      if (info.leds) {
        const pts = info.leds.path.flatMap((r) =>
          r.filter((_, i) => i % 2 === 0).map(([x, y]) => [x, y, info.leds.z]),
        );
        const glow = new THREE.Points(
          new THREE.BufferGeometry().setAttribute(
            "position",
            new THREE.BufferAttribute(new Float32Array(pts.flat()), 3),
          ),
          new THREE.PointsMaterial({
            size: 40,
            map: glowTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        clockGroup.add(glow);
      }
      const cradle = clock.parts.find((x) => x.kind === "cradle");
      if (cradle) {
        // The clock leans back in the cradle's slot.
        clockGroup.rotation.x = (-cradle.at.angle * Math.PI) / 180;
        clockGroup.position.y = 0;
        const cg = partGroup(cradle, v.wire);
        cg.rotation.x = -Math.PI / 2;
        cg.position.set(0, cradle.at.y - 5, 4 + info.thickness / 2);
        content.add(cg);
      }
      const bracket = clock.parts.find((x) => x.kind === "bracket");
      if (bracket) {
        const g = partGroup(bracket, v.wire);
        const w = bracket.at.depth + 6;
        g.position.set(-(p.twoSided.arm - 12), bracket.at.topY - 80, -info.depth - w / 2);
        content.add(g);
        const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 260, 260), mats.wall);
        wall.position.set(-(p.twoSided.arm - 12) - 1, bracket.at.topY - 40, -info.depth);
        content.add(wall);
        ext = { ...ext, w: ext.w + p.twoSided.arm, cx: ext.cx - p.twoSided.arm / 2, h: ext.h + 60 };
      }
      if (v.mode === "front") {
        const ring = new THREE.Mesh(new THREE.RingGeometry(3.5, 5.5, 32), mats.hub);
        ring.position.z = info.thickness + info.raised + 0.3;
        ring.renderOrder = 10;
        content.add(ring);
      }
    }
    const group = `${v.mode}`;
    if (framed !== group) {
      frame(v.mode, ext);
      framed = group;
    }
  }

  // ---- hub placement: drag the green ring, double-click to re-place -----------------------------
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      ),
      camera,
    );
    plane.constant = -(result.get().clock?.info.thickness ?? 0);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  };
  const moveHub = (dx, dy) =>
    update((d) => {
      d.shape.hub = [d.shape.hub[0] + dx, d.shape.hub[1] + dy];
    });
  let drag = null;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (view.get().mode !== "front" || !result.get().clock) return;
    const at = hit(e);
    if (!at || Math.hypot(at.x, at.y) > 9) return;
    drag = { x: at.x, y: at.y };
    orbit.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const at = hit(e);
    if (!at) return;
    // The hub stays put; the dial slides the other way until the rebuild lands.
    dialGroup.position.set(-(at.x - drag.x), -(at.y - drag.y), 0);
  });
  renderer.domElement.addEventListener("pointerup", () => {
    if (!drag) return;
    const [dx, dy] = [-dialGroup.position.x, -dialGroup.position.y];
    drag = null;
    orbit.enabled = true;
    if (Math.hypot(dx, dy) > 0.2) moveHub(Math.round(dx * 2) / 2, Math.round(dy * 2) / 2);
  });
  renderer.domElement.addEventListener("dblclick", (e) => {
    if (view.get().mode !== "front") return;
    const at = hit(e);
    if (at) moveHub(Math.round(at.x * 2) / 2, Math.round(at.y * 2) / 2);
  });
  stageApi.nudgeHub = moveHub;

  // ---- tools -----------------------------------------------------------------------------------
  const modeBar = h("span", { class: "modes" });
  const wireBox = h("label", { class: "check" });
  const timeBox = h("label", { class: "check" });
  const reset = h("button", { title: "R", onclick: () => stageApi.resetView() });
  const paintTools = () => {
    const v = view.get();
    modeBar.replaceChildren(
      segmented({
        value: v.mode,
        options: MODES.map((m) => ({ value: m, label: t(`mode_${m}`) })),
        onChange: (mode) => view.set({ mode }),
      }),
    );
    const wire = h("input", {
      type: "checkbox",
      checked: v.wire,
      dataset: { key: "view.wire" },
      onchange: () => view.set({ wire: wire.checked }),
    });
    wireBox.replaceChildren(wire, h("span", {}, t("wire")));
    const frozen = h("input", {
      type: "checkbox",
      checked: v.time === "1010",
      dataset: { key: "view.time" },
      onchange: () => view.set({ time: frozen.checked ? "1010" : "live" }),
    });
    timeBox.replaceChildren(frozen, h("span", {}, t("freeze")));
    reset.textContent = t("resetView");
    hint.textContent = v.mode === "front" ? t("hubDrag") : "";
  };
  tools.append(modeBar, timeBox, wireBox, reset);
  langStore.subscribe(paintTools);
  view.subscribe(paintTools);
  paintTools();

  const paintStack = () => {
    const { clock } = result.get();
    if (view.get().mode !== "stack" || !clock) return;
    stackWrap.replaceChildren(drawStack(project.get(), clock.info));
  };

  const resize = () => {
    const { clientWidth: w, clientHeight: hh } = canvasWrap;
    if (!w || !hh) return;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvasWrap);

  result.subscribe(({ status: st, clock, error }) => {
    busy.dataset.state = st === "ok" ? "" : st;
    busy.textContent = st === "loading" ? t("building") : st === "error" ? error : "";
    if (st === "ok" && clock) {
      const tris = clock.parts.reduce(
        (n, x) => n + x.bodies.reduce((m, b) => m + b.triangles, 0),
        0,
      );
      const [w, hh] = clock.info.size;
      status.textContent = `${w.toFixed(1)} × ${hh.toFixed(1)} mm · ${tris.toLocaleString()} ${t("triangles")}`;
      build();
      paintStack();
    }
  });
  let lastView = view.get();
  view.subscribe((v) => {
    if (v.mode !== lastView.mode) framed = null;
    const same = ["mode", "wire"].every((k) => v[k] === lastView[k]);
    lastView = v;
    stackWrap.hidden = v.mode !== "stack";
    canvasWrap.hidden = v.mode === "stack";
    if (!same) {
      build();
      paintStack();
      resize();
    }
  });
  project.subscribe(() => {
    paintColors();
    paintStack();
    if (view.get().mode === "plates" && result.get().clock) build();
  });

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
    scene.background = new THREE.Color(css("--m-bg", "#efe8da"));
    const p = project.get();
    const a = handAngles(
      view.get().time === "live" ? new Date() : FROZEN,
      p.markers.hours,
      p.markers.reverse,
    );
    for (const id of ["hour", "minute", "second"]) for (const g of hands[id]) g.rotation.z = a[id];
    orbit.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
  return root;
}
