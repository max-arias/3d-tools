import { h } from "../../../shell/h.js";
import { projects, ui, setUi, setDockTab, pref, openedFromLink } from "./state.js";

// Each step: where to look, what to show, and how to tell the person did the thing.
const STEPS = [
  {
    title: "MEASURE YOUR DRAWER",
    text: "Enter the inside width, depth and height. Everything else is worked out from these three numbers.",
    try: "Type your drawer width",
    target: "dock",
    tab: "drawer",
    view: "assembled",
    snapshot: (p) => p.drawer.w,
    done: (p, _u, snap) => p.drawer.w !== snap,
  },
  {
    title: "PICK YOUR PRINTER",
    text: "Choose a preset or type the bed size. Baseplate tiles and long bins are cut on grid lines to fit this bed.",
    try: "Pick your printer from the list",
    target: "dock",
    tab: "printer",
    view: "assembled",
    snapshot: (p) => p.printer.preset,
    done: (p, _u, snap) => p.printer.preset !== snap,
  },
  {
    title: "LAY OUT BINS",
    text: "Drag across empty cells to add a bin. Drag a bin to move it, drag its edges to resize. Bins snap to cells and cannot overlap; turn on Half cells in Grid for 21 mm steps.",
    try: "Drag across some empty cells",
    target: "top",
    tab: "bins",
    view: "assembled",
    snapshot: (p) => p.bins.length,
    done: (p, _u, snap) => p.bins.length > snap,
  },
  {
    title: "SET UP A BIN",
    text: "Click a bin to set it up (THIS BIN), or press Esc to set all bins at once (ALL BINS). ALL marks a value a bin takes from All bins; ● one set on this bin, ↺ resets it. Label text is in Labels.",
    try: "Add a finger notch to the front wall",
    target: "dock",
    tab: "bins",
    view: "assembled",
    snapshot: () => null,
    done: (p) =>
      p.binDefaults.grab.front.notch || p.bins.some((b) => b.overrides?.grab?.front?.notch),
  },
  {
    title: "CHECK IT IN 3D",
    text: "Assembled shows the finished drawer. Exploded pulls the tiles and split bins apart so you can see the seams.",
    try: "Switch to Exploded",
    target: "view",
    tab: "bins",
    view: "assembled",
    snapshot: () => null,
    done: (_p, u) => u.view === "exploded",
  },
  {
    title: "EXPORT AND PRINT",
    text: "Download a 3MF with every part already placed on print plates, or STLs with a parts list. Set the same printer in your slicer.",
    try: "Download the 3MF",
    target: "dock",
    tab: "parts",
    view: "plates",
    snapshot: (_p, u) => u.exports,
    done: (_p, u, snap) => u.exports > snap,
  },
];

const LAST = STEPS.length + 1;

export function startGuideIfFirstVisit() {
  if (pref.get("guideSeen", "0") === "1" || openedFromLink) return;
  setUi({ guideStep: 0 });
}

export function createGuide() {
  const root = h("div", { class: "guide" });
  let shown = -2;
  let snap = null;
  let spotEl = null;

  const finish = () => {
    pref.set("guideSeen", "1");
    setUi({ guideStep: -1 });
  };

  const spot = (target) => {
    spotEl?.classList.remove("guide-spot");
    spotEl = target ? document.querySelector(`[data-guide="${target}"]`) : null;
    spotEl?.classList.add("guide-spot");
  };

  const go = (n) => setUi({ guideStep: n });

  function paint() {
    const s = ui.get();
    const step = s.guideStep;
    if (step < 0) {
      root.style.display = "none";
      spot(null);
      shown = -2;
      return;
    }
    root.style.display = "";
    const def = STEPS[step - 1];
    if (step !== shown) {
      shown = step;
      if (def) {
        setDockTab(def.tab);
        setUi({ view: def.view });
        snap = def.snapshot(projects.get(), ui.get());
      }
    }
    spot(def?.target);
    const done = def ? !!def.done(projects.get(), s, snap) : false;
    const card = h("div", { class: "guide-card" });
    if (step === 0) {
      card.append(
        h("small", { class: "muted" }, "FIRST TIME HERE"),
        h("h2", {}, "FROM DRAWER TO PRINT IN SIX STEPS"),
        h(
          "p",
          {},
          "A short tour of the basics: drawer size, printer, laying out bins, bin settings, the 3D check and export. About a minute.",
        ),
        h("p", { class: "muted" }, "You can replay it any time from GUIDE in the top bar."),
        h(
          "div",
          { class: "guide-actions" },
          h("button", { class: "primary", onclick: () => go(1) }, "START TOUR"),
          h("button", { onclick: () => finish() }, "SKIP"),
        ),
      );
    } else if (step === LAST) {
      card.append(
        h("small", { class: "muted" }, "● TOUR DONE"),
        h("h2", {}, "YOU'RE SET"),
        h(
          "p",
          {},
          "Every option has a sensible default, so you can print the drawer as it is. Turn on Advanced in the dock when you want more control.",
        ),
        h(
          "div",
          { class: "guide-actions" },
          h("button", { class: "primary", onclick: () => finish() }, "START BUILDING"),
          h(
            "button",
            {
              onclick: () => {
                finish();
                setUi({ helpOpen: true });
              },
            },
            "SHORTCUTS",
          ),
        ),
      );
    } else {
      card.append(
        h("small", { class: "muted" }, `STEP ${step} OF ${STEPS.length}`),
        h("h2", {}, def.title),
        h("p", {}, def.text),
        h(
          "p",
          { class: `guide-try${done ? " done" : ""}` },
          h("b", {}, done ? "DONE" : "TRY IT"),
          ` ${def.try}`,
        ),
        h(
          "div",
          { class: "guide-bar" },
          h("i", { style: `width:${(step / STEPS.length) * 100}%` }),
        ),
        h(
          "div",
          { class: "guide-actions" },
          h("button", { onclick: () => go(step - 1) }, "← BACK"),
          h(
            "button",
            { class: "primary", onclick: () => go(step + 1) },
            step === STEPS.length ? "FINISH" : "NEXT →",
          ),
          h("button", { class: "link", onclick: () => finish() }, "EXIT GUIDE"),
        ),
      );
    }
    root.replaceChildren(card);
  }

  ui.subscribe(paint);
  projects.subscribe(paint);
  paint();
  return root;
}
