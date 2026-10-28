// The Controller dialog: the WLED values to enter, the pack to download, flashing and USB push.
import { h } from "../../../shell/h.js";
import { checkbox, numField, row } from "../../../shell/widgets.js";
import { t } from "../lib/i18n.js";
import { EFFECTS } from "../model/effects.js";
import { buildWledPack } from "../wled/bundle.js";
import { FALLBACK_URL, FLASH_SIZES, WLED_VERSION, manifestUrl } from "../wled/flash.js";
import { buildPresets, letterSegments } from "../wled/presets.js";
import { messagesFor, pushToDevice, serialSupported } from "../wled/serial.js";
import { ledSettings } from "../wled/settings.js";
import { openModal } from "./modal.js";
import { project, result, update } from "./state.js";

function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openController(toast) {
  const part = result.get().part;
  const body = h("div", { class: "controller" });
  const modal = openModal(t("controller"), body, { wide: true });
  if (!part?.ledTotal) {
    body.append(h("p", { class: "muted" }, t("noLeds")));
    return modal;
  }
  const p = project.get();
  const s = ledSettings(part.ledTotal, p);
  let flashSize = "4MB";

  const settings = h(
    "div",
    { class: "ro-grid" },
    [
      [t("wLedType"), s.type],
      [t("wOrder"), s.order],
      [t("wLength"), String(s.length)],
      [t("wMaxPsu"), `${s.maxPsuMa} mA`],
      [t("wMaPer"), `${s.maPerLed} mA`],
    ].map(([k, v]) => h("div", { class: "ro" }, h("span", { class: "muted" }, k), h("b", {}, v))),
  );

  const presetChecks = EFFECTS.map((e) =>
    checkbox({
      checked: p.wled.presets.includes(e.key),
      label: t(`fx_${e.key}`),
      key: `wled.preset.${e.key}`,
      onChange: (on) =>
        update((d) => {
          d.wled.presets = on
            ? [...d.wled.presets, e.key]
            : d.wled.presets.filter((k) => k !== e.key);
        }),
    }),
  );

  const flashStatus = h("p", { class: "hint muted" });
  const flashHost = h("div");
  const prepareFlash = async () => {
    flashStatus.textContent = t("flashPreparing");
    flashHost.replaceChildren();
    try {
      if (!serialSupported()) throw new Error("serial");
      await import("esp-web-tools"); // registers <esp-web-install-button>
      const manifest = await manifestUrl(flashSize);
      const button = document.createElement("esp-web-install-button");
      button.setAttribute("manifest", manifest);
      const label = h(
        "button",
        { slot: "activate", class: "primary", dataset: { key: "flash" } },
        t("flashButton"),
      );
      button.append(label);
      flashHost.replaceChildren(button);
      flashStatus.textContent = t("flashReady", { v: WLED_VERSION });
    } catch (e) {
      flashStatus.textContent = e.message === "serial" ? t("flashNoSerial") : t("flashFailed");
    }
  };

  const pushStatus = h("p", { class: "hint muted" });
  const push = async () => {
    const current = result.get().part;
    const proj = project.get();
    const { presets } = buildPresets(current.parts, proj.wled);
    const segs = letterSegments(current.parts);
    try {
      await pushToDevice(messagesFor(segs, presets), (i, n) => {
        pushStatus.textContent = t("pushing", { i, n });
      });
      pushStatus.textContent = t("pushed");
    } catch (e) {
      pushStatus.textContent = e?.name === "NotFoundError" ? t("pushCancelled") : t("pushFailed");
    }
  };

  body.append(
    h("h3", {}, t("wStep1")),
    h("p", { class: "hint muted" }, t("wStep1Hint")),
    row(
      t("flashSize"),
      (() => {
        const sel = h(
          "select",
          {
            dataset: { key: "flash.size" },
            onchange: () => ((flashSize = sel.value), prepareFlash()),
          },
          FLASH_SIZES.map((v) => h("option", { value: v, selected: v === flashSize }, v)),
        );
        return sel;
      })(),
    ),
    flashHost,
    flashStatus,
    h("a", { href: FALLBACK_URL, target: "_blank", rel: "noopener" }, t("flashFallback")),
    h("h3", {}, t("wStep2")),
    h("p", { class: "hint muted" }, t("wStep2Hint")),
    settings,
    row(
      t("wGpio"),
      numField({
        value: p.wled.gpio,
        min: 0,
        max: 48,
        step: 1,
        key: "wled.gpio",
        onChange: (v) =>
          update((d) => {
            d.wled.gpio = v;
          }),
      }),
      t("gpioHint"),
    ),
    h("h3", {}, t("wStep3")),
    h("p", { class: "hint muted" }, t("wStep3Hint")),
    h("div", { class: "checks" }, presetChecks),
    h(
      "button",
      {
        class: "primary",
        dataset: { key: "wled.pack" },
        onclick: () => {
          const cur = result.get().part;
          download(buildWledPack(cur, project.get()), "letters-wled.zip", "application/zip");
        },
      },
      t("wDownload"),
    ),
    serialSupported() && h("button", { dataset: { key: "wled.push" }, onclick: push }, t("wPush")),
    pushStatus,
  );
  prepareFlash();
  void toast;
  return modal;
}
