import { MODES } from "./stage.js";
import { stageApi } from "./stage.js";
import { newSeed, randomize } from "../model/random.js";
import { project, replaceProject, view } from "./state.js";

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
    } else if (e.altKey && k === "r") {
      e.preventDefault();
      replaceProject(randomize(project.get(), newSeed(), view.get().locks));
    } else if (e.altKey && k === "z") {
      e.preventDefault();
      project.undo();
    } else if (!typing && !mod && !e.altKey && k === "r") {
      stageApi.resetView();
    } else if (!typing && !mod && !e.altKey && /^[1-6]$/.test(k)) {
      view.set({ mode: MODES[+k - 1] });
    }
  });
}
