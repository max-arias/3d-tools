// Inline SVG icons (stroke style, 24 px grid). `icon("undo")` returns an <svg> that inherits currentColor.
const NS = "http://www.w3.org/2000/svg";

const circle = (cx, cy, r) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const PATHS = {
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  redo: ["m15 14 5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"],
  share: ["M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7", "m16 6-4-4-4 4", "M12 2v13"],
  open: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  save: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
  download: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
  sun: [
    circle(12, 12, 4),
    "M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  ],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
  help: [circle(12, 12, 9), "M9.6 9.2a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1 1-1.1 1.7", "M12 17h.01"],
  grid: ["M3 3h18v18H3z", "M3 9h18M3 15h18M9 3v18M15 3v18"],
  cube: ["m12 2 9 5v10l-9 5-9-5V7z", "m3 7 9 5 9-5M12 12v10"],
  layers: ["m12 2 10 6-10 6L2 8z", "m2 14 10 6 10-6"],
  eye: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z", circle(12, 12, 3)],
  "eye-off": [
    "M9.9 5.2A9.7 9.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9",
    "M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1.1",
    "M3 3l18 18",
  ],
  fill: ["M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4z", "M16.5 14v6M13.5 17h6"],
  trash: ["M3 6h18M8 6V4h8v2", "m6 6 1 14h10l1-14", "M10 10v6M14 10v6"],
  copy: ["M8 8h12v12H8z", "M16 8V4H4v12h4"],
  "arrow-up": ["M12 19V5", "m5 12 7-7 7 7"],
  chevron: ["m6 9 6 6 6-6"],
  warning: ["m12 3 10 18H2z", "M12 10v5M12 18h.01"],
  spinner: ["M21 12a9 9 0 1 1-6.2-8.55"],
  plus: ["M12 5v14M5 12h14"],
  x: ["M18 6 6 18M6 6l12 12"],
  explode: [
    "M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4",
  ],
  plan: ["M3 3h18v18H3z", "M3 12h9V3M12 12v9"],
  sheet: ["M5 3h14v18H5z", "M9 8h6M9 12h6M9 16h3"],
  split: ["M3 4h18v16H3z", "M12 4v16"],
  keyboard: ["M2 6h20v12H2z", "M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"],
  more: [circle(5, 12, 1), circle(12, 12, 1), circle(19, 12, 1)],
};

export function icon(name, size = 18) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  for (const d of PATHS[name] ?? []) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

/** Brand mark: a 2×2 grid of cells with one bin lifted out of the corner. */
export function brandMark(size = 28) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("brand-mark");
  const rect = (x, y, w, h, fill, rx = 3) => {
    const r = document.createElementNS(NS, "rect");
    Object.entries({ x, y, width: w, height: h, rx, fill }).forEach(([k, v]) =>
      r.setAttribute(k, v),
    );
    svg.append(r);
  };
  rect(2, 14, 12, 12, "var(--accent-2)");
  rect(16, 14, 12, 12, "var(--accent-2)");
  rect(2, 28, 26, 2, "var(--accent-2)", 1);
  rect(16, 0, 14, 14, "var(--accent)", 4);
  return svg;
}
