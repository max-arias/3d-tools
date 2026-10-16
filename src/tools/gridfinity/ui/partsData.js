import { packPlates } from "../layout/pack.js";
import { presetById } from "../model/printers.js";
import { groupParts } from "../export/group.js";

let memo = { result: null, key: "", value: null };

/**
 * Parts table data and print plates for a generation result.
 * Returns { groups, plates, plateOf }:
 *  - groups: see groupParts, each with `plates` (sorted plate numbers, 1-based)
 *  - plates: [{ index, oversize, items: [{ id: part name, x, y, w, d, rot }] }]
 *  - plateOf: Map part name -> plate index
 */
export function getPartsData(result, project) {
  if (!result) return { groups: [], plates: [], plateOf: new Map() };
  const key = JSON.stringify([project.printer]);
  if (memo.result === result && memo.key === key) return memo.value;

  const printer = project.printer;
  const preset = presetById(printer.preset);
  const keepOut = preset?.id === "bambu-p1s" && printer.x === preset.x && printer.y === preset.y;
  const plates = packPlates(
    // Two-colour text bodies ride along with their bin and are not packed on their own.
    result.parts
      .filter((p) => !p.inlay)
      .map((p) => ({ id: p.name, kind: p.kind, w: p.size[0], d: p.size[1] })),
    printer,
    { keepOut },
  );
  const plateOf = new Map();
  for (const plate of plates) for (const it of plate.items) plateOf.set(it.id, plate.index);
  for (const p of result.parts)
    if (p.inlay) plateOf.set(p.name, plateOf.get(p.name.replace(/_text$/, "")));
  const groups = groupParts(result.parts)
    .filter((g) => !g.inlay) // two-colour text rides along with its bin
    .map((g) => ({
      ...g,
      plates: [...new Set(g.parts.map((p) => plateOf.get(p.name)))]
        .filter((n) => n != null)
        .sort((a, b) => a - b)
        .map((n) => n + 1),
    }));
  memo = { result, key, value: { groups, plates, plateOf } };
  return memo.value;
}
