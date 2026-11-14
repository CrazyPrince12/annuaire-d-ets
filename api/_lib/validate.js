/**
 * Validation et nettoyage des entrées. Aucune bibliothèque : des fonctions
 * explicites, faciles à lire, qui renvoient des erreurs en français.
 */
import { HttpError } from "./http.js";
import { cleanText, normalizeCameroonPhone, slugify } from "./text.js";

/**
 * Types de contrat acceptés — alignés sur les données amorcées (`interim`
 * remplace « alternance »/« temporaire », qui n'existent pas au Cameroun).
 */
export const CONTRACT_TYPES = [
  "cdi",
  "cdd",
  "stage_academique",
  "stage_professionnel",
  "stage_pre_emploi",
  "freelance",
  "interim",
];

export const CONTRACT_LABELS = {
  stage_academique: "Stage académique",
  stage_professionnel: "Stage professionnel",
  stage_pre_emploi: "Stage pré-emploi",
  cdd: "CDD",
  cdi: "CDI",
  freelance: "Freelance",
  interim: "Intérim",
};

export const RELATIONSHIPS = [
  "current_employee",
  "former_employee",
  "current_intern",
  "former_intern",
  "candidate",
  "customer_partner",
];

export const RELATIONSHIP_LABELS = {
  current_employee: "Employé actuel",
  former_employee: "Ancien employé",
  current_intern: "Stagiaire actuel",
  former_intern: "Ancien stagiaire",
  candidate: "Candidat à un recrutement",
  customer_partner: "Client ou partenaire",
};

export const CRITERIA = [
  "work_env",
  "management",
  "conditions",
  "pay",
  "growth",
  "internship",
  "recruitment",
];

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(value || "").trim());
}

export function requireEmail(value, label = "L'adresse e-mail") {
  const email = String(value || "").trim().toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, `${label} n'est pas valide.`);
  return email;
}

export function requireString(value, { min = 1, max = 1000, label = "Ce champ" } = {}) {
  const text = cleanText(value, max);
  if (text.length < min) {
    throw new HttpError(400, `${label} doit contenir au moins ${min} caractère${min > 1 ? "s" : ""}.`);
  }
  return text;
}

export function optionalString(value, { max = 1000 } = {}) {
  return cleanText(value, max);
}

export function requireOneOf(value, allowed, label = "La valeur") {
  if (!allowed.includes(value)) throw new HttpError(400, `${label} n'est pas acceptée.`);
  return value;
}

export function requirePassword(value) {
  const password = String(value || "");
  if (password.length < 10) {
    throw new HttpError(400, "Le mot de passe doit contenir au moins 10 caractères.");
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new HttpError(400, "Le mot de passe doit mélanger lettres et chiffres.");
  }
  return password;
}

export function parseRating(value, label = "La note") {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new HttpError(400, `${label} doit être comprise entre 1 et 5.`);
  }
  return Math.round(rating * 2) / 2;
}

export function optionalPhone(value) {
  if (!value) return "";
  const normalized = normalizeCameroonPhone(value);
  if (!normalized) {
    throw new HttpError(400, "Le numéro doit être un numéro camerounais valide (+237 6xx xxx xxx).");
  }
  return normalized;
}

export function normalizeSlug(value) {
  return slugify(value).slice(0, 80);
}

/* -------------------------------------------------------------------------- */
/*  Détection de contenu à risque dans les avis (drapeaux, jamais un refus     */
/*  automatique)                                                              */
/* -------------------------------------------------------------------------- */
const INSULTS = [
  "idiot",
  "imbecile",
  "connard",
  "salopard",
  "escroc",
  "voleur",
  "incompetent",
  "salaud",
  "batard",
];

const ACCUSATION_TERMS = ["vol", "detournement", "harcelement", "corruption", "fraude", "abus sexuel"];

export function moderationFlags({ title = "", pros = "", cons = "", advice = "", relationship }) {
  const flags = [];
  const text = `${title} ${pros} ${cons} ${advice}`;
  const folded = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/(\+237|00237|\b6\d{8}\b)/.test(text.replace(/\s/g, ""))) flags.push("telephone_dans_le_texte");
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) flags.push("email_dans_le_texte");
  if (INSULTS.some((word) => folded.includes(word))) flags.push("insulte");
  if (ACCUSATION_TERMS.some((word) => folded.includes(word))) flags.push("accusation_a_verifier");
  if (pros.length + cons.length < 80) flags.push("texte_tres_court");
  if (!relationship) flags.push("relation_manquante");
  return flags;
}

/** Nettoie un objet libre (payload de contribution) : chaînes bornées. */
export function sanitizePayload(payload, depth = 0) {
  if (depth > 3) return null;
  if (payload === null || payload === undefined) return null;
  if (typeof payload === "string") return cleanText(payload, 2000);
  if (typeof payload === "number" || typeof payload === "boolean") return payload;
  if (Array.isArray(payload)) return payload.slice(0, 20).map((item) => sanitizePayload(item, depth + 1));
  if (typeof payload === "object") {
    const output = {};
    for (const [key, value] of Object.entries(payload).slice(0, 40)) {
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(key)) continue;
      output[key] = sanitizePayload(value, depth + 1);
    }
    return output;
  }
  return null;
}
