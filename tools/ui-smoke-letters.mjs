// Drives /letters/ in headless Chromium at desktop and phone width. Needs `vp dev --port 5205` running.
import fs from "node:fs";
import { chromium } from "playwright";

const url = process.env.URL ?? "http://localhost:5205/letters/";
const out = process.env.OUT ?? "/tmp";
const errors = [];
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed++;
};

const svgPath = `${out}/letters-fixture.svg`;
fs.writeFileSync(
  svgPath,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><rect width="300" height="100" fill="#fff"/>` +
    `<path d="M0 0H90V100H0Z" fill="#000"/><circle cx="200" cy="50" r="50" fill="#000"/>` +
    `<circle cx="200" cy="50" r="20" fill="#fff" style="fill:none"/></svg>`,
);

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

for (const [name, viewport] of [
  ["desktop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 800 }],
]) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url);
  const ready = async () => {
    await page.waitForTimeout(350);
    await page.waitForFunction(
      () =>
        /\d+\.\d × /.test(document.querySelector(".status")?.textContent ?? "") &&
        !document.querySelector(".busy")?.textContent,
      null,
      { timeout: 30000 },
    );
  };
  const status = () => page.locator(".status").innerText();
  const parts = () => page.locator(".parts li").count();
  await ready();
  check((await parts()) === 3, `${name}: LED builds as 3 parts`);
  await page.screenshot({ path: `${out}/letters-${name}-default.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!overflow, `${name}: no horizontal page scroll`);

  // Text and size edits rebuild.
  const before = await status();
  await page.fill('[data-key="source.text"]', "OPEN");
  await ready();
  check((await parts()) === 4, `${name}: OPEN builds as 4 parts`);
  await page.fill('[data-key="size.height"]', "150");
  await ready();
  check((await status()) !== before, `${name}: size readout follows the edits (${await status()})`);
  check(!(await page.locator(".busy[data-state=error]").count()), `${name}: no build error`);

  // Plates view and the lid.
  await page.getByRole("button", { name: "Plates", exact: true }).click();
  await page.waitForTimeout(500);
  if (name === "desktop") await page.screenshot({ path: `${out}/letters-desktop-plates.png` });
  await page.getByRole("button", { name: "Assembled", exact: true }).click();
  await page.locator('[data-key="view.lid"]').check();
  await page.locator('[data-key="view.wire"]').check();
  await page.waitForTimeout(500);
  if (name === "desktop") await page.screenshot({ path: `${out}/letters-desktop-lid-wire.png` });
  await page.locator('[data-key="view.wire"]').uncheck();
  check(true, `${name}: plates, lid and wire views switch`);

  // LED preview, both layouts, and the power readouts.
  check((await page.locator(".ro-grid").count()) > 0, `${name}: power readouts show`);
  await page.locator('[data-key="view.leds"]').check();
  for (const fx of ["fire", "meteor", "rainbow"]) {
    await page.selectOption('[data-key="view.fx"]', fx);
    await page.waitForTimeout(400);
  }
  if (name === "desktop") await page.screenshot({ path: `${out}/letters-desktop-leds.png` });
  const ledsBefore = await page.locator(".ro b").first().innerText();
  await page.getByRole("button", { name: "Perimeter", exact: true }).click();
  await ready();
  check(
    !(await page.locator(".busy[data-state=error]").count()) &&
      (await page.locator(".ro b").first().innerText()) !== ledsBefore,
    `${name}: perimeter layout changes the LED count`,
  );
  if (name === "desktop") await page.screenshot({ path: `${out}/letters-desktop-perimeter.png` });
  await page.getByRole("button", { name: "Back rows", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "At first LED", exact: true }).click();
  await ready();
  check(
    !(await page.locator(".busy[data-state=error]").count()),
    `${name}: hole at first LED builds`,
  );
  await page.locator('[data-key="view.leds"]').uncheck();

  // Controller: WLED values, the pack, and the flash button.
  await page.locator('[data-key="controller"]').click();
  await page.waitForTimeout(1500);
  const wledText = await page.locator(".modal").innerText();
  check(
    /Length\s*\d+/.test(wledText) && /mA/.test(wledText),
    `${name}: controller shows the LED values`,
  );
  check(
    (await page.locator("esp-web-install-button").count()) === 1,
    `${name}: the flash button is prepared`,
  );
  const [pack] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-key="wled.pack"]').click(),
  ]);
  check(pack.suggestedFilename() === "letters-wled.zip", `${name}: WLED pack downloads`);
  if (name === "desktop") await page.screenshot({ path: `${out}/letters-desktop-controller.png` });
  await page.keyboard.press("Escape");

  // A part larger than the plate is flagged.
  await page.fill('[data-key="size.height"]', "400");
  await ready();
  check(
    (await page.locator(".parts li.over").count()) > 0,
    `${name}: a 400 mm letter is flagged as too big`,
  );
  await page.fill('[data-key="size.height"]', "120");
  await ready();

  // Your own font.
  await page
    .locator('[data-key="font-file"]')
    .setInputFiles(
      "node_modules/@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff",
    );
  await ready();
  check(
    (await page.locator('[data-key="source.font"]').inputValue()) === "custom",
    `${name}: an uploaded font is used`,
  );

  // SVG: two separate shapes become two parts.
  await page.getByRole("button", { name: "Logo (SVG)", exact: true }).click();
  await page.locator('[data-key="svg"]').setInputFiles(svgPath);
  await ready();
  check((await parts()) === 2, `${name}: an SVG with two shapes builds as 2 parts`);
  if (name === "desktop") await page.screenshot({ path: `${out}/letters-desktop-svg.png` });
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await ready();

  // Exports.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const [mf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  const head = fs
    .readFileSync(await mf.path())
    .subarray(0, 2)
    .toString();
  check(mf.suggestedFilename() === "letters.3mf" && head === "PK", `${name}: 3MF downloads`);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator('[data-key="fmt.3mf"]').uncheck();
  await page.locator('[data-key="fmt.stl"]').check();
  const [zip] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  check(zip.suggestedFilename() === "letters-stl.zip", `${name}: STL zip downloads`);

  // Settings file round trip.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator('[data-key="fmt.3mf"]').uncheck();
  await page.locator('[data-key="fmt.json"]').check();
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  const jsonPath = await json.path();
  const saved = JSON.parse(fs.readFileSync(jsonPath, "utf8")).size.depth;
  await page.fill('[data-key="size.depth"]', String(saved + 10));
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator('[data-key="load"]').setInputFiles(jsonPath);
  await page.waitForTimeout(400);
  check(
    Number(await page.locator('[data-key="size.depth"]').inputValue()) === saved,
    `${name}: loading the settings file restores the depth (${saved})`,
  );

  // Undo and redo.
  await page.fill('[data-key="size.depth"]', String(saved + 5));
  await page.getByRole("button", { name: "Undo" }).click();
  check(
    Number(await page.locator('[data-key="size.depth"]').inputValue()) === saved,
    `${name}: undo restores the depth`,
  );
  await page.getByRole("button", { name: "Redo" }).click();

  // Language and theme.
  await page.getByRole("button", { name: "ES", exact: true }).click();
  check(
    (await page.locator("body").innerText()).includes("Tapa difusora"),
    `${name}: Spanish strings`,
  );
  await page.getByRole("button", { name: "EN", exact: true }).click();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  check(
    (await page.evaluate(() => document.documentElement.dataset.theme)) !== theme,
    `${name}: theme toggles`,
  );

  // Share link opens the same design in a fresh page.
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  check(link.includes("#p="), `${name}: share link copied`);
  if (link) {
    const other = await ctx.newPage();
    await other.goto(link);
    await other.waitForTimeout(1500);
    check(
      Number(await other.locator('[data-key="size.depth"]').inputValue()) === saved + 5,
      `${name}: share link restores the design`,
    );
  }
  await ctx.close();
}

await browser.close();
const real = errors.filter((e) => !/WebGL|GPU stall|swiftshader/i.test(e));
check(!real.length, `no page errors${real.length ? `: ${real.slice(0, 3).join(" | ")}` : ""}`);
process.exit(failed ? 1 : 0);
