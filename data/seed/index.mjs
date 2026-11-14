/**
 * Construction du jeu de données complet.
 *
 * Ce module est la source unique utilisée par :
 *   - scripts/db-init.mjs  → écrit dans Neon (production)
 *   - api/_lib/db.js       → amorce la base de démonstration en mémoire
 *                            quand DATABASE_URL n'est pas configurée
 *
 * Rien n'est codé en dur ailleurs : modifier un fichier de /data/seed suffit.
 */
import { cities } from "./cities.mjs";
import { sectors } from "./sectors.mjs";
import { realCompanies } from "./companies.real.mjs";
import { demoCompanies } from "./companies.demo.mjs";
import { reviews } from "./reviews.mjs";
import { offers } from "./offers.mjs";
import { buildSearchText } from "../../server-api/_lib/text.js";

/** Horaires types (fuseau Africa/Douala) — "" signifie fermé. */
const HOURS = {
  bureau: {
    mon: "08:00-17:30",
    tue: "08:00-17:30",
    wed: "08:00-17:30",
    thu: "08:00-17:30",
    fri: "08:00-17:00",
    sat: "",
    sun: "",
  },
  commerce: {
    mon: "08:00-19:00",
    tue: "08:00-19:00",
    wed: "08:00-19:00",
    thu: "08:00-19:00",
    fri: "08:00-19:00",
    sat: "08:00-19:00",
    sun: "09:00-13:00",
  },
  sante: {
    mon: "00:00-23:59",
    tue: "00:00-23:59",
    wed: "00:00-23:59",
    thu: "00:00-23:59",
    fri: "00:00-23:59",
    sat: "00:00-23:59",
    sun: "00:00-23:59",
  },
  restaurant: {
    mon: "11:00-23:00",
    tue: "11:00-23:00",
    wed: "11:00-23:00",
    thu: "11:00-23:00",
    fri: "11:00-23:30",
    sat: "11:00-23:30",
    sun: "12:00-22:00",
  },
  industrie: {
    mon: "07:00-16:00",
    tue: "07:00-16:00",
    wed: "07:00-16:00",
    thu: "07:00-16:00",
    fri: "07:00-16:00",
    sat: "07:00-12:00",
    sun: "",
  },
  hotel: {
    mon: "00:00-23:59",
    tue: "00:00-23:59",
    wed: "00:00-23:59",
    thu: "00:00-23:59",
    fri: "00:00-23:59",
    sat: "00:00-23:59",
    sun: "00:00-23:59",
  },
  ecole: {
    mon: "07:30-16:30",
    tue: "07:30-16:30",
    wed: "07:30-16:30",
    thu: "07:30-16:30",
    fri: "07:30-15:30",
    sat: "08:00-12:00",
    sun: "",
  },
};

const CRITERIA = [
  "work_env",
  "management",
  "conditions",
  "pay",
  "growth",
  "internship",
  "recruitment",
];

/** Petit décalage déterministe pour éviter que les marqueurs se superposent. */
function jitter(slug, amplitude = 0.0045) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) % 100000;
  }
  const a = ((hash % 97) / 97 - 0.5) * 2 * amplitude;
  const b = ((Math.floor(hash / 97) % 89) / 89 - 0.5) * 2 * amplitude;
  return { lat: a, lng: b };
}

