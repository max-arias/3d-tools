// Tiny es/en translator. Spanish (Argentina) is the default.
import { createStore } from "../../../shell/store.js";

const KEY = "3dtools.lang";
const dict = {};

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const langStore = createStore({ lang: read() === "en" ? "en" : "es" });

export function addStrings(lang, strings) {
  dict[lang] = { ...dict[lang], ...strings };
}

export function setLang(lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {}
  document.documentElement.lang = lang === "en" ? "en" : "es-AR";
  langStore.set({ lang });
}

/** t("key", { n: 3 }) replaces {n}. Falls back to Spanish, then to the key itself. */
export function t(key, vars) {
  const { lang } = langStore.get();
  const s = dict[lang]?.[key] ?? dict.es?.[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "") : s;
}
