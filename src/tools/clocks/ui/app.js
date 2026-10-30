import { h } from "../../../shell/h.js";
import { applyTheme } from "../../../shell/theme.js";
import { setLang, langStore } from "../lib/i18n.js";
import { createHeader } from "./header.js";
import { createSidebar } from "./sidebar.js";
import { installShortcuts } from "./shortcuts.js";
import { startApp } from "./state.js";
import { createStage } from "./stage.js";
import "./strings.js";

applyTheme();
setLang(langStore.get().lang);

const toastEl = h("div", { class: "toast", role: "status" });
let toastTimer;
const toast = (msg) => {
  toastEl.textContent = msg;
  toastEl.dataset.show = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => delete toastEl.dataset.show, 1800);
};

document
  .getElementById("app")
  .append(createHeader(toast), createSidebar(toast), createStage(), toastEl);
installShortcuts();
startApp();