function buildCompanies() {
  const cityIndex = new Map(cities.map((city) => [city.slug, city]));
  const sectorIndex = new Map(sectors.map((sector) => [sector.slug, sector]));

  const normalized = [];
  for (const [source, provenance] of [
    [realCompanies, "reel"],
    [demoCompanies, "exemple"],
  ]) {
    for (const company of source) {
      const city = cityIndex.get(company.city);
      if (!city) throw new Error(`Ville inconnue pour ${company.slug} : ${company.city}`);
      const sector = sectorIndex.get(company.sector);
      if (!sector) throw new Error(`Secteur inconnu pour ${company.slug} : ${company.sector}`);

      const neighborhood = company.neighborhood
        ? city.neighborhoods.find(([slug]) => slug === company.neighborhood)
        : null;
      if (company.neighborhood && !neighborhood) {
        throw new Error(`Quartier inconnu pour ${company.slug} : ${company.neighborhood}`);
      }

      const shift = jitter(company.slug);
      const lat = neighborhood ? Number((neighborhood[2] + shift.lat).toFixed(5)) : null;
      const lng = neighborhood ? Number((neighborhood[3] + shift.lng).toFixed(5)) : null;

      const phones = company.phone
        ? {
            phone: company.phone,
            whatsapp: company.phone.replace(/^\+/, ""),
            email: "",
            website: company.website || "",
            social: {},
          }
        : {
            phone: "",
            whatsapp: "",
            email: "",
            website: company.website || "",
            social: {},
          };

      const hours = company.hours && HOURS[company.hours] ? HOURS[company.hours] : null;

      normalized.push({
        slug: company.slug,
        name: company.name,
        legalName: company.legalName || "",
        sectorSlug: company.sector,
        citySlug: company.city,
        neighborhoods: [company.neighborhood || null],
        districtName: neighborhood ? neighborhood[4] : null,
        address: company.address || "",
        landmark: company.landmark || "",
        lat,
        lng,
        descriptionShort: company.short,
        descriptionLong: company.long,
        foundedYear: company.founded ?? null,
        sizeBand: company.size || "1-10",
        employeesEstimate: company.employees ?? null,
        legalStatus: company.legalStatus || "",
        languages: company.languages || ["fr"],
        contacts: phones,
        hours,
        benefits: company.benefits || [],
        hiringDomains: company.hiringDomains || [],
        contractTypes: company.contracts || [],
        verificationLevel: provenance === "reel" ? 0 : company.verification || 0,
        isHiring: Boolean(company.hiring),
        hiringRoles: company.roles || [],
        provenance,
        sourceUrl: company.website || "",
        searchText: buildSearchText([
          company.name,
          company.legalName,
          sector.name,
          city.name,
          neighborhood ? neighborhood[1] : "",
          company.short,
          company.long,
          (company.roles || []).join(" "),
          (company.hiringDomains || []).join(" "),
          (company.benefits || []).join(" "),
          (company.contracts || []).join(" "),
        ]),
        ratingAvg: 0,
        ratingCount: 0,
      });
    }
  }
  return normalized;
}

function buildReviews(companyList) {
  const bySlug = new Map(companyList.map((company) => [company.slug, company]));
  const now = Date.now();
  const seen = new Map();
  const authors = REVIEW_AUTHORS;

  return reviews.map((review, index) => {
    const company = bySlug.get(review.c);
    if (!company) throw new Error(`Avis sur une entreprise inconnue : ${review.c}`);
    const authoredByDemoUser = review.by === "demo";
    const author = authors[index % authors.length];
    const status = review.st || "published";
    const createdAt = new Date(now - (review.d ?? 30) * 86400000);
    const ratings = {};
    CRITERIA.forEach((key, i) => {
      const value = review.crit?.[i];
      if (value) ratings[key] = value;
    });

    // Un seul avis actif par auteur, entreprise et type de relation.
    const uniqueKey = `${authoredByDemoUser ? "demo" : author.email}|${review.c}|${review.rel}`;
    if (seen.has(uniqueKey)) return null;
    seen.set(uniqueKey, true);

    return {
      id: `review-${String(index + 1).padStart(3, "0")}`,
      companySlug: review.c,
      authorEmail: authoredByDemoUser ? "demo@conglomerat.cm" : author.email,
      relationship: review.rel,
      periodLabel: review.per || "",
      roleLabel: review.role || "",
      ratingOverall: review.n,
      ratings,
      title: review.t,
      pros: review.pro,
      cons: review.con,
      advice: review.adv || "",
      status,
      verifiedExperience: Boolean(review.v),
      helpfulCount: review.h ?? 0,
      replyBody: review.reply?.body || "",
      replyAt: review.reply ? new Date(now - review.reply.daysAgo * 86400000) : null,
      publishedAt: status === "published" ? createdAt : null,
      createdAt,
    };
  }).filter(Boolean);
}

function withRatings(companyList, reviewList) {
  for (const company of companyList) {
    const published = reviewList.filter(
      (review) => review.companySlug === company.slug && review.status === "published"
    );
    if (!published.length) continue;
    const avg = published.reduce((sum, review) => sum + review.ratingOverall, 0) / published.length;
    company.ratingAvg = Number(avg.toFixed(1));
    company.ratingCount = published.length;
  }
  return companyList;
}

function buildOffers(companyList) {
  const bySlug = new Map(companyList.map((company) => [company.slug, company]));
  const now = Date.now();
  return offers.map((offer, index) => {
    const company = bySlug.get(offer.c);
    if (!company) throw new Error(`Offre sur une entreprise inconnue : ${offer.c}`);
    const publishedAt = new Date(now - offer.d * 86400000);
    const deadline = new Date(now + offer.dl * 86400000);
    const status = offer.st || "published";
    const salaryVisible = Boolean(offer.salary);
    const city = company.citySlug;
    return {
      slug: `${offer.c}-${slugifyTitle(offer.title)}-${index + 1}`,
      companySlug: offer.c,
      title: offer.title,
      contractType: offer.type,
      description: offer.desc,
      missions: offer.missions,
      profile: offer.profile,
      educationLevel: offer.education,
      experienceBand: offer.experience,
      skills: offer.skills,
      benefits: offer.benefits,
      citySlug: city,
      neighborhoodSlug: company.neighborhoods?.[0] || null,
      salaryMin: offer.salary ? offer.salary[0] : null,
      salaryMax: offer.salary ? offer.salary[1] : null,
      salaryVisible,
      applyMode: "internal",
      applyTarget: "",
      status,
      publishedAt,
      deadlineAt: deadline,
      searchText: buildSearchText([
        offer.title,
        offer.desc,
        offer.missions,
        offer.profile,
        offer.skills.join(" "),
        company.name,
        offer.type,
      ]),
    };
  });
}

