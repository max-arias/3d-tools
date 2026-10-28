// Main-thread side of the geometry worker (copied from frames/lib/client.js; TDT-33 dedupes).
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

export function run(job, project, extra) {
  if (!worker) start();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, job, project, extra });
  });
}
