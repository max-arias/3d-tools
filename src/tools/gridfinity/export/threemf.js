import { strToU8, zipSync } from "fflate";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const num = (v) => String(Math.round(v * 1e4) / 1e4);

const BIN_PRINT = {
  light: {
    top_shell_layers: 3,
    top_shell_thickness: 0.8,
    sparse_infill_density: "6%",
    sparse_infill_pattern: "adaptivecubic",
    bottom_shell_layers: 2,
  },
  superlight: {
    top_shell_layers: 3,
    top_shell_thickness: 0.6,
    sparse_infill_density: "5%",
    sparse_infill_pattern: "adaptivecubic",
    bottom_shell_layers: 2,
  },
};

/** Bambu printers that get a full project_settings.config. */
const BAMBU = {
  "bambu-p1s": {
    model: "Bambu Lab P1S",
    process: "0.20mm Standard @BBL X1C",
    exclude: [
      [0, 0],
      [18, 0],
      [18, 28],
      [0, 28],
    ],
  },
  "bambu-p2s": { model: "Bambu Lab P2S", process: "0.20mm Standard @BBL P2S", exclude: [] },
  "bambu-a1": { model: "Bambu Lab A1", process: "0.20mm Standard @BBL A1", exclude: [] },
  "bambu-a1mini": { model: "Bambu Lab A1 mini", process: "0.20mm Standard @BBL A1M", exclude: [] },
  "bambu-x2d": { model: "Bambu Lab X2D", process: "0.20mm Standard @BBL X2D", exclude: [] },
  "bambu-h2d": { model: "Bambu Lab H2D", process: "0.20mm Standard @BBL H2D", exclude: [] },
};

export const isBambu = (printer) => printer.preset in BAMBU;

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
 * Build a 3MF package with parts packed on plates.
 * items: [{ name, mesh, size:[x,y,z], plate, x, y, rot, text?: { mesh, offset:[dx,dy,dz] }, binPrint? }]
 *  - x, y: min corner of the (rotated) footprint inside the plate's usable area
 *  - text: second-colour body placed at `offset` from the main body's min corner
 * Returns Uint8Array.
 */
export function build3mf({
  items,
  printer,
  title = "Gridfinity drawer organizer",
  binPrint = "regular",
}) {
  const bed = { x: printer.x, y: printer.y };
  const bambu = BAMBU[printer.preset] ?? null;
  const plateCount = Math.max(1, ...items.map((i) => i.plate + 1));
  const cols = Math.ceil(Math.sqrt(plateCount));

  let nextId = 1;
  const objects = [];
  const build = [];
  const settings = [];
  const plates = Array.from({ length: plateCount }, () => []);

  for (const item of items) {
    const base = nextId++;
    objects.push(meshXml(base, item.name, item.mesh));
    let buildId = base;
    let parts = "";
    if (item.text) {
      const textId = nextId++;
      objects.push(meshXml(textId, `${item.name}_text`, item.text.mesh));
      buildId = nextId++;
      const [dx, dy, dz] = item.text.offset;
      objects.push(
        `<object id="${buildId}" name="${esc(item.name)}" type="model"><components>` +
          `<component objectid="${base}"/>` +
          `<component objectid="${textId}" transform="1 0 0 0 1 0 0 0 1 ${num(dx)} ${num(dy)} ${num(dz)}"/>` +
          `</components></object>`,
      );
      parts =
        `<part id="${base}" subtype="normal_part"><metadata key="name" value="${esc(item.name)}"/><metadata key="extruder" value="1"/></part>` +
        `<part id="${textId}" subtype="normal_part"><metadata key="name" value="${esc(item.name)}_text"/><metadata key="extruder" value="2"/></part>`;
    }
    const col = item.plate % cols;
    const row = Math.floor(item.plate / cols);
    const ox = col * bed.x * 1.2 + printer.margin + item.x;
    const oy = -row * bed.y * 1.2 + printer.margin + item.y;
    const t = item.rot
      ? `0 1 0 -1 0 0 0 0 1 ${num(ox + item.size[1])} ${num(oy)} 0`
      : `1 0 0 0 1 0 0 0 1 ${num(ox)} ${num(oy)} 0`;
    build.push(`<item objectid="${buildId}" transform="${t}" printable="1"/>`);

    const extra =
      item.binPrint && BIN_PRINT[binPrint]
        ? Object.entries(BIN_PRINT[binPrint])
            .map(([k, v]) => `<metadata key="${k}" value="${v}"/>`)
            .join("")
        : "";
    settings.push(
      `<object id="${buildId}"><metadata key="name" value="${esc(item.name)}"/><metadata key="extruder" value="1"/>${extra}${parts}</object>`,
    );
    plates[item.plate].push(buildId);
  }

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
    `<metadata name="Application">${bambu ? "BambuStudio-01.10.00.00" : "3D Tools Gridfinity"}</metadata>` +
    `<metadata name="Title">${esc(title)}</metadata>` +
    `<resources>${objects.join("")}</resources><build>${build.join("")}</build></model>`;

  const files = {
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
  };
  if (bambu)
    files["Metadata/project_settings.config"] = strToU8(
      JSON.stringify(projectSettings(printer, bambu), null, 2),
    );
  return zipSync(files, { level: 6 });
}

function projectSettings(printer, bambu) {
  const corner = (x, y) => `${x}x${y}`;
  return {
    printer_model: bambu.model,
    printer_settings_id: `${bambu.model} 0.4 nozzle`,
    printable_area: [
      corner(0, 0),
      corner(printer.x, 0),
      corner(printer.x, printer.y),
      corner(0, printer.y),
    ],
    printable_height: String(printer.z),
    bed_exclude_area: bambu.exclude.map(([x, y]) => corner(x, y)),
    print_settings_id: bambu.process,
    filament_settings_id: ["Generic PLA", "Generic PLA"],
    filament_ids: ["GFL99", "GFL99"],
    filament_colour: ["#F2F2F2", "#1C1D1F"],
    curr_bed_type: "Textured PEI Plate",
  };
}
