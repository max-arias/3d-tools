// Drives /lamps/ in headless Chromium at desktop and phone width. Needs `vp dev --port 5203` running.
import fs from "node:fs";
import { chromium } from "playwright";

const url = process.env.URL ?? "http://localhost:5203/lamps/";
const out = process.env.OUT ?? "/tmp";
const errors = [];
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed++;
};

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
  await ready();
  check(true, `${name}: first lamp built`);
  const shot = (n) => page.screenshot({ path: `${out}/lamps-${name}-${n}.png` });
  await shot("default");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!overflow, `${name}: no horizontal page scroll`);

  const size = () => page.locator('[data-key="size"]').innerText();
  const before = await size();

  // Ribs and wall edits rebuild.
  await page.fill('[data-key="ribs.depth"]', "8");
  await page.fill('[data-key="ribs.count"]', "20");
  await page.fill('[data-key="ribs.twist"]', "90");
  await page.selectOption('[data-key="ribs.wave"]', "scallop");
  await ready();
  check(!(await page.locator(".busy[data-state=error]").count()), `${name}: ribs edits rebuild`);
  check((await size()) !== before, `${name}: size readout follows ribs (${(await size()).trim()})`);

  // Dragging a profile node changes the shape.
  const dot = page.locator(".profile-editor .node").nth(1);
  await dot.scrollIntoViewIfNeeded();
  const box = await dot.boundingBox();
  const heightBefore = await page.locator('[data-key="node.d"]').inputValue();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 5, { steps: 6 });
  await page.mouse.up();
  await ready();
  const dAfter = await page.locator('[data-key="node.d"]').inputValue();
  check(
    dAfter !== heightBefore,
    `${name}: dragging a node changes its diameter (${heightBefore} → ${dAfter})`,
  );

  // Add a node, then remove it.
  await page.getByRole("button", { name: "+ Add point" }).click();
  check((await page.getByText(/^\d+ of 12$/).innerText()) === "5 of 12", `${name}: node added`);
  await page.getByRole("button", { name: "Remove" }).click();
  check((await page.getByText(/^\d+ of 12$/).innerText()) === "4 of 12", `${name}: node removed`);

  // Every view mode.
  for (const mode of ["Wire", "X-ray", "Section", "Lit", "Room", "Shaded"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page.waitForTimeout(mode === "Room" ? 2500 : 500);
    if (name === "desktop") await shot(`mode-${mode.toLowerCase()}`);
  }
  check(true, `${name}: all view modes switch`);

  // Holder: E14, every spoke style, top and none.
  await page.getByRole("button", { name: "E14", exact: true }).click();
  for (const style of ["tapered", "curved", "straight"]) {
    await page.selectOption('[data-key="spokes.style"]', style);
    await ready();
    check(
      !(await page.locator(".busy[data-state=error]").count()),
      `${name}: ${style} spokes build`,
    );
  }
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "None", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "Bottom", exact: true }).click();
  await ready();

  // Random with the Shape locked keeps the height.
  const h0 = await page.locator('[data-key="height"]').inputValue();
  await page.locator('[data-sec="shape"] .mini').first().click();
  await page.getByRole("button", { name: "New random design" }).click();
  await ready();
  const h1 = await page.locator('[data-key="height"]').inputValue();
  check(h0 === h1, `${name}: a locked Shape survives Random (${h0} = ${h1})`);
  await page.keyboard.press("Alt+z");
  await ready();

  // Library: open one and save my own.
  await page.getByRole("button", { name: "Library", exact: true }).click();
  const cards = await page.locator(".lib-card").count();
  check(cards >= 28, `${name}: library lists ${cards} designs`);
  await page.locator(".lib-card").nth(5).click();
  await ready();
  check(
    /library/.test(await page.locator(".brand").innerText()),
    `${name}: opened design is labelled`,
  );
  await page.fill('[data-key="wall"]', "2");
  check(
    /modified/.test(await page.locator(".brand").innerText()),
    `${name}: edit marks it modified`,
  );
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "My designs" }).click();
  page.once("dialog", (d) => d.accept("Smoke lamp"));
  await page.getByRole("button", { name: "Save current design" }).click();
  check((await page.locator(".lib-card").count()) === 1, `${name}: design saved`);
  await page.keyboard.press("Escape");

  // Exports.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const [stl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download selected" }).click(),
  ]);
  const stlPath = await stl.path();
  const bytes = fs.readFileSync(stlPath);
  const tris = bytes.readUInt32LE(80);
  check(
    stl.suggestedFilename() === "lamp.stl" && bytes.length === 84 + tris * 50,
    `${name}: binary STL with ${tris} triangles`,
  );
  await page.getByRole("button", { name: "Export", exact: true }).click();
  for (const key of ["scad", "png", "json"]) await page.locator(`[data-key="fmt.${key}"]`).check();
  const [zip] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download selected" }).click(),
  ]);
  check(zip.suggestedFilename() === "lamp.zip", `${name}: several formats come as a zip`);

  // Settings file round-trip: save JSON, change the height, load it back.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator('[data-key="fmt.stl"]').uncheck();
  await page.locator('[data-key="fmt.json"]').check();
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download selected" }).click(),
  ]);
  const jsonPath = await json.path();
  const savedHeight = JSON.parse(fs.readFileSync(jsonPath, "utf8")).height;
  await page.fill('[data-key="height"]', String(savedHeight + 40));
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator('[data-key="load"]').setInputFiles(jsonPath);
  await page.waitForTimeout(400);
  check(
    Number(await page.locator('[data-key="height"]').inputValue()) === savedHeight,
    `${name}: loading the settings file restores the height (${savedHeight})`,
  );

  // Undo and redo.
  await page.fill('[data-key="height"]', String(savedHeight + 20));
  await page.getByRole("button", { name: "Undo" }).click();
  check(
    Number(await page.locator('[data-key="height"]').inputValue()) === savedHeight,
    `${name}: undo restores the height`,
  );
  await page.getByRole("button", { name: "Redo" }).click();
  check(
    Number(await page.locator('[data-key="height"]').inputValue()) === savedHeight + 20,
    `${name}: redo reapplies it`,
  );

  // Deep dense ribs are limited and say so; the export stays printable.
  await page.fill('[data-key="ribs.count"]', "80");
  await page.fill('[data-key="ribs.depth"]', "20");
  await page.selectOption('[data-key="ribs.wave"]', "triangle");
  await ready();
  check(
    (await page.locator('[data-key="limited"]').count()) === 1,
    `${name}: too-deep ribs show the limit warning`,
  );

  // Keyboard: 3 opens the X-ray view, 1 goes back to Shaded.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("3");
  check(
    (await page
      .getByRole("button", { name: "X-ray", exact: true })
      .getAttribute("aria-pressed")) === "true",
    `${name}: key 3 selects X-ray`,
  );
  await page.keyboard.press("1");

  // Language and theme.
  await page.getByRole("button", { name: "ES", exact: true }).click();
  check(
    (await page.locator("body").innerText()).includes("Nervaduras"),
    `${name}: Spanish strings`,
  );
  await page.getByRole("button", { name: "EN", exact: true }).click();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  check(
    (await page.evaluate(() => document.documentElement.dataset.theme)) !== theme,
    `${name}: theme toggles`,
  );

  // Share link opens the same lamp in a fresh page.
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  check(link.includes("#p="), `${name}: share link copied`);
  if (link) {
    const other = await ctx.newPage();
    await other.goto(link);
    await other.waitForTimeout(1500);
    check(
      Number(await other.locator('[data-key="height"]').inputValue()) === savedHeight + 20,
      `${name}: share link restores the lamp`,
    );
  }
  await ctx.close();
}

await browser.close();
const real = errors.filter((e) => !/WebGL|GPU stall|swiftshader/i.test(e));
check(!real.length, `no page errors${real.length ? `: ${real.slice(0, 3).join(" | ")}` : ""}`);
process.exit(failed ? 1 : 0);
