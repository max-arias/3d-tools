import { h } from "../../../shell/h.js";
import { ui, setUi, pref, notify } from "./state.js";

const phone = () => matchMedia("(max-width: 760px)").matches;
const SHEET = ["peek", "half", "full"];

/** Phone-only controls: top view / 3D switch, the dock bottom sheet handle, and a one-time notice. */
export function installPhone(app) {
  const apply = () => {
    const s = ui.get();
    app.dataset.sheet = s.sheet;
    app.dataset.mobile = s.mobileView;
  };
  ui.subscribe(apply);
  apply();

  const toggle = h(
    "div",
    { class: "mobile-switch segmented" },
    h(
      "button",
      { onclick: () => setUi({ mobileView: "top" }), "aria-pressed": "true" },
      "TOP VIEW",
    ),
    h("button", { onclick: () => setUi({ mobileView: "3d" }) }, "3D"),
  );
  ui.subscribe(({ mobileView }) => {
    [...toggle.children].forEach((b, i) =>
      b.setAttribute("aria-pressed", String((i === 0) === (mobileView === "top"))),
    );
  });

  const handle = h(
    "button",
    {
      class: "sheet-handle",
      "aria-label": "Drag to open or close the settings",
      onclick: () => {
        const i = SHEET.indexOf(ui.get().sheet);
        setUi({ sheet: SHEET[(i + 1) % SHEET.length] });
      },
    },
    h("i"),
  );

  app.querySelector(".topbar")?.after(toggle);
  app.querySelector(".dock")?.prepend(handle);
  return phone() ? maybeNotice() : null;
}

function maybeNotice() {
  if (pref.get("phoneNotice", "0") === "1") return null;
  pref.set("phoneNotice", "1");
  const close = () => box.remove();
  const box = h(
    "div",
    { class: "modal" },
    h(
      "div",
      { class: "modal-box" },
      h("h2", {}, "EASIER ON A BIGGER SCREEN"),
      h(
        "p",
        {},
        "Laying out a drawer works best on a computer or tablet. Everything works here too, and the link brings your drawer with you.",
      ),
      h(
        "div",
        { class: "guide-actions" },
        h("button", { class: "primary", onclick: close }, "CONTINUE HERE"),
        h(
          "button",
          {
            onclick: () =>
              navigator.clipboard?.writeText(location.href).then(() => {
                notify("Link copied");
                close();
              }, close),
          },
          "COPY LINK",
        ),
      ),
    ),
  );
  document.body.append(box);
  return box;
}
