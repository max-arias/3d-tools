import { h } from "../../../shell/h.js";
import { projects, ui, setUi, setDockTab, setStageView, pref, openedFromLink } from "./state.js";

// Each step: where to look, what to show, and how to tell the person did the thing.
const STEPS = [
  {
    title: "Measure your drawer",
    text: "Type the inside width, depth and height. Everything else is worked out from these three numbers.",
    try: "Change the drawer width",
    target: "dock",
    tab: "space",
    view: "split",
    snapshot: (p) => p.drawer.w,
    done: (p, _u, snap) => p.drawer.w !== snap,
  },
  {
    title: "Choose your printer",
    text: "Pick a preset or enter your bed size. Baseplate tiles and long bins are cut on grid lines so each piece fits.",
    try: "Pick a different printer",
    target: "dock",
    tab: "space",
    view: "split",
    snapshot: (p) => p.printer.preset,
    done: (p, _u, snap) => p.printer.preset !== snap,
  },
  {
    title: "Draw your bins",
    text: "Drag across empty cells in the plan to add a bin. Drag a bin to move it, or pull its round handles to resize. Bins snap to cells and can't overlap. Allow half-size bins under Grid & baseplate if you need smaller steps.",
    try: "Drag across some empty cells",
    target: "top",
    tab: "bins",
    view: "split",
    snapshot: (p) => p.bins.length,
    done: (p, _u, snap) => p.bins.length > snap,
  },
  {
    title: "Fine-tune a bin",
    text: "Click a bin to change just that one, or click empty space to change every bin at once. A dot beside a setting means this bin has its own value; the arrow next to it hands control back to all bins.",
    try: "Add a finger notch to a front wall",
    target: "dock",
    tab: "bins",
    view: "split",
    snapshot: () => null,
    done: (p) =>
      p.binDefaults.grab.front.notch || p.bins.some((b) => b.overrides?.grab?.front?.notch),
  },
  {
    title: "Check it in 3D",
    text: "Drag to orbit and scroll to zoom. Pull apart separates the baseplate tiles and split bins so you can see where the seams fall.",
    try: "Press Pull apart",
    target: "view",
    tab: "bins",
    view: "split",
    snapshot: () => null,
    done: (_p, u) => u.exploded,
  },
  {
    title: "Export and print",
    text: "Export a 3MF with every part already laid out on plates, or STL files with a parts list. Use the same printer in your slicer.",
    try: "Export the 3MF",
    target: "dock",
    tab: "export",
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
        setStageView(def.view);
        snap = def.snapshot(projects.get(), ui.get());
      }
    }
    spot(def?.target);
    const done = def ? !!def.done(projects.get(), s, snap) : false;
    const card = h("div", { class: "guide-card" });
    if (step === 0) {
      card.append(
        h("small", { class: "muted" }, "Welcome"),
        h("h2", {}, "From drawer to print in six steps"),
        h(
          "p",
          {},
          "A quick tour: measure the drawer, choose a printer, draw bins, tune them, check the 3D model and export. It takes about a minute.",
        ),
        h("p", { class: "muted" }, "You can replay it any time with the ? button in the header."),
        h(
          "div",
          { class: "guide-actions" },
          h("button", { class: "primary", onclick: () => go(1) }, "Start the tour"),
          h("button", { onclick: () => finish() }, "Skip"),
        ),
      );
    } else if (step === LAST) {
      card.append(
        h("small", { class: "muted" }, "Tour complete"),
        h("h2", {}, "You're ready"),
        h(
          "p",
          {},
          "Every setting has a sensible default, so you can print the drawer as it is. Switch on advanced options at the bottom of the sidebar when you want finer control.",
        ),
        h(
          "div",
          { class: "guide-actions" },
          h("button", { class: "primary", onclick: () => finish() }, "Start building"),
          h(
            "button",
            {
              onclick: () => {
                finish();
                setUi({ helpOpen: true });
              },
            },
            "Keyboard shortcuts",
          ),
        ),
      );
    } else {
      card.append(
        h("small", { class: "muted" }, `Step ${step} of ${STEPS.length}`),
        h("h2", {}, def.title),
        h("p", {}, def.text),
        h(
          "p",
          { class: `guide-try${done ? " done" : ""}` },
          h("b", {}, done ? "Done" : "Try it"),
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
          h("button", { onclick: () => go(step - 1) }, "Back"),
          h(
            "button",
            { class: "primary", onclick: () => go(step + 1) },
            step === STEPS.length ? "Finish" : "Next",
          ),
          h("button", { class: "link", onclick: () => finish() }, "Leave the tour"),
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
