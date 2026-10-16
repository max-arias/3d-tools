// Minimal 3MF writer. Pattern follows gridfinity/export/threemf.js but each item can hold several
// bodies (one per colour) that share a coordinate system, and every item is laid out on one plate.
import { strToU8, zipSync } from "fflate";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const num = (v) => String(Math.round(v * 1e4) / 1e4);

function meshXml(id, name, mesh) {
  const v = [];
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3)
    v.push(`<vertex x="${num(p[i])}" y="${num(p[i + 1])}" z="${num(p[i + 2])}"/>`);
  const t = [];
  const ix = mesh.indices;
  for (let i = 0; i < ix.length; i += 3)
    t.push(`<triangle v1="${ix[i]}" v2="${ix[i + 1]}" v3="${ix[i + 2]}"/>`);
  return `<object id="${id}" name="${esc(name)}" type="model"><mesh><vertices>${v.join("")}</vertices><triangles>${t.join("")}</triangles></mesh></object>`;
}

/**
 * Shelf-pack footprints [{ w, h }] onto as many plates as needed.
 * Returns positions [{ x, y, plate }], the plate count, and whether every part fits a plate alone.
 */
export function packPlates(sizes, bed, gap = 4) {
  let plate = 0;
  let x = gap;
  let y = gap;
  let rowH = 0;
  let fits = true;
  const positions = sizes.map(({ w, h }) => {
    if (w + 2 * gap > bed.x || h + 2 * gap > bed.y) fits = false;
    if (x > gap && x + w + gap > bed.x) {
      x = gap;
      y += rowH + gap;
      rowH = 0;
    }
    if (y > gap && y + h + gap > bed.y) {
      plate++;
      x = gap;
      y = gap;
      rowH = 0;
    }
    const at = { x, y, plate };
    x += w + gap;
    rowH = Math.max(rowH, h);
    return at;
  });
  return { positions, plates: plate + 1, fits };
}

/**
 * items: [{ name, size: [x, y], bodies: [{ name, mesh }] }]; bodies keep their relative position and
 * become extruders 1, 2, ... in order. Returns Uint8Array.
 */
export function build3mf({ items, bed, title = "Tapas" }) {
  const { positions, plates: plateCount } = packPlates(
    items.map((i) => ({ w: i.size[0], h: i.size[1] })),
    bed,
  );
  const cols = Math.ceil(Math.sqrt(plateCount));
  const plates = Array.from({ length: plateCount }, () => []);
  let nextId = 1;
  const objects = [];
  const build = [];
  const settings = [];

  items.forEach((item, n) => {
    const ids = item.bodies.map((b) => {
      const id = nextId++;
      objects.push(meshXml(id, b.name, b.mesh));
      return id;
    });
    let buildId = ids[0];
    if (ids.length > 1) {
      buildId = nextId++;
      objects.push(
        `<object id="${buildId}" name="${esc(item.name)}" type="model"><components>${ids.map((id) => `<component objectid="${id}"/>`).join("")}</components></object>`,
      );
    }
    const at = positions[n];
    const ox = (at.plate % cols) * bed.x * 1.2 + at.x;
    const oy = -Math.floor(at.plate / cols) * bed.y * 1.2 + at.y;
    build.push(
      `<item objectid="${buildId}" transform="1 0 0 0 1 0 0 0 1 ${num(ox)} ${num(oy)} 0" printable="1"/>`,
    );
    plates[at.plate].push(buildId);
    const parts =
      ids.length > 1
        ? ids
            .map(
              (id, i) =>
                `<part id="${id}" subtype="normal_part"><metadata key="name" value="${esc(item.bodies[i].name)}"/><metadata key="extruder" value="${i + 1}"/></part>`,
            )
            .join("")
        : "";
    settings.push(
      `<object id="${buildId}"><metadata key="name" value="${esc(item.name)}"/><metadata key="extruder" value="1"/>${parts}</object>`,
    );
  });

  const plateXml = plates
    .map(
      (ids, i) =>
        `<plate><metadata key="plater_id" value="${i + 1}"/><metadata key="plater_name" value="Plate ${i + 1}"/><metadata key="locked" value="false"/>` +
        ids
          .map(
            (id) =>
              `<model_instance><metadata key="object_id" value="${id}"/><metadata key="instance_id" value="0"/></model_instance>`,
          )
          .join("") +
        `</plate>`,
    )
    .join("");

  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Application">3D Tools Tapas</metadata><metadata name="Title">${esc(title)}</metadata>` +
    `<resources>${objects.join("")}</resources><build>${build.join("")}</build></model>`;

  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
          `<Default Extension="config" ContentType="text/xml"/></Types>`,
      ),
      "_rels/.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
      ),
      "3D/3dmodel.model": strToU8(model),
      "Metadata/model_settings.config": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>\n<config>${settings.join("")}${plateXml}</config>`,
      ),
    },
    { level: 6 },
  );
}
