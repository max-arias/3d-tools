import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { h } from "../../../shell/h.js";
import { result } from "./state.js";

const css = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function createStage() {
  const canvasWrap = h("div", { class: "canvas" });
  const busy = h("div", { class: "busy", role: "status" });
  const root = h("main", { class: "stage" }, canvasWrap, busy);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  canvasWrap.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 8000);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-150, 220, 360);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(200, -100, 160);
  scene.add(fill);

  const mat = new THREE.MeshStandardMaterial({
    color: "#c9a06a",
    roughness: 0.55,
    flatShading: true,
  });
  const group = new THREE.Group();
  scene.add(group);
  let framed = false;

  function show(part) {
    for (const m of group.children.splice(0)) m.geometry.dispose();
    for (const body of part.bodies) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(body.mesh.positions, 3));
      geo.setIndex(new THREE.BufferAttribute(body.mesh.indices, 1));
      geo.computeVertexNormals();
      geo.translate(-part.center[0], -part.center[1], 0);
      group.add(new THREE.Mesh(geo, mat));
    }
    const r = Math.max(part.size[0], part.size[1]);
    if (!framed) {
      camera.position.set(0, -r * 0.55, r * 1.9);
      orbit.target.set(0, 0, part.size[2] / 2);
      framed = true;
    }
    orbit.minDistance = r * 0.4;
    orbit.maxDistance = r * 8;
  }

  const resize = () => {
    const { clientWidth: w, clientHeight: hh } = canvasWrap;
    if (!w || !hh) return;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvasWrap);

  result.subscribe(({ status, part, error }) => {
    busy.dataset.state = status === "ok" ? "" : status;
    busy.textContent = status === "loading" ? "Building…" : status === "error" ? error : "";
    if (status === "ok" && part) show(part);
  });

  (function loop() {
    renderer.setClearColor(css("--m-bg", "#efe8da"));
    orbit.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
  return root;
}
