// Drives /boxes/ in headless Chromium at desktop and phone width. Needs `vp dev --port 5206` running.
import fs from "node:fs";
import { chromium } from "playwright";

const url = process.env.URL ?? "http://localhost:5206/boxes/";
const out = process.env.OUT ?? "/tmp";
const errors = [];
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed++;
};

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
});

for (const [name, viewport] of [
  ["desktop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 800 }],
]) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => r.status() >= 400 && console.log(`     ${r.status()} ${r.url()}`));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const ready = async () => {
    await page.waitForTimeout(350);
    await page.waitForFunction(
      () =>
        /\d+\.\d × /.test(document.querySelector(".status")?.textContent ?? "") &&
        !document.querySelector(".busy")?.textContent,
      null,
      { timeout: 90000 },
    );
  };
  const binCount = () => page.locator(".bingrid .bin").count();
  const noError = async (msg) =>
    check(!(await page.locator(".busy[data-state=error]").count()), `${name}: ${msg}`);
  const shot = (file) => page.screenshot({ path: `${out}/boxes-${name}-${file}.png` });

  await ready();
  const parts = await page.locator(".parts li").count();
  check(parts >= 6, `${name}: default box builds ${parts} part kinds`);
  await noError("no build error");
  await shot("default");
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!(await overflow()), `${name}: no horizontal page scroll`);

  // Packs: applying one fills the grid and marks the card.
  await page.locator('[data-key="pack.m3"]').click();
  await ready();
  check((await binCount()) > 10, `${name}: M3 pack puts ${await binCount()} bins in the grid`);
  check(
    (await page.locator('[data-key="pack.m3"]').getAttribute("aria-pressed")) === "true",
    `${name}: the pack card is marked`,
  );
  await noError("pack builds");
  await shot("pack");
  check(!(await overflow()), `${name}: no horizontal scroll after a pack`);

  // Bins: clear, drag two cells, delete with the keyboard, fill the rest.
  await page.locator('[data-key="bins.clear"]').click();
  await ready();
  check((await binCount()) === 0, `${name}: clear empties the grid`);
  const grid = page.locator(".bingrid");
  await grid.scrollIntoViewIfNeeded();
  const box = await grid.boundingBox();
  const cellW = box.width / 5;
  const cellH = box.height / 4;
  await page.mouse.move(box.x + cellW * 0.5, box.y + cellH * 3.5); // front left cell
  await page.mouse.down();
  await page.mouse.move(box.x + cellW * 1.5, box.y + cellH * 3.5, { steps: 4 });
  await page.mouse.up();
  await ready();
  check(
    (await binCount()) === 1 && (await page.locator(".bingrid .bin text").textContent()) === "2×1",
    `${name}: dragging two cells adds a 2×1 bin`,
  );
  check(
    (await page.locator('[data-key="bin.selected"]').count()) === 1,
    `${name}: the new bin is selected`,
  );
  await page.locator('[data-key="bin.dividersX.inc"]').click();
  await ready();
  check(
    (await page.locator('[data-key="bin.dividersX"]').innerText()) === "1",
    `${name}: a divider is added`,
  );
  await page.locator('[data-key="bins.fill"]').click();
  await ready();
  check((await binCount()) === 19, `${name}: fill empty adds 1×1 bins (${await binCount()} bins)`);
  await page.locator(".bingrid .bin").first().click();
  await page.keyboard.press("Delete");
  await ready();
  check((await binCount()) === 18, `${name}: Delete removes the selected bin`);
  await noError("bins build");
  await shot("bins");

  // Suggest.
  await page.locator('[data-key="suggest.open"]').click();
  const dialog = page.locator(".modal");
  await dialog.waitFor();
  const found = await page.locator('[data-key="suggest.out"]').innerText();
  check(/\d+×\d+×\d+U, \d+ % full/.test(found), `${name}: suggest shows "${found}"`);
  await page.fill('[data-key="suggest.count.0"]', "60");
  await page.fill('[data-key="suggest.w.0"]', "5");
  await page.fill('[data-key="suggest.d.0"]', "4");
  await page.waitForTimeout(300);
  check(
    (await page.locator('[data-key="suggest.apply"]').isDisabled()) &&
      /Nothing fits/.test(await page.locator('[data-key="suggest.out"]').innerText()),
    `${name}: an impossible list says nothing fits`,
  );
  await page.fill('[data-key="suggest.count.0"]', "3");
  await page.fill('[data-key="suggest.w.0"]', "1");
  await page.fill('[data-key="suggest.d.0"]', "1");
  await page.waitForTimeout(300);
  if (name === "desktop") await shot("suggest");
  await page.locator('[data-key="suggest.apply"]').click();
  await ready();
  check((await binCount()) === 3, `${name}: applying a suggestion sets the bins`);
  await noError("suggested box builds");

  // Label, parts, size.
  await page.fill('[data-key="label.title"]', "M3");
  await page.fill('[data-key="label.line.0"]', "Bolts");
  await ready();
  await noError("label builds");
  await page.locator('[data-key="grid.x.inc"]').click();
  await ready();
  check(
    /×/.test(await page.locator('[data-key="size.outer"]').innerText()),
    `${name}: size readout is shown`,
  );
  await page.getByRole("button", { name: "4", exact: true }).first().click();
  await ready();
  await noError("4 latches build");
  await page.locator('[data-key="view.open"]').check();
  await page.waitForTimeout(900);
  await shot("open");
  await page.locator('[data-key="view.open"]').uncheck();

  // Printer too small for the base.
  await page.selectOption('[data-key="printer"]', "prusa-mini");
  check((await page.locator('[data-key="size.warn"]').count()) === 1, `${name}: bed warning shows`);
  await page.selectOption('[data-key="printer"]', "bambu-p1s");
  await page.waitForTimeout(200);
  check((await page.locator('[data-key="size.warn"]').count()) === 0, `${name}: warning clears`);

  // Pack sheet and exports.
  await page.locator('[data-key="sheet.copy"]').click();
  const sheet = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  check(/- \d+× Latch/.test(sheet) && /Filament/.test(sheet), `${name}: pack sheet copied`);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const [mf] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-key="export.go"]').click(),
  ]);
  const head = fs
    .readFileSync(await mf.path())
    .subarray(0, 2)
    .toString();
  check(/^box_.*\.3mf$/.test(mf.suggestedFilename()) && head === "PK", `${name}: 3MF downloads`);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator('[data-key="fmt.3mf"]').uncheck();
  await page.locator('[data-key="fmt.stl"]').check();
  const [zip] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-key="export.go"]').click(),
  ]);
  check(zip.suggestedFilename().endsWith("-stl.zip"), `${name}: STL zip downloads`);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const [fit] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.locator('[data-key="export.fit"]').click(),
  ]);
  check(fit.suggestedFilename() === "box-fit-test.3mf", `${name}: fit test downloads`);

  // Settings round trip.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator('[data-key="fmt.3mf"]').uncheck();
  await page.locator('[data-key="fmt.stl"]').uncheck();
  await page.locator('[data-key="fmt.json"]').check();
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-key="export.go"]').click(),
  ]);
  const jsonPath = await json.path();
  const saved = JSON.parse(fs.readFileSync(jsonPath, "utf8")).grid.x;
  await page.locator('[data-key="grid.x.dec"]').click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator('[data-key="load"]').setInputFiles(jsonPath);
  await page.waitForTimeout(400);
  await ready();
  check(
    (await page.locator('[data-key="grid.x"]').innerText()) === String(saved),
    `${name}: loading the settings file restores the width (${saved})`,
  );

  // Undo, language, share.
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "ES", exact: true }).click();
  check((await page.locator("body").innerText()).includes("Cajones"), `${name}: Spanish strings`);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  check(link.includes("#p="), `${name}: share link copied`);
  if (link) {
    const other = await ctx.newPage();
    await other.goto(link);
    await other.waitForTimeout(1500);
    check(
      (await other.locator(".bingrid .bin").count()) === 3,
      `${name}: share link restores the bins`,
    );
  }
  check(!(await overflow()), `${name}: no horizontal page scroll at the end`);
  await ctx.close();
}

await browser.close();
const real = errors.filter((e) => !/WebGL|GPU stall|swiftshader/i.test(e));
check(!real.length, `no page errors${real.length ? `: ${real.slice(0, 3).join(" | ")}` : ""}`);
process.exit(failed ? 1 : 0);
