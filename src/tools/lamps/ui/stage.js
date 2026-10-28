import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { h } from "../../../shell/h.js";
import { segmented } from "../../../shell/widgets.js";
import { profileCurve } from "../geom/profile.js";
import { MAX_NODES } from "../model/project.js";
import { langStore, t } from "../lib/i18n.js";
import { buildRoom, ceilingCord, loadStand, tableBase } from "./room.js";
import { project, result, update, view } from "./state.js";

const css = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export const MODES = ["shaded", "wire", "xray", "section", "lit", "room"];
const HANDLE_MODES = new Set(["shaded", "wire", "xray", "section"]);
const BASE_TOP = 200; // table lamp base height in the Room view
const PENDANT_BOTTOM = 420; // height of a pendant's lower rim above the tabletop

/** Hooks other modules use: PNG snapshot and camera reset. Filled in by createStage. */
export const stageApi = { snapshot: async () => null, resetView: () => {} };

export function createStage() {
  const canvasWrap = h("div", { class: "canvas" });
  const busy = h("div", { class: "busy", role: "status" });
  const tools = h("div", { class: "viewtools" });
  const status = h("div", { class: "status" });
  const root = h("main", { class: "stage" }, canvasWrap, tools, busy, status);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  canvasWrap.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;

  const studio = new THREE.Group();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1.1);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-150, 300, 360);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(200, -100, 160);
  studio.add(hemi, key, fill);
  scene.add(studio);

  // The lamp is modelled Z-up; this group stands it up in the Y-up scene.
  const lamp = new THREE.Group();
  lamp.rotation.x = -Math.PI / 2;
  scene.add(lamp);
  const handles = new THREE.Group();
  lamp.add(handles);
  const bulb = new THREE.Group();
  lamp.add(bulb);
  const glow = new THREE.PointLight("#ffd9a0", 0, 0, 1.2);
  bulb.add(glow);

  let roomGroup = null;
  let roomLoading = false;
  const fixture = new THREE.Group();
  scene.add(fixture);

  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0); // keeps the back half (z <= 0)
  let shade = null;
  let wireMesh = null;
  let current = null;
  let framedFor = null;

  const mats = {
    solid: new THREE.MeshStandardMaterial({
      roughness: 0.55,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
    wire: new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.45 }),
    bulb: new THREE.MeshBasicMaterial({ color: "#fff2cf" }),
    stem: new THREE.MeshStandardMaterial({ color: "#8a8378", roughness: 0.4, metalness: 0.6 }),
    handle: new THREE.MeshBasicMaterial({ depthTest: false, transparent: true }),
  };

  const geometryOf = (mesh) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geo.computeVertexNormals();
    return geo;
  };

  /** Where the bulb sits inside the shade, from the holder side. */
  const bulbZ = (p) =>
    p.holder.at === "top"
      ? p.height - p.holder.plate - 60
      : p.holder.at === "bottom"
        ? p.holder.plate + 60
        : p.height * 0.4;

  function frameCamera(p) {
    const r = Math.max(p.height, ...p.nodes.map((n) => n.d)) * 1.0;
    camera.position.set(0, p.height * 0.6, r * 4 + 120);
    orbit.target.set(0, p.height * 0.45, 0);
    orbit.minDistance = r * 0.4;
    orbit.maxDistance = r * 12;
  }

  const applyMode = (mode, p) => {
    const lit = mode === "lit" || mode === "room";
    mats.solid.color.set(p.color);
    mats.solid.transparent = mode === "xray" || lit;
    mats.solid.opacity = mode === "xray" ? 0.3 : lit ? 0.9 : 1;
    mats.solid.depthWrite = mode !== "xray";
    mats.solid.emissive.set(lit ? p.color : "#000000");
    mats.solid.emissiveIntensity = mode === "lit" ? 0.85 : lit ? 0.4 : 0;
    mats.solid.clippingPlanes = mode === "section" ? [clip] : [];
    mats.wire.color.set(css("--m-edge", "#3a322a"));
    if (wireMesh) wireMesh.visible = mode === "wire";
    studio.visible = mode !== "room";
    hemi.intensity = lit ? 0.25 : 1.1;
    key.intensity = lit ? 0.3 : 2.2;
    fill.intensity = lit ? 0.1 : 0.6;
    glow.intensity = mode === "lit" ? 25000 : mode === "room" ? 3500 : 0;
    bulb.visible = lit;
    handles.visible = HANDLE_MODES.has(mode);
  };

  function placeFixture(p) {
    for (const o of fixture.children.splice(0)) o.removeFromParent();
    const room = view.get().mode === "room";
    lamp.position.set(0, 0, 0);
    if (!room) return;
    if (p.type === "pendant") {
      lamp.position.y = PENDANT_BOTTOM;
      fixture.add(ceilingCord(PENDANT_BOTTOM + p.height));
    } else {
      lamp.position.y = BASE_TOP;
      fixture.add(tableBase(BASE_TOP));
    }
  }

  function placeBulb(p) {
    bulb.clear();
    bulb.add(glow);
    const z = bulbZ(p);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), mats.bulb);
    ball.position.set(0, 0, z);
    const dir = p.holder.at === "top" ? 1 : -1;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 50, 16), mats.stem);
    stem.rotation.x = Math.PI / 2;
    stem.position.set(0, 0, z + dir * 55);
    bulb.add(ball, stem);
    glow.position.set(0, 0, z);
  }

  function placeHandles() {
    for (const o of handles.children.splice(0)) o.geometry?.dispose();
    const p = project.get();
    const curve = profileCurve(p.nodes);
    const sel = Math.min(view.get().selected, p.nodes.length - 1);
    const s = Math.max(3, p.height * 0.018);
    p.nodes.forEach((n, i) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(i === sel ? s * 1.4 : s, 16, 12),
        mats.handle.clone(),
      );
      m.material.color.set(i === sel ? css("--accent", "#d9622b") : "#ffffff");
      m.position.set(curve(n.z), 0, n.z * p.height);
      m.renderOrder = 10;
      m.userData.node = i;
      handles.add(m);
    });
  }

  function build() {
    const part = result.get().part;
    if (!part) return;
    const p = project.get();
    const mode = view.get().mode;
    if (shade) {
      shade.geometry.dispose();
      lamp.remove(shade, wireMesh);
    }
    const geo = geometryOf(part.mesh);
    shade = new THREE.Mesh(geo, mats.solid);
    wireMesh = new THREE.Mesh(geo, mats.wire);
    lamp.add(shade, wireMesh);
    applyMode(mode, p);
    placeBulb(p);
    placeFixture(p);
    placeHandles();
    const group = mode === "room" ? `room:${p.type}` : "free";
    if (framedFor !== group) {
      if (mode === "room") frameRoom(p);
      else frameCamera(p);
      framedFor = group;
    }
  }

  function frameRoom(p) {
    const baseY = p.type === "pendant" ? PENDANT_BOTTOM : BASE_TOP;
    const top = baseY + p.height;
    camera.position.set(260, top * 0.6, 1500);
    orbit.target.set(0, (baseY + top) / 2 - 40, 0);
    orbit.minDistance = 300;
    orbit.maxDistance = 3200;
  }

  async function ensureRoom() {
    if (roomGroup || roomLoading) return;
    roomLoading = true;
    try {
      roomGroup = buildRoom((await loadStand()).clone(true));
      scene.add(roomGroup);
      roomGroup.visible = view.get().mode === "room";
    } catch {
      roomGroup = null;
    } finally {
      roomLoading = false;
    }
  }

  // --- picking: drag a handle, or double-click the shade to add a node ---
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const point = (e) => {
    const box = renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((e.clientX - box.left) / box.width) * 2 - 1,
      -((e.clientY - box.top) / box.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
  };
  const handleAt = (e) => {
    if (!handles.visible) return null;
    point(e);
    return ray.intersectObjects(handles.children, false)[0]?.object.userData.node ?? null;
  };
  let dragging = null;
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const dom = renderer.domElement;

  dom.addEventListener("pointerdown", (e) => {
    const i = handleAt(e);
    if (i === null) return;
    dragging = i;
    orbit.enabled = false;
    dom.setPointerCapture(e.pointerId);
    view.set({ selected: i, dragging: true });
  });
  dom.addEventListener("pointermove", (e) => {
    if (dragging === null) {
      dom.style.cursor = handleAt(e) === null ? "" : "grab";
      return;
    }
    point(e);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    const local = lamp.worldToLocal(hit.clone());
    const p = project.get();
    const i = dragging;
    const end = i === 0 || i === p.nodes.length - 1;
    update((d) => {
      d.nodes[i].d = Math.round(Math.max(5, local.x) * 2);
      if (!end) {
        const lo = d.nodes[i - 1].z + 0.01;
        const hi = d.nodes[i + 1].z - 0.01;
        d.nodes[i].z = Math.round(Math.min(hi, Math.max(lo, local.z / p.height)) * 100) / 100;
      }
    }, `drag${i}`);
  });
  const release = () => {
    if (dragging === null) return;
    dragging = null;
    orbit.enabled = true;
    view.set({ dragging: false });
  };
  dom.addEventListener("pointerup", release);
  dom.addEventListener("pointercancel", release);
  dom.addEventListener("dblclick", (e) => {
    const p = project.get();
    if (!shade || !handles.visible || p.nodes.length >= MAX_NODES || handleAt(e) !== null) return;
    point(e);
    const found = ray.intersectObject(shade, false)[0];
    if (!found) return;
    const z = lamp.worldToLocal(found.point.clone()).z / p.height;
    if (z <= 0.02 || z >= 0.98) return;
    const curve = profileCurve(p.nodes);
    let at = 0;
    update((d) => {
      at = d.nodes.findIndex((n) => n.z > z);
      d.nodes.splice(at, 0, { z: Math.round(z * 100) / 100, d: Math.round(curve(z) * 2) });
    });
    view.set({ selected: at });
  });

  const modeBar = h("span", { class: "modes" });
  let paintedMode = null;
  const paintModes = () => {
    paintedMode = view.get().mode;
    modeBar.replaceChildren(
      segmented({
        value: view.get().mode,
        options: MODES.map((m) => ({ value: m, label: t(`mode_${m}`) })),
        onChange: (mode) => {
          framedFor = null;
          if (mode === "room") ensureRoom();
          view.set({ mode });
        },
      }),
    );
  };
  tools.append(
    modeBar,
    h("button", { title: "R", onclick: () => stageApi.resetView() }, t("resetView")),
  );
  langStore.subscribe(() => {
    paintModes();
    tools.lastChild.textContent = t("resetView");
  });
  paintModes();

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
      current = part;
      status.textContent = `${part.size.map((v) => v.toFixed(1)).join(" × ")} mm · ${part.triangles.toLocaleString()} ${t("triangles")}`;
      build();
    }
  });
  view.subscribe((v) => {
    if (v.mode !== paintedMode) paintModes();
    if (v.mode === "room") ensureRoom();
    if (roomGroup) roomGroup.visible = v.mode === "room";
    if (!current) return;
    applyMode(v.mode, project.get());
    placeFixture(project.get());
    placeHandles();
    if (framedFor === null) {
      if (v.mode === "room") frameRoom(project.get());
      else frameCamera(project.get());
      framedFor = v.mode === "room" ? `room:${project.get().type}` : "free";
    }
  });
  project.subscribe((p) => {
    if (!current) return;
    placeHandles();
    mats.solid.color.set(p.color);
    placeFixture(p);
    placeBulb(p);
  });

  stageApi.resetView = () => {
    const p = project.get();
    if (view.get().mode === "room") frameRoom(p);
    else frameCamera(p);
  };
  stageApi.snapshot = () =>
    new Promise((resolve) => {
      renderer.render(scene, camera);
      renderer.domElement.toBlob(resolve, "image/png");
    });

  (function loop() {
    const mode = view.get().mode;
    scene.background = new THREE.Color(
      mode === "lit" ? "#14110e" : mode === "room" ? "#2a2522" : css("--m-bg", "#efe8da"),
    );
    clip.constant = 0;
    orbit.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
  return root;
}
