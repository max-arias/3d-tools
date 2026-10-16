const EPS = 1e-6;

function combinations(n, k) {
  // Count C(n, k), capped so huge values do not overflow.
  let r = 1;
  for (let i = 1; i <= k; i++) {
    r = (r * (n - k + i)) / i;
    if (r > 1e9) return Infinity;
  }
  return Math.round(r);
}

function evenSplit(n, k) {
  const base = Math.floor(n / k);
  let rem = n % k;
  const counts = Array.from({ length: k }, () => base);
  const mid = (k - 1) / 2;
  const order = [...counts.keys()].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  for (const i of order) {
    if (rem-- <= 0) break;
    counts[i]++;
  }
  return counts;
}

function fits(counts, size, padStart, padEnd, max) {
  return counts.every((c, i) => {
    const len = c * size + (i === 0 ? padStart : 0) + (i === counts.length - 1 ? padEnd : 0);
    return len <= max + EPS;
  });
}

/**
 * Split `n` units of `size` mm into the fewest pieces that each fit `max` mm.
 * `preferred` is a Set of cut positions (unit indices 1..n-1) the cuts should land on.
 * Padding is added to the first and last piece. Returns piece sizes in units.
 */
export function splitAxis({ n, size, max, padStart = 0, padEnd = 0, preferred = new Set() }) {
  const total = n * size + padStart + padEnd;
  const kMin = Math.max(1, Math.ceil(total / max - EPS));
  for (let k = kMin; k <= n; k++) {
    if (k === 1) {
      if (fits([n], size, padStart, padEnd, max)) return [n];
      continue;
    }
    if (preferred.size === 0 || combinations(n - 1, k - 1) > 50000) {
      const counts = evenSplit(n, k);
      if (fits(counts, size, padStart, padEnd, max)) return counts;
      continue;
    }
    const best = bestCuts({ n, k, size, max, padStart, padEnd, preferred });
    if (best) return best;
  }
  throw new Error(`Cannot split: one ${size} mm unit plus padding exceeds the ${max} mm bed`);
}

function bestCuts({ n, k, size, max, padStart, padEnd, preferred }) {
  let best = null;
  let bestScore = null;
  const cuts = [];
  const visit = (from) => {
    if (cuts.length === k - 1) {
      const bounds = [0, ...cuts, n];
      const counts = bounds.slice(1).map((b, i) => b - bounds[i]);
      if (!fits(counts, size, padStart, padEnd, max)) return;
      const onPreferred = cuts.filter((c) => preferred.has(c)).length;
      const score = [
        -onPreferred,
        Math.max(...counts) - Math.min(...counts),
        counts[0] + counts[counts.length - 1],
      ];
      if (!bestScore || compare(score, bestScore) < 0) {
        best = counts;
        bestScore = score;
      }
      return;
    }
    for (let c = from; c <= n - 1 - (k - 2 - cuts.length); c++) {
      cuts.push(c);
      visit(c + 1);
      cuts.pop();
    }
  };
  visit(1);
  return best;
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Baseplate tiles: the product of x and y pieces. Names are tile_{row}-{col}, row/col 1-based. */
export function planTiles(grid, printer) {
  const usableX = printer.x - 2 * printer.margin;
  const usableY = printer.y - 2 * printer.margin;
  const xs = splitAxis({
    n: grid.cols,
    size: grid.pitchX,
    max: usableX,
    padStart: grid.x.padStart,
    padEnd: grid.x.padEnd,
  });
  const ys = splitAxis({
    n: grid.rows,
    size: grid.pitchY,
    max: usableY,
    padStart: grid.y.padStart,
    padEnd: grid.y.padEnd,
  });
  return { xs, ys, tiles: tileList(xs, ys) };
}

function tileList(xs, ys) {
  const tiles = [];
  let y0 = 0;
  ys.forEach((rows, iy) => {
    let x0 = 0;
    xs.forEach((cols, ix) => {
      tiles.push({ name: `tile_${iy + 1}-${ix + 1}`, ix, iy, col: x0, row: y0, cols, rows });
      x0 += cols;
    });
    y0 += rows;
  });
  return tiles;
}
