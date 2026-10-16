import { KEY, floorHeight } from "../constants.js";
import { KEY_LENGTH, keySlot, makeKey } from "./keys.js";

const CLEARANCES = [0.1, 0.15, 0.2];

/** Two half-slot blocks and three keys (1, 2, 3 dimples) at the three clearances. */
export function generateKeyTest(kit) {
  const floor = 3; // skeleton floor
  const parts = [];
  const L = KEY_LENGTH / 2 + 8;
  const Wd = KEY.headW + 12;
  const H = floor + KEY.stop;
  const slot = keySlot(kit, floor);
  const blockA = kit.sub(kit.box(0, L, 0, Wd, 0, H), kit.move(slot, L, Wd / 2, 0));
  const blockB = kit.sub(kit.box(0, L, 0, Wd, 0, H), kit.move(slot, 0, Wd / 2, 0));
  parts.push(
    { name: "keytest_block_a", ...kit.export(blockA) },
    { name: "keytest_block_b", ...kit.export(blockB) },
  );
  CLEARANCES.forEach((c, i) => {
    const key = makeKey(kit, { floor, clearance: c, dimples: i + 1 });
    parts.push({ name: `hkey_${c.toFixed(2)}mm`, ...kit.export(key) });
  });
  for (const p of parts) p.kind = p.name.startsWith("hkey") ? "key" : "tile";
  return { parts, floor: floorHeight({ style: "skeleton" }) };
}
