// Built-in designs (profile nodes are [height fraction, diameter mm]) and the user's saved designs.
import { defaultProject, merge, sanitize } from "./project.js";

const none = { count: 12, depth: 0, twist: 0, wave: "sine" };
const ribs = (count, depth, wave = "sine", twist = 0) => ({ count, depth, twist, wave });

// [id, category, English, Spanish, type, height, nodes, ribs]
const BUILT_IN = [
  [
    "smooth-bell",
    "classic",
    "Smooth Bell",
    "Campana lisa",
    "table",
    220,
    [
      [0, 190],
      [0.5, 130],
      [1, 160],
    ],
    none,
  ],
  [
    "slim-cylinder",
    "classic",
    "Slim Cylinder",
    "Cilindro fino",
    "table",
    240,
    [
      [0, 150],
      [1, 150],
    ],
    none,
  ],
  [
    "open-cone",
    "classic",
    "Open Cone",
    "Cono abierto",
    "table",
    245,
    [
      [0, 216],
      [1, 90],
    ],
    none,
  ],
  [
    "wide-drum",
    "classic",
    "Wide Drum",
    "Tambor ancho",
    "table",
    140,
    [
      [0, 236],
      [1, 206],
    ],
    none,
  ],
  [
    "fine-ribs",
    "ribbed",
    "Fine Ribs",
    "Nervaduras finas",
    "table",
    230,
    [
      [0, 150],
      [0.5, 172],
      [1, 150],
    ],
    ribs(40, 1.2),
  ],
  [
    "deep-ribs",
    "ribbed",
    "Deep Ribs",
    "Nervaduras profundas",
    "table",
    200,
    [
      [0, 110],
      [0.5, 184],
      [0.85, 166],
      [1, 120],
    ],
    ribs(12, 5),
  ],
  [
    "sharp-ribs",
    "ribbed",
    "Sharp Ribs",
    "Nervaduras filosas",
    "table",
    245,
    [
      [0, 170],
      [0.55, 140],
      [1, 174],
    ],
    ribs(24, 4, "scallop"),
  ],
  [
    "pleated-skirt",
    "ribbed",
    "Pleated Skirt",
    "Pollera plisada",
    "table",
    230,
    [
      [0, 188],
      [0.4, 192],
      [1, 100],
    ],
    ribs(30, 5, "triangle"),
  ],
  [
    "light-twist",
    "twisted",
    "Light Twist",
    "Giro suave",
    "table",
    230,
    [
      [0, 168],
      [0.5, 184],
      [1, 160],
    ],
    ribs(10, 4, "sine", 90),
  ],
  [
    "medium-twist",
    "twisted",
    "Medium Twist",
    "Giro medio",
    "table",
    240,
    [
      [0, 168],
      [0.45, 180],
      [1, 120],
    ],
    ribs(14, 5, "sine", 90),
  ],
  [
    "strong-twist",
    "twisted",
    "Strong Twist",
    "Giro fuerte",
    "table",
    240,
    [
      [0, 120],
      [0.6, 150],
      [1, 206],
    ],
    ribs(16, 5, "sine", 120),
  ],
  [
    "twisted-spire",
    "twisted",
    "Twisted Spire",
    "Aguja torcida",
    "table",
    245,
    [
      [0, 160],
      [0.4, 130],
      [1, 80],
    ],
    ribs(8, 7, "triangle", 150),
  ],
  [
    "hourglass",
    "organic",
    "Hourglass",
    "Reloj de arena",
    "table",
    245,
    [
      [0, 162],
      [0.5, 100],
      [1, 162],
    ],
    none,
  ],
  [
    "onion",
    "organic",
    "Onion",
    "Cebolla",
    "table",
    240,
    [
      [0, 130],
      [0.4, 200],
      [0.8, 160],
      [1, 80],
    ],
    none,
  ],
  [
    "wave",
    "organic",
    "Wave",
    "Onda",
    "table",
    245,
    [
      [0, 120],
      [0.25, 134],
      [0.5, 100],
      [0.75, 134],
      [1, 110],
    ],
    none,
  ],
  [
    "funnel",
    "organic",
    "Funnel",
    "Embudo",
    "table",
    200,
    [
      [0, 90],
      [0.6, 170],
      [1, 234],
    ],
    none,
  ],
  [
    "gourd",
    "organic",
    "Gourd",
    "Calabaza",
    "table",
    245,
    [
      [0, 150],
      [0.25, 182],
      [0.5, 110],
      [0.7, 100],
      [0.82, 126],
      [1, 100],
    ],
    none,
  ],
  [
    "low-dome",
    "organic",
    "Low Dome",
    "Cúpula baja",
    "table",
    110,
    [
      [0, 240],
      [0.4, 230],
      [0.8, 170],
      [1, 100],
    ],
    none,
  ],
  [
    "classic-pendant",
    "pendant",
    "Classic Pendant",
    "Colgante clásico",
    "pendant",
    200,
    [
      [0, 170],
      [0.35, 224],
      [0.75, 170],
      [1, 90],
    ],
    none,
  ],
  [
    "cone-pendant",
    "pendant",
    "Cone Pendant",
    "Colgante cónico",
    "pendant",
    220,
    [
      [0, 240],
      [1, 90],
    ],
    ribs(24, 4),
  ],
  [
    "bowl-pendant",
    "pendant",
    "Bowl Pendant",
    "Colgante cuenco",
    "pendant",
    130,
    [
      [0, 230],
      [0.4, 238],
      [1, 110],
    ],
    none,
  ],
  [
    "lantern-pendant",
    "pendant",
    "Lantern Pendant",
    "Colgante farol",
    "pendant",
    245,
    [
      [0, 120],
      [0.5, 146],
      [1, 110],
    ],
    ribs(36, 1.5),
  ],
  [
    "teardrop-pendant",
    "pendant",
    "Teardrop Pendant",
    "Colgante gota",
    "pendant",
    240,
    [
      [0, 70],
      [0.3, 170],
      [0.65, 200],
      [1, 90],
    ],
    none,
  ],
  [
    "empire",
    "table",
    "Empire",
    "Imperio",
    "table",
    200,
    [
      [0, 240],
      [1, 150],
    ],
    none,
  ],
  [
    "coolie",
    "table",
    "Coolie",
    "Coolie",
    "table",
    120,
    [
      [0, 238],
      [1, 100],
    ],
    none,
  ],
  [
    "barrel",
    "table",
    "Barrel",
    "Barril",
    "table",
    200,
    [
      [0, 190],
      [0.5, 214],
      [1, 190],
    ],
    ribs(36, 1.5),
  ],
  [
    "tall-taper",
    "table",
    "Tall Taper",
    "Cono alto",
    "table",
    245,
    [
      [0, 164],
      [1, 90],
    ],
    none,
  ],
  [
    "table-bell",
    "table",
    "Table Bell",
    "Campana de mesa",
    "table",
    190,
    [
      [0, 238],
      [0.3, 170],
      [0.8, 130],
      [1, 120],
    ],
    none,
  ],
  // Originals for this tool.
  [
    "petal-tulip",
    "originals",
    "Petal Tulip",
    "Tulipán",
    "table",
    210,
    [
      [0, 110],
      [0.45, 180],
      [0.85, 150],
      [1, 110],
    ],
    ribs(8, 6, "scallop"),
  ],
  [
    "lotus",
    "originals",
    "Lotus",
    "Loto",
    "pendant",
    170,
    [
      [0, 230],
      [0.5, 220],
      [1, 100],
    ],
    ribs(16, 7, "scallop", 40),
  ],
  [
    "braid",
    "originals",
    "Braid",
    "Trenza",
    "table",
    230,
    [
      [0, 150],
      [0.5, 160],
      [1, 130],
    ],
    ribs(5, 8, "sine", 360),
  ],
  [
    "ripple-dome",
    "originals",
    "Ripple Dome",
    "Cúpula ondulada",
    "pendant",
    150,
    [
      [0, 230],
      [0.5, 200],
      [1, 100],
    ],
    ribs(28, 2.5, "triangle"),
  ],
  [
    "pinched-vase",
    "originals",
    "Pinched Vase",
    "Jarrón estrecho",
    "table",
    250,
    [
      [0, 150],
      [0.3, 175],
      [0.62, 95],
      [1, 130],
    ],
    ribs(20, 2),
  ],
  [
    "minimal-disc",
    "originals",
    "Minimal Disc",
    "Disco mínimo",
    "pendant",
    70,
    [
      [0, 240],
      [1, 150],
    ],
    none,
  ],
  [
    "spiral-tower",
    "originals",
    "Spiral Tower",
    "Torre espiral",
    "table",
    260,
    [
      [0, 140],
      [1, 140],
    ],
    ribs(3, 14, "sine", 540),
  ],
  [
    "flare-vase",
    "originals",
    "Flare Vase",
    "Jarrón abierto",
    "table",
    220,
    [
      [0, 100],
      [0.55, 120],
      [1, 220],
    ],
    ribs(12, 3, "scallop", -60),
  ],
];

