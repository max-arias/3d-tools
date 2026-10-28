// A half-section of the shade you can drag: nodes set the diameter at a height.
import { h } from "../../../shell/h.js";
import { profileCurve } from "../geom/profile.js";
import { MAX_NODES, MIN_NODES } from "../model/project.js";
import { project, update, view } from "./state.js";

const NS = "http://www.w3.org/2000/svg";
const W = 240;
const PAD = 18;
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

/** Scale that fits the whole shade, plus the axis x position, for the current project. */
export function frame(p) {
  const rMax = Math.max(...p.nodes.map((n) => n.d / 2)) * 1.1;
  const k = Math.min((W - PAD * 2) / rMax, (W * 1.25 - PAD * 2) / p.height);
  return { k, x0: PAD, y0: PAD, h: p.height * k };
}

export function createProfileEditor() {
  const svg = svgEl("svg", {
    class: "profile-editor",
    viewBox: `0 0 ${W} ${W * 1.25}`,
    tabindex: 0,
  });
  let drag = null;

  const toDesign = (e, f) => {
    const box = svg.getBoundingClientRect();
    const sx = W / box.width;
    const x = (e.clientX - box.left) * sx;
    const y = (e.clientY - box.top) * sx;
    return { r: (x - f.x0) / f.k, z: 1 - (y - f.y0) / f.h };
  };

  const select = (i) => view.set({ selected: i });

  const paint = () => {
    const p = project.get();
    const f = frame(p);
    const curve = profileCurve(p.nodes);
    const sel = Math.min(view.get().selected, p.nodes.length - 1);
    svg.replaceChildren();
    svg.append(
      svgEl("line", { class: "axis", x1: f.x0, x2: f.x0, y1: f.y0 - 6, y2: f.y0 + f.h + 6 }),
    );
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const z = i / 80;
      pts.push(`${(f.x0 + curve(z) * f.k).toFixed(2)},${(f.y0 + (1 - z) * f.h).toFixed(2)}`);
    }
    svg.append(svgEl("polyline", { class: "curve", points: pts.join(" ") }));
    p.nodes.forEach((n, i) => {
      const dot = svgEl("circle", {
        class: `node${i === sel ? " on" : ""}`,
        cx: f.x0 + (n.d / 2) * f.k,
        cy: f.y0 + (1 - n.z) * f.h,
        r: 6,
        "data-node": i,
      });
      svg.append(dot);
    });
  };

  svg.addEventListener("pointerdown", (e) => {
    const i = e.target.dataset?.node;
    if (i === undefined) return;
    e.preventDefault();
    drag = +i;
    select(drag);
    svg.setPointerCapture(e.pointerId);
    view.set({ dragging: true });
  });
  svg.addEventListener("pointermove", (e) => {
    if (drag === null) return;
    const p = project.get();
    const { r, z } = toDesign(e, frame(p));
    const i = drag;
    const end = i === 0 || i === p.nodes.length - 1;
    update((d) => {
      d.nodes[i].d = Math.round(Math.max(5, r) * 2);
      if (!end) {
        const lo = d.nodes[i - 1].z + 0.01;
        const hi = d.nodes[i + 1].z - 0.01;
        d.nodes[i].z = Math.round(Math.min(hi, Math.max(lo, z)) * 100) / 100;
      }
    }, `drag${i}`);
  });
  const stop = () => {
    if (drag === null) return;
    drag = null;
    view.set({ dragging: false });
  };
  svg.addEventListener("pointerup", stop);
  svg.addEventListener("pointercancel", stop);

  // Double-click empty space to add a node there; right-click or Delete removes one.
  svg.addEventListener("dblclick", (e) => {
    if (e.target.dataset?.node !== undefined) return;
    const p = project.get();
    if (p.nodes.length >= MAX_NODES) return;
    const { z } = toDesign(e, frame(p));
    if (z <= 0.02 || z >= 0.98) return;
    const curve = profileCurve(p.nodes);
    let at = 0;
    update((d) => {
      at = d.nodes.findIndex((n) => n.z > z);
      d.nodes.splice(at, 0, { z: Math.round(z * 100) / 100, d: Math.round(curve(z) * 2) });
    });
    select(at);
  });
  const remove = (i) => {
    const p = project.get();
    if (p.nodes.length <= MIN_NODES || i === 0 || i === p.nodes.length - 1) return;
    update((d) => d.nodes.splice(i, 1));
    select(Math.max(0, i - 1));
  };
  svg.addEventListener("contextmenu", (e) => {
    const i = e.target.dataset?.node;
    if (i === undefined) return;
    e.preventDefault();
    remove(+i);
  });
  svg.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") remove(view.get().selected);
  });

  project.subscribe(paint);
  view.subscribe(paint);
  paint();
  return svg;
}
