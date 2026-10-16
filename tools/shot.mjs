// Screenshot helper: node tools/shot.mjs <url> <out.png> [width] [height] [theme] [clickSelector...]
import { chromium } from "playwright";

const [url, out, width = "1440", height = "900", theme = "dark", ...clicks] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: +width, height: +height } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.addInitScript((t) => localStorage.setItem("3dtools.theme", t), theme);
await page.goto(url);
await page.waitForTimeout(3500);
for (const sel of clicks) {
  await page.click(sel);
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: out });
if (errors.length) console.log("errors:", errors.slice(0, 5));
await browser.close();
