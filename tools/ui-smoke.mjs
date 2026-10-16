// UI smoke test: drives the running app in a real browser and fails on any broken flow or console error.
// Usage: npx vp dev --port 5199   (in another shell)   then   node tools/ui-smoke.mjs [baseUrl]
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:5199/gridfinity/";
const example = readFileSync(
  new URL("../test/fixtures/fitforge-example.hash", import.meta.url),
  "utf8",
).trim();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let checks = 0;

function check(ok, what) {
  checks++;
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exitCode = 1;
  } else console.log(`ok   ${what}`);
}

async function open(viewport, hash = "", mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.addInitScript(() => {
    localStorage.setItem("3dtools.gridfinity.guideSeen", "1");
    localStorage.setItem("3dtools.gridfinity.phoneNotice", "1");
  });
  await page.goto(base + hash);
  await page.waitForSelector(".tv-area");
  await page.waitForTimeout(2500);
  return page;
}

// ---- desktop ----------------------------------------------------------------------------------
const page = await open({ width: 1440, height: 900 }, `#p=${example}`);
const count = () => page.locator(".tv-bin").count();
check((await count()) === 13, "example drawer shows 13 bins");

const sections = await page.locator(".acc").count();
check(sections === 5, `sidebar has 5 sections (found ${sections})`);
for (let i = 0; i < sections; i++) {
  const head = page.locator(".acc-head").nth(i);
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await page.waitForTimeout(200);
  check(
    (await page.locator(".acc[data-open=true] .acc-body").count()) === 1,
    `section ${i + 1} opens`,
  );
}

await page
  .locator(".tv-bin")
  .nth(4)
  .dispatchEvent("pointerdown", { button: 0, clientX: 600, clientY: 300 });
await page.mouse.up();
check(
  (await page.locator(".scope-banner.on").count()) === 1,
  "selecting a bin shows the bin banner",
);

for (const view of ["Plan", "3D", "Split", "Plates"]) {
  await page.locator(".stage-bar .segmented button", { hasText: view }).click();
  await page.waitForTimeout(300);
  const shown = await page.locator(".stage-body").getAttribute("data-view");
  check(
    shown === { Plan: "plan", "3D": "3d", Split: "split", Plates: "plates" }[view],
    `view switches to ${view}`,
  );
}
check((await page.locator(".plate").count()) > 3, "plates view lists several plates");
await page.locator(".stage-bar .segmented button", { hasText: "Split" }).click();

// edit flow on a fresh, empty drawer
const fresh = await open({ width: 1440, height: 900 });
const area = await fresh.locator(".tv-area").boundingBox();
await fresh.mouse.move(area.x + area.width * 0.35, area.y + area.height * 0.35);
await fresh.mouse.down();
await fresh.mouse.move(area.x + area.width * 0.5, area.y + area.height * 0.5, { steps: 6 });
await fresh.mouse.up();
const n = () => fresh.locator(".tv-bin").count();
check((await n()) === 1, "drag creates a bin");
await fresh.keyboard.press("d");
check((await n()) === 2, "D duplicates");
await fresh.keyboard.press("f");
check((await n()) > 10, "F fills empty cells");
await fresh.keyboard.press("Control+z");
check((await n()) === 2, "Ctrl+Z undoes the fill");
await fresh.keyboard.press("Delete");
check((await n()) === 1, "Delete removes the selected bin");
// lids: pick a lid for the selected bin, the Lids chip and parts list follow
await fresh.keyboard.press("Escape");
await fresh.locator(".tv-bin").first().click();
await fresh.locator(".card", { hasText: "Drop-in lid" }).click();
await fresh.waitForTimeout(2500);
await fresh.locator(".stage-bar .segmented button", { hasText: "3D" }).click();
check(
  (await fresh.locator(".stage-bar button", { hasText: "Lids" }).count()) === 1,
  "a lid adds the Lids chip",
);
await fresh.locator(".acc-head", { hasText: "Print & export" }).click();
check(
  (await fresh.locator(".s-part", { hasText: "lid_" }).count()) === 1,
  "the lid is listed in the parts",
);
await fresh.locator(".stage-bar .segmented button", { hasText: "Split" }).click();
await fresh.keyboard.press("?");
check((await fresh.locator(".modal-box").count()) === 1, "? opens the shortcut list");
await fresh.keyboard.press("Escape");

// exports
for (const [label, ext] of [
  ["3MF", ".3mf"],
  ["STL files", ".zip"],
]) {
  await fresh.locator(".app-header .primary").click();
  const [dl] = await Promise.all([
    fresh.waitForEvent("download"),
    fresh.locator(".menu-item", { hasText: label }).click(),
  ]);
  check(dl.suggestedFilename().endsWith(ext), `export ${label} downloads a ${ext} file`);
}
await fresh.keyboard.press("2");

// ---- phone -------------------------------------------------------------------------------------
const phone = await open({ width: 390, height: 800 }, `#p=${example}`, true);
const scroll = await phone.evaluate(() => document.documentElement.scrollWidth);
check(scroll <= 390, `phone layout does not scroll sideways (width ${scroll})`);
check((await phone.locator(".sheet-handle").count()) === 1, "phone has the settings sheet handle");

check(
  !(await phone.locator(".stage-bar").innerText()).includes("null"),
  'stage bar has no stray "null" text',
);
check(
  errors.length === 0,
  `no console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`,
);
console.log(`${checks} checks`);
await browser.close();
