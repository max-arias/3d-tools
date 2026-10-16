// Drives /tapas/ in headless Chromium at desktop and phone width. Needs `vp dev --port 5200` running.
import { chromium } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const url = process.env.URL ?? "http://localhost:5200/tapas/";
const out = process.env.OUT ?? "/tmp";
const errors = [];
const tmp = mkdtempSync(`${tmpdir()}/tapas-smoke-`);
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
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(
    () => /\d+\.\d × /.test(document.querySelector(".status")?.textContent ?? ""),
    null,
    { timeout: 30000 },
  );
  check(true, `${name}: overlay generated`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/tapas-${name}-default.png` });

  const size = () => page.textContent(".status span");
  const before = await size();
  await page.click('.chip:has-text("Corazón")');
  await page.waitForFunction(
    (b) => document.querySelector(".status span")?.textContent !== b,
    before,
    { timeout: 20000 },
  );
  check((await size()) !== before, `${name}: shape change regenerates`);

  await page.click('.chip:has-text("Redondeado")');
  await page.click('.chip:has-text("Sol")');
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".status span").length > 1 &&
      /\d+\.\d × /.test(document.querySelector(".status")?.textContent ?? ""),
    null,
    { timeout: 30000 },
  );
  check(await page.isVisible("text=Color aparte"), `${name}: pattern modes appear`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/tapas-${name}-pattern.png` });
  await page.click('.viewtools button:has-text("En la pared")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/tapas-${name}-wall.png` });
  await page.click('.viewtools button:has-text("Original")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/tapas-${name}-stock.png` });
  await page.click('.viewtools button:has-text("Con cubretapa")');
  await page.click('.viewtools button:has-text("3D")');
  for (const [card, probe] of [
    ["Cubreteclas", "Cubretecla"],
    ["Marco", "Altura del marco"],
    ["Tapa de reemplazo", "Encastre en el bastidor"],
  ]) {
    await page.click(`.cards .card:has-text("${card}")`);
    await page.waitForFunction(
      () =>
        /\d+\.\d × /.test(document.querySelector(".status")?.textContent ?? "") &&
        !document.querySelector(".busy")?.textContent,
      null,
      { timeout: 30000 },
    );
    check(await page.isVisible(`text=${probe}`), `${name}: ${card} section`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/tapas-${name}-${card.split(" ")[0]}.png` });
  }
  // Uploading art: a two-colour SVG and a generated PNG become colour layers on the face.
  await page.click('.cards .card:has-text("Cubretapa")');
  await page.click('.chip:has-text("Mi imagen")');
  writeFileSync(
    `${tmp}/smoke-art.svg`,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="#fff"/><circle cx="25" cy="30" r="20" fill="#d62828"/><path d="M55 50 L75 10 L95 50 Z" fill="#1d4e89"/></svg>',
  );
  await page.locator('.drop input[type="file"]').setInputFiles(`${tmp}/smoke-art.svg`);
  await page.waitForSelector(".art-thumb", { timeout: 20000 });
  check(
    (await page.locator(".layer").count()) === 2,
    `${name}: SVG upload gives two colour layers (background dropped)`,
  );
  // Dragging the image in the preview moves it (no mode button), and the position fields follow.
  const posX = () =>
    page.locator(".row", { hasText: "Posición horizontal" }).locator("input").first().inputValue();
  const canvasBox = await page.locator(".canvas canvas").boundingBox();
  const mx = canvasBox.x + canvasBox.width / 2;
  const my = canvasBox.y + canvasBox.height / 2;
  await page.mouse.move(mx, my);
  await page.mouse.down();
  await page.mouse.move(mx + 50, my - 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  check(
    Number(await posX()) !== 0,
    `${name}: dragging the image changes its position (x = ${await posX()})`,
  );
  const png = await page.evaluate(() => {
    const c = Object.assign(document.createElement("canvas"), { width: 120, height: 80 });
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 120, 80);
    g.fillStyle = "#e63946";
    g.fillRect(10, 10, 40, 60);
    g.fillStyle = "#1d3557";
    g.fillRect(70, 10, 40, 60);
    return c.toDataURL("image/png").split(",")[1];
  });
  writeFileSync(`${tmp}/smoke-art.png`, Buffer.from(png, "base64"));
  await page.locator('.drop input[type="file"]').setInputFiles(`${tmp}/smoke-art.png`);
  await page.waitForFunction(() => document.querySelectorAll(".layer").length === 2, null, {
    timeout: 20000,
  });
  check(true, `${name}: PNG upload traces two colour layers`);
  await page
    .locator('.drop input[type="file"]')
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await page.waitForSelector("text=Subí un SVG", { timeout: 10000 });
  check(true, `${name}: a text file is refused with a message`);
  await page.click('.chip:has-text("Liso")');
  await page.click('.cards .card:has-text("Cubretapa")');
  await page.click('button:has-text("Duplicar")');
  check((await page.locator(".hrow").count()) === 2, `${name}: duplicate adds a cover`);
  await page.click('.cards .card:has-text("Marco")');
  await page.waitForTimeout(600);
  await page.click(".hsel");
  await page.waitForTimeout(600);
  check(await page.isVisible("text=Medidas"), `${name}: selecting a cover restores it`);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.click('button:has-text("Descargar todo")'),
  ]);
  check(
    download.suggestedFilename() === "mi_casa.3mf",
    `${name}: house 3MF downloads (${download.suggestedFilename()})`,
  );
  await page.screenshot({ path: `${out}/tapas-${name}-house.png` });
  await page.waitForTimeout(800);
  await page.click('button:has-text("EN")');
  check(await page.isVisible("text=Download STL"), `${name}: English toggle`);
  await page.click('button:has-text("ES")');

  check(await page.isVisible("text=Descargar 3MF"), `${name}: export buttons`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/tapas-${name}.png` });
  check(
    !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)),
    `${name}: no horizontal scroll`,
  );
  await page.close();
}
await browser.close();
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
process.exit(failed ? 1 : 0);
