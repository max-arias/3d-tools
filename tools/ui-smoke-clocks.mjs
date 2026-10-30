// Drives /clocks/ in headless Chromium at desktop and phone width. Needs `vp dev --port 5207` running.
import fs from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { chromium } from "playwright";

const url = process.env.URL ?? "http://localhost:5207/clocks/";
const out = process.env.OUT ?? "/tmp";
const errors = [];
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed++;
};

const svgPath = `${out}/clocks-outline.svg`;
fs.writeFileSync(
  svgPath,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 5 L95 50 L50 95 L5 50Z" fill="#000"/></svg>`,
);

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined, // an older Playwright Chromium works too
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

for (const [name, viewport] of [
  ["desktop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 800 }],
]) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    const where = m.location()?.url ?? "";
    // The site has no favicon (every tool shares that 404); anything else counts.
    if (m.type() === "error" && !where.endsWith("/favicon.ico"))
      errors.push(`${m.text()} ${where}`);
  });
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const ready = async () => {
    await page.waitForTimeout(400);
    await page.waitForFunction(
      () =>
        /\d+\.\d × /.test(document.querySelector(".status")?.textContent ?? "") &&
        !document.querySelector(".busy")?.textContent,
      null,
      { timeout: 60000 },
    );
  };
  const status = () => page.locator(".status").innerText();
  await ready();
  check(
    /200\.0 × 200\.0/.test(await status()),
    `${name}: default clock is 200 × 200 (${await status()})`,
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!overflow, `${name}: no horizontal page scroll`);
  await page.screenshot({ path: `${out}/clocks-${name}-default.png` });

  // Every gallery design builds without an error.
  for (const id of [
    "blossom",
    "cloud",
    "bear",
    "leaf",
    "cheese",
    "minimal",
    "sunburst",
    "station",
    "halo",
    "arch",
  ]) {
    await page.click(`[data-key="gallery.${id}"]`);
    await ready();
    const bad = await page.locator(".busy[data-state=error]").count();
    check(bad === 0, `${name}: gallery ${id} builds`);
  }
  await page.screenshot({ path: `${out}/clocks-${name}-arch.png` });

  if (name === "desktop") {
    // Views switch without errors.
    for (const mode of ["Back", "Side", "Hand stack", "Plates", "Front"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      await page.waitForTimeout(300);
    }
    check(true, `${name}: views switch`);

    // SVG outline upload.
    await page.click('[data-key="gallery.minimal"]');
    await ready();
    await page.getByRole("button", { name: "SVG outline" }).click();
    await page.setInputFiles('[data-key="shape.svg"]', svgPath);
    await ready();
    check(
      /180\.0 × 18\d\.\d/.test(await status()),
      `${name}: SVG diamond outline builds (${await status()})`,
    );

    // A two-colour PNG made in the page becomes art with two colours.
    const png = await page.evaluate(() => {
      const c = Object.assign(document.createElement("canvas"), { width: 120, height: 120 });
      const g = c.getContext("2d");
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 120, 120);
      g.fillStyle = "#d02020";
      g.beginPath();
      g.arc(60, 60, 40, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#2040d0";
      g.fillRect(20, 90, 80, 20);
      return c.toDataURL("image/png").split(",")[1];
    });
    const pngPath = `${out}/clocks-art.png`;
    fs.writeFileSync(pngPath, Buffer.from(png, "base64"));
    await page.setInputFiles('[data-key="art"]', pngPath);
    await ready();
    const layers = await page.locator(".layer").count();
    check(layers >= 2, `${name}: traced PNG has ${layers} colour layers`);

    // Export a 3MF and check every body names its extruder.
    await page.click("text=Export");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("text=Download")]);
    const file = await dl.path();
    const zip = unzipSync(new Uint8Array(fs.readFileSync(file)));
    const config = strFromU8(zip["Metadata/model_settings.config"]);
    const extruders = new Set(
      [...config.matchAll(/key="extruder" value="(\d+)"/g)].map((m) => m[1]),
    );
    check(
      extruders.size >= 3,
      `${name}: 3MF uses ${extruders.size} extruders (${[...extruders].join(", ")})`,
    );
    await page.screenshot({ path: `${out}/clocks-${name}-art.png` });
  }
  await ctx.close();
}
await browser.close();
check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
process.exit(failed ? 1 : 0);
