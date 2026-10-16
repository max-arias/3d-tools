// Drives /tapas/ in headless Chromium at desktop and phone width. Needs `vp dev --port 5200` running.
import { chromium } from "playwright";

const url = process.env.URL ?? "http://localhost:5200/tapas/";
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
