import { stageApi } from "./stage.js";
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
    } else if (!typing && !mod && !e.altKey && (k === "1" || k === "2")) {
      view.set({ mode: k === "1" ? "assembled" : "plates" });
    }
  });
}
