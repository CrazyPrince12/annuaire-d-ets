/**
 * Interprétation d'une recherche en langage courant.
 *
 * « stage comptable bonamoussadi » → affiche des pastilles modifiables
 *   Stage · Comptabilité · Bonamoussadi
 *
 * L'analyseur reste volontairement simple et transparent : il ne fait que
 * remplir des filtres existants, il n'invente aucun résultat.
 */
import { fold } from "./text.js";

const CONTRACT_HINTS = [
  { words: ["stage", "stages", "stagiaire", "internship"], label: "Stage", filters: { internships: true } },
  { words: ["emploi", "emplois", "cdi", "recrutement", "recrute", "travail"], label: "Emploi", filters: { jobs: true } },
  { words: ["interim", "intérim", "temporaire"], label: "Intérim", filters: { contracts: ["interim"] } },
  { words: ["freelance", "independant"], label: "Freelance", filters: { contracts: ["freelance"] } },
];

const SECTOR_SYNONYMS = {
  compta: "comptabilite",
  comptable: "comptabilite",
  comptables: "comptabilite",
  info: "technologie",
  informatique: "technologie",
  tech: "technologie",
  numerique: "technologie",
  banque: "banque-finance",
  finance: "banque-finance",
  assurance: "banque-finance",
  assurances: "banque-finance",
  btp: "btp-immobilier",
  immobilier: "btp-immobilier",
  construction: "btp-immobilier",
  sante: "sante",
  clinique: "sante",
  hopital: "sante",
  ong: "ong-associations",
  association: "ong-associations",
  restauration: "hotellerie-tourisme",
  hotel: "hotellerie-tourisme",
  tourisme: "hotellerie-tourisme",
  ecole: "education",
  universite: "education",
  formation: "education",
  transport: "transport-logistique",
  logistique: "transport-logistique",
  transit: "transport-logistique",
  agro: "agriculture",
  agriculture: "agriculture",
  agronomie: "agriculture",
  commerce: "commerce",
  distribution: "commerce",
  industrie: "industrie",
  usine: "industrie",
  communication: "communication",
  marketing: "communication",
  media: "communication",
  services: "services",
  securite: "services",
};

/**
 * @param {string} q
 * @param {{cities: any[], sectors: any[]}} referentials
 */
export function interpretQuery(q, referentials) {
  const text = fold(q);
  if (!text) return { chips: [], filters: {}, residual: "" };

  const chips = [];
  const filters = {};
  let consumed = text;

  const consume = (phrase) => {
    const folded = fold(phrase);
    if (!folded) return false;
    if (consumed.includes(folded)) {
      consumed = consumed.replace(folded, " ");
      return true;
    }
    return false;
  };

  // Villes
  for (const city of referentials.cities || []) {
    if (consume(city.name)) {
      filters.cities = [city.slug];
      chips.push({ key: "ville", value: city.slug, label: city.name });
    }
    for (const neighborhood of city.neighborhoods || []) {
      if (neighborhood.slug && consume(neighborhood.name)) {
        filters.neighborhoods = [neighborhood.slug];
        chips.push({ key: "quartier", value: neighborhood.slug, label: neighborhood.name });
      }
    }
  }

  // Secteurs (nom exact puis synonymes)
  for (const sector of referentials.sectors || []) {
    if (consume(sector.name)) {
      filters.sectors = [...(filters.sectors || []), sector.slug];
      chips.push({ key: "secteur", value: sector.slug, label: sector.name });
      continue;
    }
    const slugWords = sector.slug.split("-");
    for (const word of slugWords) {
      if (word.length > 4 && consume(word)) {
        filters.sectors = [...(filters.sectors || []), sector.slug];
        chips.push({ key: "secteur", value: sector.slug, label: sector.name });
        break;
      }
    }
  }
  const words = consumed.split(/\s+/).filter(Boolean);
  for (const [word, sectorSlug] of Object.entries(SECTOR_SYNONYMS)) {
    if (words.includes(word) && !(filters.sectors || []).includes(sectorSlug)) {
      consume(word);
      filters.sectors = [...(filters.sectors || []), sectorSlug];
      chips.push({ key: "secteur", value: sectorSlug, label: `Secteur ${sectorSlug.replace(/-/g, " ")}` });
    }
  }

  // Types de contrat
  for (const hint of CONTRACT_HINTS) {
    if (hint.words.some((word) => words.includes(word))) {
      hint.words.forEach((word) => consume(word));
      Object.assign(filters, hint.filters);
      chips.push({ key: "contrat", value: hint.label, label: hint.label });
    }
  }

  const residual = consumed.replace(/\s+/g, " ").trim();
  return { chips, filters, residual };
}
