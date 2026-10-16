import { h } from "../../../shell/h.js";
import { applyTheme } from "../../../shell/theme.js";
import { createHeader } from "./header.js";
import { createSidebar } from "./sidebar.js";
import { createStage } from "./stage.js";
import { startApp } from "./state.js";

applyTheme();

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
startApp();
