import { h } from "../../../shell/h.js";
import { applyTheme } from "../../../shell/theme.js";
import { createDock } from "./dock.js";
import { createTopBar } from "./topbar.js";
import { createTopView } from "./topview.js";
import { createViewer } from "./viewer3d.js";
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
  createTopBar(),
  h("main", { class: "views" }, createTopView(), createViewer()),
  createDock(),
  createToast(),
  createHelp(),
  createGuide(),
);
startApp();
installShortcuts();
installPhone(app);
startGuideIfFirstVisit();
