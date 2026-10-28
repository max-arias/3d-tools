// The frame, corner handles and turn knob drawn over the preview for the cover's outline. Pure
// view: the stage gives it screen coordinates every frame and handles the drags itself.
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

export function createHandles() {
  const svg = el("svg", { class: "shape-handles" });
  const frame = el("polygon", { class: "sh-frame" });
  const stem = el("line", { class: "sh-stem" });
  const corners = [0, 1, 2, 3].map(() =>
    el("rect", { class: "sh-corner", "data-h": "size", width: 12, height: 12, rx: 2 }),
  );
  const knob = el("circle", { class: "sh-knob", "data-h": "turn", r: 8 });
  svg.append(frame, stem, ...corners, knob);
  svg.style.display = "none";
  return {
    el: svg,
    /**
     * geom = { corners: [{x, y} x4], top: {x, y}, center: {x, y} } in pixels, or null to hide.
     * `area` = { x0, x1, y0, y1 }: the handles stay inside it (clear of the toolbars) even when the
     * frame runs off the edge of a big shape; where they sit does not matter to the drags.
     */
    update(geom, area) {
      svg.style.display = geom ? "" : "none";
      if (!geom) return;
      const keep = (p) => ({
        x: Math.min(area.x1, Math.max(area.x0, p.x)),
        y: Math.min(area.y1, Math.max(area.y0, p.y)),
      });
      frame.setAttribute("points", geom.corners.map((c) => `${c.x},${c.y}`).join(" "));
      corners.forEach((r, i) => {
        const c = keep(geom.corners[i]);
        r.setAttribute("x", c.x - 6);
        r.setAttribute("y", c.y - 6);
      });
      const dx = geom.top.x - geom.center.x;
      const dy = geom.top.y - geom.center.y;
      const len = Math.hypot(dx, dy) || 1;
      const kx = geom.top.x + (dx / len) * 26;
      const ky = geom.top.y + (dy / len) * 26;
      stem.setAttribute("x1", geom.top.x);
      stem.setAttribute("y1", geom.top.y);
      stem.setAttribute("x2", kx);
      stem.setAttribute("y2", ky);
      const k = keep({ x: kx, y: ky });
      knob.setAttribute("cx", k.x);
      knob.setAttribute("cy", k.y);
    },
  };
}