export const CATEGORIES = [
  "classic",
  "ribbed",
  "twisted",
  "organic",
  "pendant",
  "table",
  "originals",
];

export const LIBRARY = BUILT_IN.map(([id, category, en, es, type, height, nodes, r]) => ({
  id,
  category,
  name: { en, es },
  project: sanitize(
    merge(defaultProject(), {
      type,
      height,
      nodes: nodes.map(([z, d]) => ({ z, d })),
      ribs: r,
      holder: { at: type === "pendant" ? "top" : "bottom" },
    }),
  ),
}));

export const libraryItem = (id) => LIBRARY.find((d) => d.id === id) ?? null;

/** Same design apart from the seed and colour, which do not change the shape. */
const signature = (p) => JSON.stringify({ ...p, seed: 0, color: "" });
export const isModified = (project, id) => {
  const base = libraryItem(id);
  return !!base && signature(project) !== signature(base.project);
};

// --- my designs ---
const KEY = "3dtools.lamps.designs";
const newId = () => Math.random().toString(36).slice(2, 8);

export function loadDesigns() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return (Array.isArray(raw) ? raw : []).slice(0, 100).map((d) => ({
      id: String(d?.id ?? newId()).slice(0, 12),
      name: String(d?.name ?? "Design").slice(0, 40),
      project: sanitize(d?.project),
    }));
  } catch {
    return [];
  }
}

export function saveDesigns(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export const newDesign = (name, project) => ({
  id: newId(),
  name: name.slice(0, 40),
  project: sanitize(project),
});
