import { MODES, stageApi } from "./stage.js";
import { project, view } from "./state.js";

const mac = /Mac|iPhone|iPad/.test(navigator.platform);

export function installShortcuts() {
  addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
    const mod = mac ? e.metaKey : e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z" && !typing) {
      e.preventDefault();
      if (e.shiftKey) project.redo();
      else project.undo();
    } else if (mod && k === "y" && !typing) {
      e.preventDefault();
      project.redo();
    } else if (!typing && !mod && !e.altKey && k === "r") {
      stageApi.resetView();
    } else if (!typing && !mod && !e.altKey && /^[1-5]$/.test(k)) {
      view.set({ mode: MODES[+k - 1] });
    } else if (!typing && !mod && e.key.startsWith("Arrow") && view.get().mode === "front") {
      // Arrows nudge the hub by 1 mm (Shift: 5 mm).
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      const [dx, dy] = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, 1],
        ArrowDown: [0, -1],
      }[e.key];
      stageApi.nudgeHub(dx * step, dy * step);
    }
  });
}
