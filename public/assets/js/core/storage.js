/**
 * Accès défensif au stockage local.
 * Safari privé, quota plein et contextes sans `localStorage` ne doivent jamais
 * casser une page : toutes les opérations retombent sur un stockage mémoire.
 */

const memory = new Map();

function backend() {
  try {
    const probe = "__cg_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = typeof window === "undefined" ? null : backend();

export function read(key, fallback = null) {
  try {
    const raw = store ? store.getItem(key) : memory.get(key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  const raw = JSON.stringify(value);
  try {
    if (store) store.setItem(key, raw);
    else memory.set(key, raw);
    return true;
  } catch {
    memory.set(key, raw);
    return store ? false : true;
  }
}

export function remove(key) {
  try {
    if (store) store.removeItem(key);
  } catch {
    /* ignore */
  }
  memory.delete(key);
}

export function update(key, fallback, fn) {
  const current = read(key, fallback);
  const next = fn(current);
  write(key, next);
  return next;
}

/** Clés applicatives (préfixe commun, facilité de purge). */
export const KEYS = {
  theme: "cg.theme",
  lang: "cg.lang",
  saver: "cg.saver",
  favorites: "cg.favorites",
  compare: "cg.compare",
  recent: "cg.recent",
  cookie: "cg.cookie",
  view: "cg.view",
  city: "cg.city",
  share: "cg.share",
};

export function clearAll() {
  Object.values(KEYS).forEach(remove);
}

export default { read, write, remove, update, KEYS, clearAll };
