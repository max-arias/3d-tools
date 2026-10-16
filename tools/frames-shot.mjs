import { chromium } from "playwright";
const out = process.argv[2];
const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
for (const [name, vp] of [
  ["desktop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 800 }],
]) {
  const page = await browser.newPage({ viewport: vp });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("http://localhost:5201/frames/");
  await page.waitForFunction(
    () => /\d+\.\d × /.test(document.querySelector("[data-key=size]")?.textContent ?? ""),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/frames-${name}.png` });
}
console.log("errors:", errors);
await browser.close();
