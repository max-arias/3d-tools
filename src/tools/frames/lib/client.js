// Main-thread side of the geometry worker (pattern copied from gridfinity/geom/client.js).
let worker;
let nextId = 1;
const pending = new Map();

function start() {
  worker = new Worker(new URL("../geom/worker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data: { id, result, error } }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(result);
  };
}

export function run(job, project) {
  if (!worker) start();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, job, project });
  });
}
