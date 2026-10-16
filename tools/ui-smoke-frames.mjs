// Drives /frames/ in headless Chromium at desktop and phone width. Needs `vp dev --port 5201` running.
import { chromium } from "playwright";

const url = process.env.URL ?? "http://localhost:5201/frames/";
const out = process.env.OUT ?? "/tmp";
const errors = [];
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed++;
};

const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
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
  // The sidebar rebuilds after a 150 ms debounce, so give an edit time to start before waiting.
  const ready = async (n) => {
    await page.waitForTimeout(350);
    await page.waitForFunction(
      (want) => {
        const t = document.querySelector(".status")?.textContent ?? "";
        const s = document.querySelector('[data-key="size"]')?.textContent ?? "";
        return (
          /\d+\.\d × /.test(t) &&
          !document.querySelector(".busy")?.textContent &&
          (!want || s.includes(want))
        );
      },
      n,
      { timeout: 30000 },
    );
  };
  await ready();
  check(true, `${name}: first frame built`);
  const shot = (n) => page.screenshot({ path: `${out}/frames-${name}-${n}.png` });
  await page.waitForTimeout(300);
  await shot("default");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!overflow, `${name}: no horizontal page scroll`);

  // Pick every profile: each must rebuild without an error banner.
  const profiles = await page.locator(".profile").count();
  check(profiles === 17, `${name}: 17 profiles in the picker (${profiles})`);
  for (const i of [0, 4, 9, 12]) {
    await page.locator(".profile").nth(i).click();
    await ready();
  }
  check(!(await page.locator(".busy[data-state=error]").count()), `${name}: profile picks rebuild`);

  // Shapes.
  for (const shape of ["circle", "arch", "polygon", "rounded", "rect"]) {
    await page.selectOption('[data-key="shape.type"]', shape);
    await ready();
    check(!(await page.locator(".busy[data-state=error]").count()), `${name}: shape ${shape}`);
  }

  // Big frame is split to the bed and says so.
  await page.selectOption('[data-key="photo.size"]', "a3");
  await ready("2 × 2");
  const sizeText = await page.locator('[data-key="size"]').innerText();
  check(/cut in 2 × 2/.test(sizeText), `${name}: A3 is cut for a 256 mm bed (${sizeText.trim()})`);
  await page.getByRole("button", { name: "Exploded" }).click();
  await page.waitForTimeout(300);
  if (name === "desktop") await shot("a3-exploded");
  await page.getByRole("button", { name: "Plates" }).click();
  await page.waitForTimeout(300);
  if (name === "desktop") await shot("a3-plates");
  await page.getByRole("button", { name: "Assembled" }).click();

  // Downloads.
  const [d3mf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "3MF", exact: true }).click(),
  ]);
  check(
    d3mf.suggestedFilename().endsWith(".3mf"),
    `${name}: 3MF download ${d3mf.suggestedFilename()}`,
  );
  const [dstl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^STL/ }).click(),
  ]);
  check(dstl.suggestedFilename().endsWith(".zip"), `${name}: multi-part STL is a zip`);

  // Mini setup on a stamp.
  await page.selectOption('[data-key="photo.size"]', "stamp");
  await ready();
  await page.getByRole("button", { name: "Mini setup" }).click();
  await ready();
  const mini = await page.locator('[data-key="size"]').innerText();
  check(
    /1 part/.test(mini) && /mm/.test(mini),
    `${name}: mini stamp frame is one part (${mini.trim()})`,
  );
  if (name === "desktop") await shot("mini");

  // Mat and lithophane with an uploaded picture.
  await page.selectOption('[data-key="photo.size"]', "4x6");
  await ready();
  await page.getByRole("button", { name: "Preview with my picture" }).waitFor();
  const png = await page.evaluate(() => {
    const c = Object.assign(document.createElement("canvas"), { width: 120, height: 180 });
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 120, 180);
    grad.addColorStop(0, "#222");
    grad.addColorStop(1, "#eee");
    g.fillStyle = grad;
    g.fillRect(0, 0, 120, 180);
    g.fillStyle = "#c33";
    g.beginPath();
    g.arc(60, 90, 40, 0, 7);
    g.fill();
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.setInputFiles('input[type="file"]', {
    name: "p.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.waitForTimeout(500);
  await page.locator('[data-key="mat.on"]').check();
  await ready();
  await page.locator('[data-key="litho.on"]').check();
  await ready();
  check(
    !(await page.locator(".busy[data-state=error]").count()),
    `${name}: mat + lithophane build`,
  );
  await page.getByRole("button", { name: "Exploded" }).click();
  await page.waitForTimeout(400);
  if (name === "desktop") await shot("litho-exploded");

  // Gallery: add a second frame and export both.
  await page.getByRole("button", { name: "+ New" }).click();
  await ready();
  check((await page.locator(".items li").count()) === 2, `${name}: gallery has two frames`);
  const [dall] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /in one 3MF/ }).click(),
  ]);
  check(
    dall.suggestedFilename() === "frames_gallery.3mf",
    `${name}: gallery 3MF ${dall.suggestedFilename()}`,
  );

  // Units.
  await page.getByRole("button", { name: "in", exact: true }).click();
  const inch = await page.locator('[data-key="photo.overlap"]').inputValue();
  check(Math.abs(+inch - 3 / 25.4) < 0.01, `${name}: overlap shows in inches (${inch})`);

  const overflow2 = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  check(!overflow2, `${name}: still no horizontal scroll after edits`);
  await ctx.close();
}
await browser.close();
check(
  errors.length === 0,
  `no console or page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`,
);
process.exit(failed ? 1 : 0);
