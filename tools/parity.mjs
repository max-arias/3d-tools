// Parity check against the original Fitforge Drawer: same project, compare exported STL volumes.
// Usage: node tools/parity.mjs <file with #p= payload> [ours=http://localhost:5199/gridfinity/]
// Needs network access, a running `vp dev`, and playwright. Prints per-part bbox, volume, triangles.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";

const [hashFile, ours = "http://localhost:5199/gridfinity/"] = process.argv.slice(2);
const payload = readFileSync(hashFile, "utf8").trim();
const ORIGINAL = "https://fitforge-c5058.web.app/drawer";

async function downloadZip(base) {
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
  });
  await page.addInitScript(() => {
    for (const k of [
      "fitforge.guideSeen",
      "fitforge.phoneNotice",
      "3dtools.gridfinity.guideSeen",
      "3dtools.gridfinity.phoneNotice",
    ]) {
      localStorage.setItem(k, "1");
    }
  });
  await page.goto(`${base}#p=${payload}`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(9000);
  const original = base.includes("fitforge");
  if (original) await page.getByText("PARTS", { exact: false }).first().click();
  else await page.locator(".acc-head", { hasText: "Print & export" }).click();
  await page.waitForTimeout(1000);
  const button = original
    ? page.getByText("STLS (ZIP)", { exact: false }).first()
    : page.getByText("STL files + parts list").first();
  const [dl] = await Promise.all([page.waitForEvent("download"), button.click()]);
  const zip = unzipSync(new Uint8Array(readFileSync(await dl.path())));
  await browser.close();
  return zip;
}

function stats(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(80, true);
  let vol = 0;
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12;
    const v = [0, 1, 2].map((k) => [0, 1, 2].map((i) => dv.getFloat32(o + k * 12 + i * 4, true)));
    for (const p of v)
      p.forEach((c, i) => {
        mn[i] = Math.min(mn[i], c);
        mx[i] = Math.max(mx[i], c);
      });
    vol +=
      (v[0][0] * (v[1][1] * v[2][2] - v[1][2] * v[2][1]) -
        v[0][1] * (v[1][0] * v[2][2] - v[1][2] * v[2][0]) +
        v[0][2] * (v[1][0] * v[2][1] - v[1][1] * v[2][0])) /
      6;
  }
  return { vol: Math.abs(vol), size: mx.map((m, i) => +(m - mn[i]).toFixed(2)), tris: n };
}

const load = (zip) =>
  Object.fromEntries(
    Object.entries(zip)
      .filter(([k]) => k.endsWith(".stl"))
      .map(([k, v]) => [k.replace(/_x\d+\.stl$/, "").replace(/\.stl$/, ""), stats(v)]),
  );

const [a, b] = [load(await downloadZip(ORIGINAL)), load(await downloadZip(ours))];
for (const name of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
  const x = a[name];
  const y = b[name];
  const d = x && y ? `${(((y.vol - x.vol) / x.vol) * 100).toFixed(2)}%` : "-";
  const fmt = (s) => (s ? `${s.size.join("x")} v=${Math.round(s.vol)} t=${s.tris}` : "MISSING");
  console.log(name.padEnd(22), fmt(x).padEnd(40), "|", fmt(y).padEnd(40), d);
}
