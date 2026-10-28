// Copied from src/tools/letters/lib/i18n.js (TDT-33 dedupes).
// Tiny en/es translator, same storage key as Tapas so the choice follows you between tools.
// English is the default here.
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

export const langStore = createStore({ lang: read() === "es" ? "es" : "en" });

export function addStrings(lang, strings) {
  dict[lang] = { ...dict[lang], ...strings };
}

export function setLang(lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {}
  document.documentElement.lang = lang === "es" ? "es-AR" : "en";
  langStore.set({ lang });
}

/** t("key", { n: 3 }) replaces {n}. Falls back to English, then to the key itself. */
export function t(key, vars) {
  const { lang } = langStore.get();
  const s = dict[lang]?.[key] ?? dict.en?.[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "") : s;
}
