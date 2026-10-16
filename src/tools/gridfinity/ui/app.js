import { h } from "../../../shell/h.js";
import { applyTheme } from "../../../shell/theme.js";
import { createHeader } from "./header.js";
import { createSidebar } from "./sidebar.js";
import { createStage } from "./stage.js";
import { ui, startApp } from "./state.js";
import { createHelp, installShortcuts } from "./shortcuts.js";
import { createGuide, startGuideIfFirstVisit } from "./guide.js";
import { installPhone } from "./phone.js";

applyTheme();

function createToast() {
  const el = h("div", { class: "toast", role: "status" });
  const paint = () => {
    const { notice } = ui.get();
    el.textContent = notice ?? "";
    el.dataset.show = notice ? "1" : "0";
  };
  ui.subscribe(paint);
  paint();
  return el;
}

const app = document.getElementById("app");
app.append(
  createHeader(),
  h("main", { class: "workspace" }, createSidebar(), createStage()),
  createToast(),
  createHelp(),
  createGuide(),
);
startApp();
installShortcuts();
installPhone(app);
startGuideIfFirstVisit();