function slugifyTitle(title) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/** Auteurs d'avis : comptes techniques, jamais affichés, jamais connectables. */
export const REVIEW_AUTHORS = Array.from({ length: 18 }, (_, index) => ({
  email: `auteur${String(index + 1).padStart(2, "0")}@seed.conglomerat.invalid`,
  firstName: "Auteur",
  lastName: `anonyme ${index + 1}`,
  role: "user",
  password: `seed-${Math.random().toString(36).slice(2)}-${index}`,
  emailVerified: true,
}));

/** Comptes de démonstration annoncés dans le README. */
export const DEMO_USERS = [
  {
    email: "demo@conglomerat.cm",
    password: "Demo!2026conglomerat",
    firstName: "Aïcha",
    lastName: "N.",
    role: "user",
    pseudonym: "Aïcha N.",
    citySlug: "yaounde",
    educationLevel: "Master 2",
    field: "Gestion des entreprises",
    emailVerified: true,
    points: 30,
  },
  {
    email: "entrepriseconglomerat@conglomerat.cm",
    password: "Entreprise!2026",
    firstName: "Serge",
    lastName: "M.",
    role: "company",
    pseudonym: "Serge M.",
    citySlug: "yaounde",
    emailVerified: true,
    points: 0,
    ownsCompany: "cabinet-ekombo-conseil",
  },
  {
    email: "moderateur@conglomerat.cm",
    password: "Moderateur!2026",
    firstName: "Modérateur",
    lastName: "démo",
    role: "moderator",
    pseudonym: "Modération",
    citySlug: "douala",
    emailVerified: true,
    points: 0,
  },
];

export const SETTINGS = {
  site_name: "CONGLOMERAT",
  tagline: "L'annuaire qui montre les entreprises du Cameroun telles qu'elles sont.",
  demo_banner: true,
  min_reviews_for_rating: 3,
  min_reviews_for_ranking: 5,
  moderation_target_hours: 48,
  default_offer_days: 30,
  search_ai_enabled: false,
  map_style_url: "https://tiles.openfreemap.org/styles/liberty",
  contact_email: "contact@conglomerat.cm",
  contact_whatsapp: "",
  contact_phone: "",
  payment_mode: "demo",
  active_cities: ["yaounde", "douala", "bafoussam"],
  features: {
    company_space: true,
    internal_applications: true,
    premium: true,
    comparator: true,
    reviews: true,
    anonymous_contributions: true,
  },
};

export const PLANS = [
  {
    slug: "premium-mensuel",
    name: "Premium — mensuel",
    period: "monthly",
    priceXaf: 2500,
    features: [
      "Alertes multi-villes et multi-secteurs",
      "Suivi avancé des candidatures",
      "Favoris illimités",
      "Statistiques personnelles",
    ],
  },
  {
    slug: "premium-trimestriel",
    name: "Premium — trimestriel",
    period: "quarterly",
    priceXaf: 6500,
    features: [
      "Tout le mensuel",
      "Deux mois offerts par rapport au mensuel",
      "Accès aux tendances salariales agrégées",
    ],
  },
  {
    slug: "premium-annuel",
    name: "Premium — annuel",
    period: "yearly",
    priceXaf: 22000,
    features: [
      "Tout le trimestriel",
      "Accès prioritaire aux ateliers de rédaction de CV",
      "Support par e-mail sous 48 h",
    ],
  },
];

/**
 * Jeu de données prêt à insérer.
 * Les identifiants (UUID) sont générés par PostgreSQL au moment de l'insertion.
 */
export function buildDataset() {
  const companies = buildCompanies();
  const reviewList = buildReviews(companies);
  withRatings(companies, reviewList);
  const offerList = buildOffers(companies);

  return {
    cities: cities.map((city, index) => ({
      ...city,
      sortOrder: index + 1,
    })),
    sectors,
    companies,
    reviews: reviewList,
    offers: offerList,
    users: [...DEMO_USERS, ...REVIEW_AUTHORS],
    plans: PLANS,
    settings: SETTINGS,
  };
}

export default buildDataset;
