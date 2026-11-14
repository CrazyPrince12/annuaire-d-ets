/**
 * Utilitaires de texte partagés (serveur + scripts de données).
 * Aucune dépendance : la recherche « tolérante » est faite avec une
 * normalisation maison, sans extension PostgreSQL.
 */

/** Supprime les accents et la casse pour comparer « Yaoundé » et « yaounde ». */
export function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Concatène les champs d'une entité en un texte de recherche normalisé. */
export function buildSearchText(parts) {
  return fold(parts.filter(Boolean).join(" "));
}

export function slugify(value) {
  return fold(value).replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function truncate(value, max = 160) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

/** Distance de Levenshtein bornée, pour proposer une correction de frappe. */
export function levenshtein(a, b, max = 3) {
  a = String(a);
  b = String(b);
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      best = Math.min(best, current[j]);
    }
    if (best > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * Format camerounais : +237 optionnel, 9 chiffres, mobile (6) ou fixe (2).
 * Retourne le numéro normalisé au format international, ou null.
 */
export function normalizeCameroonPhone(value) {
  const raw = String(value ?? "").replace(/[\s.\-()]/g, "");
  const match = raw.match(/^(?:\+237|00237)?(6\d{8}|2\d{8})$/);
  return match ? `+237${match[1]}` : null;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Nettoie un texte libre : longueur bornée, espaces normalisés. */
export function cleanText(value, max = 5000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function clampInt(value, min, max, fallback) {
  const num = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}
