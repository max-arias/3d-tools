// The quick stand-in for the cover while its exact build is on the way: flat extrusions of the
// outline, with no pattern relief or slits. View coordinates match the built cover: design origin
// at the centre, x reversed, open side on the wall plane (z = 0), face toward +z.
import * as THREE from "three";
import { facePieces } from "../geom/layout.js";
import { rrectPoints, windowPolygons } from "../geom/fit2d.js";

const v2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(-x, y));

function slab(outline, holes, depth, z, material) {
  const shape = new THREE.Shape(v2(outline));
  shape.holes = holes.map((h) => new THREE.Path(v2(h)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, z);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** `outline` is the placed, scaled outline in design coordinates; `pocket` its inner pocket size. */
export function buildProxy(p, outline, pocket, material) {
  const group = new THREE.Group();
  const pocketPoly = rrectPoints(pocket.w, pocket.h, pocket.r, 6);
  const windows = facePieces(p).windows.flatMap((m) =>
    windowPolygons(m.win, p.mods.margin).map((poly) => poly.map(([x, y]) => [x + m.x, y + m.y])),
  );
  group.add(slab(outline, [pocketPoly], p.plate.d, 0, material));
  group.add(slab(outline, windows, p.overlay.face, p.plate.d, material));
  return group;
}
