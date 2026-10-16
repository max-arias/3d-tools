// Tolerance strip: a bar with bowtie pockets at growing clearances and one key per pocket.
// Push each key in; the tightest pocket it enters with firm pressure sets `print.tol`.
const TOLS = [0.05, 0.1, 0.15, 0.2, 0.3];

export function generateCoupon(kit) {
  const Be = 7;
  const Bn = 3.2;
  const L = 14;
  const depth = 2.2;
  const pitch = Be + 5;
  const bowtie = (cx, cy) =>
    kit.poly(
      [
        [-L / 2, -Be / 2],
        [-L / 2, Be / 2],
        [0, Bn / 2],
        [L / 2, Be / 2],
        [L / 2, -Be / 2],
        [0, -Bn / 2],
      ].map(([a, b]) => [cx + a, cy + b]),
    );
  const barLen = pitch * TOLS.length + 6;
  let bar = kit.box(-L / 2 - 6, L / 2 + 6, 0, barLen, 0, depth + 1.6);
  const pockets = TOLS.map((t, i) =>
    kit.ext(kit.grow(bowtie(0, 3 + pitch / 2 + i * pitch), t, "Miter"), -0.1, depth),
  );
  bar = kit.sub(bar, pockets);
  const parts = [];
  const rec = (body, name, role) => {
    const o = kit.export(body, [0, 0, 0]);
    parts.push({
      name,
      role,
      mesh: o.mesh,
      min: o.min,
      size: o.size,
      volume: o.volume,
      valid: o.valid,
      triangles: o.triangles,
      angle: 0,
    });
  };
  rec(bar, "tolerance_bar", "frame");
  TOLS.forEach((t, i) =>
    rec(kit.ext(bowtie(L + 20, 3 + pitch / 2 + i * pitch), 0, depth - 0.2), `key_${t}`, "key"),
  );
  return {
    name: "tolerance_strip",
    parts,
    size: [L + 40, barLen, depth + 1.6],
    outer: [L + 40, barLen],
    layers: {},
    plan: { nx: 1, ny: 1, angle: 0 },
    volume: parts.reduce((a, q) => a + q.volume, 0),
    triangles: parts.reduce((a, q) => a + q.triangles, 0),
    valid: parts.every((q) => q.valid),
    warnings: [],
    coupon: TOLS,
  };
}
