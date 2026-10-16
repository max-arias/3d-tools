// Tiny DOM builder: h("div", { class: "x", onclick }, "text", child, ...)
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key in el && key !== "list") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}
