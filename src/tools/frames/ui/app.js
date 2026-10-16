import { applyTheme } from "../../../shell/theme.js";
import { createHeader } from "./header.js";
import { createSidebar } from "./sidebar.js";
import { createStage } from "./stage.js";
import { startApp } from "./state.js";

applyTheme();
document.getElementById("app").append(createHeader(), createSidebar(), createStage());
startApp();
