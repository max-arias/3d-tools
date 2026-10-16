const KEY = "3dtools.theme";

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function getTheme() {
  return read() ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
}

export function applyTheme(theme = getTheme()) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  return theme;
}

export function toggleTheme() {
  return applyTheme(getTheme() === "dark" ? "light" : "dark");
}
