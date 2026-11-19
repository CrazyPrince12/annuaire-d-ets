/**
 * Couche d'accès aux données (SQL direct, paramétré).
 *
 * Toutes les fonctions renvoient des objets prêts pour le front :
 *  - cartes d'entreprise normalisées (secteur, ville, quartier, note…) ;
 *  - cartes d'offre ;
 *  - agrégats d'avis.
 *
 * Aucune requête n'est construite par concaténation de valeurs : les valeurs
 * passent toujours par des paramètres $n.
 */
import { read, readOne, getSettings, readBatch } from "./db.js";
import { fold, levenshtein } from "./text.js";

/* -------------------------------------------------------------------------- */
/*  Fragments SQL réutilisables                                               */
/* -------------------------------------------------------------------------- */
const COMPANY_COLUMNS = `
  c.id, c.slug, c.name, c.description_short, c.verification_level, c.verified_at,
  c.rating_avg, c.rating_count, c.is_hiring, c.hiring_roles, c.contract_types,
  c.benefits, c.lat, c.lng, c.hours, c.contacts, c.provenance, c.size_band,
  c.languages, c.created_at, c.publication_status, c.founded_year,
  ci.slug AS city_slug, ci.name AS city_name,
  n.slug AS neighborhood_slug, n.name AS neighborhood_name,
  s.slug AS sector_slug, s.name AS sector_name, s.icon AS sector_icon, s.color AS sector_color,
  (SELECT COUNT(*)::int FROM job_offers o
     WHERE o.company_id = c.id AND o.status = 'published'
       AND (o.deadline_at IS NULL OR o.deadline_at > NOW())) AS offers_count,
  (SELECT COUNT(*)::int FROM job_offers o
     WHERE o.company_id = c.id AND o.status = 'published' AND o.contract_type LIKE 'stage%'
       AND (o.deadline_at IS NULL OR o.deadline_at > NOW())) AS internships_count,
  (SELECT COUNT(*)::int FROM reviews r
     WHERE r.company_id = c.id AND r.status = 'published') AS reviews_published
`;

const COMPANY_JOINS = `
  LEFT JOIN cities ci ON ci.id = c.city_id
  LEFT JOIN neighborhoods n ON n.id = c.neighborhood_id
  LEFT JOIN company_sectors cs ON cs.company_id = c.id AND cs.is_primary = TRUE
  LEFT JOIN sectors s ON s.id = cs.sector_id
`;

/** SELECT d'une carte d'entreprise, avec colonnes supplémentaires optionnelles. */
function companySelect(extraColumns = "") {
  return `SELECT ${COMPANY_COLUMNS}${extraColumns ? ", " + extraColumns : ""}
          FROM companies c ${COMPANY_JOINS}`;
}

const OFFER_COLUMNS = `
  o.id, o.slug, o.title, o.contract_type, o.salary_min, o.salary_max, o.salary_visible,
  o.education_level, o.experience_band, o.apply_mode, o.published_at, o.deadline_at,
  o.status, o.skills,
  c.slug AS company_slug, c.name AS company_name, c.verification_level,
  c.contacts AS company_contacts, c.provenance,
  ci.slug AS city_slug, ci.name AS city_name,
  n.slug AS neighborhood_slug, n.name AS neighborhood_name,
  s.slug AS sector_slug, s.name AS sector_name, s.color AS sector_color, s.icon AS sector_icon
`;

const OFFER_JOINS = `
  FROM job_offers o
  JOIN companies c ON c.id = o.company_id
  LEFT JOIN cities ci ON ci.id = COALESCE(o.city_id, c.city_id)
  LEFT JOIN neighborhoods n ON n.id = COALESCE(o.neighborhood_id, c.neighborhood_id)
  LEFT JOIN company_sectors cs ON cs.company_id = c.id AND cs.is_primary = TRUE
  LEFT JOIN sectors s ON s.id = cs.sector_id
`;

function offerSelect(extraColumns = "") {
  return `SELECT ${OFFER_COLUMNS}${extraColumns ? ", " + extraColumns : ""}
          ${OFFER_JOINS}`;
}

/* -------------------------------------------------------------------------- */
/*  Normalisation                                                             */
/* -------------------------------------------------------------------------- */
export function toCompanyCard(row, settings = {}) {
  if (!row) return null;
  const minReviews = settings.min_reviews_for_rating ?? 3;
  const hasEnoughReviews = row.rating_count >= minReviews;
  const contacts = row.contacts || {};
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    short: row.description_short,
    sector: row.sector_slug
      ? { slug: row.sector_slug, name: row.sector_name, icon: row.sector_icon, color: row.sector_color }
      : null,
    city: row.city_slug ? { slug: row.city_slug, name: row.city_name } : null,
    neighborhood: row.neighborhood_slug
      ? { slug: row.neighborhood_slug, name: row.neighborhood_name }
      : null,
    rating: hasEnoughReviews ? Number(row.rating_avg) : null,
    ratingCount: row.rating_count,
    reviewsPublished: row.reviews_published ?? row.rating_count,
    verified: row.verification_level,
    provenance: row.provenance,
    isHiring: Boolean(row.is_hiring),
    hiringRoles: row.hiring_roles || [],
    contractTypes: row.contract_types || [],
    benefits: row.benefits || [],
    sizeBand: row.size_band,
    languages: row.languages || [],
    foundedYear: row.founded_year ?? null,
    lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
    lng: row.lng === null || row.lng === undefined ? null : Number(row.lng),
    hours: row.hours || null,
    phone: contacts.phone || "",
    whatsapp: contacts.whatsapp || "",
    hasWebsite: Boolean(contacts.website),
    offersCount: row.offers_count ?? 0,
    internshipsCount: row.internships_count ?? 0,
    isNew: row.created_at
      ? Date.now() - new Date(row.created_at).getTime() < 14 * 86400000
      : false,
    publicationStatus: row.publication_status,
  };
}

export function toOfferCard(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    contractType: row.contract_type,
    isInternship: String(row.contract_type).startsWith("stage"),
    salary:
      row.salary_visible && row.salary_min
        ? { min: Number(row.salary_min), max: row.salary_max ? Number(row.salary_max) : null }
        : null,
    educationLevel: row.education_level || "",
    experienceBand: row.experience_band || "",
    skills: row.skills || [],
    applyMode: row.apply_mode,
    publishedAt: row.published_at,
    deadlineAt: row.deadline_at,
    expired: row.deadline_at ? new Date(row.deadline_at).getTime() < Date.now() : false,
    status: row.status,
    company: {
      slug: row.company_slug,
      name: row.company_name,
      verified: row.verification_level,
      provenance: row.provenance,
      phone: row.company_contacts?.phone || "",
    },
    city: row.city_slug ? { slug: row.city_slug, name: row.city_name } : null,
    neighborhood: row.neighborhood_slug
      ? { slug: row.neighborhood_slug, name: row.neighborhood_name }
      : null,
    sector: row.sector_slug
      ? { slug: row.sector_slug, name: row.sector_name, color: row.sector_color, icon: row.sector_icon }
      : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Filtres entreprises                                                       */
/* -------------------------------------------------------------------------- */
function buildCompanyFilters(filters = {}, { includeNonPublished = false } = {}) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace("$?", `$${params.length}`));
  };

  if (!includeNonPublished) {
    where.push("c.publication_status = 'published' AND c.deleted_at IS NULL");
  }

  if (filters.q) {
    const terms = fold(filters.q).split(" ").filter((word) => word.length > 1);
    if (terms.length) {
      const clauses = terms.map((term) => {
        params.push(`%${term}%`);
        return `c.search_text LIKE $${params.length}`;
      });
      where.push(
        terms.length === 1 || filters.qMode !== "any" ? clauses.join(" AND ") : `(${clauses.join(" OR ")})`
      );
    }
  }
  if (filters.cities?.length) add("ci.slug = ANY($?)", filters.cities);
  if (filters.neighborhoods?.length) add("n.slug = ANY($?)", filters.neighborhoods);
  if (filters.sectors?.length) add("s.slug = ANY($?)", filters.sectors);
  if (filters.sizes?.length) add("c.size_band = ANY($?)", filters.sizes);
  if (filters.verification === "verified") where.push("c.verification_level >= 1");
  if (filters.verification === "partner") where.push("c.verification_level = 2");
  if (filters.hiring) where.push("c.is_hiring = TRUE");
  if (filters.internships) {
    where.push(`EXISTS (SELECT 1 FROM job_offers o
      WHERE o.company_id = c.id AND o.status = 'published' AND o.contract_type LIKE 'stage%'
        AND (o.deadline_at IS NULL OR o.deadline_at > NOW()))`);
  }
  if (filters.contracts?.length) add("c.contract_types ?| $?::text[]", filters.contracts);
  if (filters.language) add("c.languages @> $?::jsonb", JSON.stringify([filters.language]));
  if (filters.minRating > 0) add("c.rating_avg >= $?", filters.minRating);
  if (filters.addedDays > 0) add("c.created_at > NOW() - ($? || ' days')::interval", String(filters.addedDays));

  return { where: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

function companyOrderBy(filters, params) {
  const sort = filters.sort;
  if (sort === "proches" && Number.isFinite(filters.lat) && Number.isFinite(filters.lng)) {
    params.push(filters.lat, filters.lng);
    const latParam = `$${params.length - 1}`;
    const lngParam = `$${params.length}`;
    return `ORDER BY ((c.lat - ${latParam}) * (c.lat - ${latParam}) + (c.lng - ${lngParam}) * (c.lng - ${lngParam}) * 0.97) ASC NULLS LAST`;
  }
  switch (sort) {
    case "notes":
      return "ORDER BY c.rating_count > 0 DESC, c.rating_avg DESC, c.rating_count DESC";
    case "recentes":
      return "ORDER BY c.created_at DESC";
    case "populaires":
      return "ORDER BY c.view_count DESC, c.rating_count DESC";
    case "recrutent":
      return "ORDER BY c.is_hiring DESC, c.created_at DESC";
    default:
      // Pertinence : bonus vérification + fraîcheur + complétude (cahier §11.7)
      return `ORDER BY (
        (CASE WHEN c.verification_level = 2 THEN 0.15 WHEN c.verification_level = 1 THEN 0.10 ELSE 0 END)
        + (CASE WHEN c.updated_at > NOW() - INTERVAL '90 days' THEN 0.05 ELSE 0 END)
        + (CASE WHEN c.description_long <> '' THEN 0.04 ELSE 0 END)
        + (CASE WHEN c.lat IS NOT NULL THEN 0.02 ELSE 0 END)
        + (CASE WHEN c.is_hiring THEN 0.03 ELSE 0 END)
      ) DESC, c.rating_avg DESC, c.view_count DESC`;
  }
}

/* -------------------------------------------------------------------------- */
/*  Correction orthographique et recherche tolérante                          */
/* -------------------------------------------------------------------------- */
let vocabularyCache = { at: 0, words: null };

async function vocabulary() {
  if (vocabularyCache.words && Date.now() - vocabularyCache.at < 300000) return vocabularyCache.words;
  const rows = await read(
    `SELECT name AS value FROM companies WHERE publication_status = 'published'
     UNION SELECT name FROM sectors
     UNION SELECT name FROM cities
     UNION SELECT name FROM neighborhoods
     UNION SELECT title FROM job_offers WHERE status = 'published'`
  );
  const words = new Set();
  for (const row of rows) {
    for (const word of fold(row.value).split(/[\s\-/]+/)) {
      if (word.length >= 4) words.add(word);
    }
  }
  vocabularyCache = { at: Date.now(), words: [...words] };
  return vocabularyCache.words;
}

/** Remplace chaque mot mal orthographié par le mot le plus proche du lexique. */
export async function correctQuery(input) {
  const words = await vocabulary();
  const tokens = fold(input).split(" ").filter(Boolean);
  let changed = false;
  const corrected = tokens.map((token) => {
    if (token.length < 4 || words.includes(token)) return token;
    let best = null;
    let bestDistance = (token.length <= 5 ? 1 : 2) + 1;
    for (const word of words) {
      if (Math.abs(word.length - token.length) > bestDistance) continue;
      const distance = levenshtein(token, word, bestDistance);
      if (distance < bestDistance || (distance === bestDistance && word.length > (best?.length || 0))) {
        best = word;
        bestDistance = distance;
      }
    }
    if (best) {
      changed = true;
      return best;
    }
    return token;
  });
  return changed ? corrected.join(" ") : null;
}

/**
 * Recherche progressive :
 *   1. tous les mots recherchés ;
 *   2. si rien : correction orthographique ;
 *   3. sinon : au moins un mot, en signalant l'élargissement.
 */
export async function searchCompanies(filters = {}, options = {}) {
  let result = await listCompanies(filters, options);
  if (result.total > 0 || !filters.q) return { ...result, relaxed: false, correctedQuery: null };

  const corrected = await correctQuery(filters.q);
  if (corrected) {
    result = await listCompanies({ ...filters, q: corrected }, options);
    if (result.total > 0) return { ...result, relaxed: true, correctedQuery: corrected };
  }

  result = await listCompanies({ ...filters, qMode: "any" }, options);
  return { ...result, relaxed: result.total > 0, correctedQuery: null };
}

export async function searchOffers(filters = {}, options = {}) {
  let result = await listOffers(filters, options);
  if (result.total > 0 || !filters.q) return { ...result, relaxed: false, correctedQuery: null };
  const corrected = await correctQuery(filters.q);
  if (corrected) {
    result = await listOffers({ ...filters, q: corrected }, options);
    if (result.total > 0) return { ...result, relaxed: true, correctedQuery: corrected };
  }
  result = await listOffers({ ...filters, qMode: "any" }, options);
  return { ...result, relaxed: result.total > 0, correctedQuery: null };
}

/* -------------------------------------------------------------------------- */
/*  Entreprises                                                               */
/* -------------------------------------------------------------------------- */
export async function listCompanies(filters = {}, { limit = 24, offset = 0 } = {}) {
  const settings = await getSettings();
  const { where, params } = buildCompanyFilters(filters);
  const orderParams = [...params];
  const orderBy = companyOrderBy(filters, orderParams);
  const pageParams = [...orderParams, limit, offset];
  const limitIdx = pageParams.length - 1;
  const offsetIdx = pageParams.length;

  const [rows, countRows] = await readBatch([
    [`${companySelect()} ${where} ${orderBy} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      pageParams],
    [`SELECT COUNT(*)::int AS total FROM companies c
     LEFT JOIN cities ci ON ci.id = c.city_id
     LEFT JOIN neighborhoods n ON n.id = c.neighborhood_id
     LEFT JOIN company_sectors cs ON cs.company_id = c.id AND cs.is_primary = TRUE
     LEFT JOIN sectors s ON s.id = cs.sector_id
     ${where}`,
      params],
  ]);
  const total = countRows[0]?.total ?? 0;
  return {
    items: rows.map((row) => toCompanyCard(row, settings)),
    total,
    page: Math.floor(offset / limit) + 1,
    perPage: limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getCompanyBySlug(slug) {
  const settings = await getSettings();
  const row = await readOne(
    `${companySelect(`c.legal_name, c.description_long, c.employees_estimate, c.legal_status,
       c.address, c.landmark, c.hiring_domains, c.verification_expires_at, c.source_url,
       c.reputation_index, c.view_count, c.last_checked_at, c.city_id, c.neighborhood_id,
       c.district_id, d.name AS district_name`)}
     LEFT JOIN districts d ON d.id = c.district_id
     WHERE c.slug = $1 AND c.deleted_at IS NULL LIMIT 1`,
    [slug]
  );
  if (!row) return null;
  const card = toCompanyCard(row, settings);
  return {
    ...card,
    legalName: row.legal_name,
    long: row.description_long,
    employeesEstimate: row.employees_estimate,
    legalStatus: row.legal_status,
    address: row.address,
    landmark: row.landmark,
    hiringDomains: row.hiring_domains || [],
    verificationExpiresAt: row.verification_expires_at,
    sourceUrl: row.source_url,
    reputationIndex: row.reputation_index,
    viewCount: row.view_count,
    lastCheckedAt: row.last_checked_at,
    district: row.district_name,
    contacts: row.contacts || {},
    cityId: row.city_id,
    neighborhoodId: row.neighborhood_id,
  };
}

export async function companySectorList(companySlug) {
  const rows = await read(
    `SELECT s.slug, s.name, s.color, s.icon FROM sectors s
     JOIN company_sectors cs ON cs.sector_id = s.id
     JOIN companies c ON c.id = cs.company_id
     WHERE c.slug = $1 ORDER BY cs.is_primary DESC, s.name`,
    [companySlug]
  );
  return rows;
}

/* -------------------------------------------------------------------------- */
/*  Avis                                                                      */
/* -------------------------------------------------------------------------- */
const RELATIONSHIP_LABELS = {
  current_employee: "Employé actuel",
  former_employee: "Ancien employé",
  current_intern: "Stagiaire actuel",
  former_intern: "Ancien stagiaire",
  candidate: "Candidat",
  customer_partner: "Client ou partenaire",
};

export function relationshipLabel(key) {
  return RELATIONSHIP_LABELS[key] || key;
}

export async function companyReviewSummary(companyId) {
  const rows = await read(
    `SELECT COUNT(*)::int AS total,
            AVG(rating_overall)::float AS average,
            AVG(NULLIF(ratings->>'work_env','')::numeric)::float AS work_env,
            AVG(NULLIF(ratings->>'management','')::numeric)::float AS management,
            AVG(NULLIF(ratings->>'conditions','')::float) AS conditions,
            AVG(NULLIF(ratings->>'pay','')::numeric)::float AS pay,
            AVG(NULLIF(ratings->>'growth','')::numeric)::float AS growth,
            AVG(NULLIF(ratings->>'internship','')::numeric)::float AS internship,
            AVG(NULLIF(ratings->>'recruitment','')::numeric)::float AS recruitment,
            SUM(CASE WHEN rating_overall >= 4.5 THEN 1 ELSE 0 END)::int AS five,
            SUM(CASE WHEN rating_overall >= 3.5 AND rating_overall < 4.5 THEN 1 ELSE 0 END)::int AS four,
            SUM(CASE WHEN rating_overall >= 2.5 AND rating_overall < 3.5 THEN 1 ELSE 0 END)::int AS three,
            SUM(CASE WHEN rating_overall >= 1.5 AND rating_overall < 2.5 THEN 1 ELSE 0 END)::int AS two,
            SUM(CASE WHEN rating_overall < 1.5 THEN 1 ELSE 0 END)::int AS one
     FROM reviews WHERE company_id = $1 AND status = 'published'`,
    [companyId]
  );
  const row = rows[0] || {};
  const total = row.total || 0;
  const criteria = {};
  for (const key of ["work_env", "management", "conditions", "pay", "growth", "internship", "recruitment"]) {
    const value = row[key];
    criteria[key] = value === null || value === undefined ? null : Number(Number(value).toFixed(1));
  }
  return {
    total,
    average: row.average ? Number(Number(row.average).toFixed(1)) : null,
    criteria,
    distribution: {
      5: row.five || 0,
      4: row.four || 0,
      3: row.three || 0,
      2: row.two || 0,
      1: row.one || 0,
    },
  };
}

export async function companyReviews(companyId, { relationship = "", sort = "recent", limit = 20, offset = 0 } = {}) {
  const where = ["r.company_id = $1", "r.status = 'published'"];
  const params = [companyId];
  if (relationship) {
    params.push(relationship);
    where.push(`r.relationship = $${params.length}`);
  }
  const order =
    sort === "helpful"
      ? "ORDER BY r.helpful_count DESC, r.published_at DESC"
      : sort === "best"
        ? "ORDER BY r.rating_overall DESC, r.published_at DESC"
        : sort === "worst"
          ? "ORDER BY r.rating_overall ASC, r.published_at DESC"
          : "ORDER BY r.published_at DESC";

  params.push(limit, offset);
  const rows = await read(
    `SELECT r.id, r.relationship, r.period_label, r.role_label, r.rating_overall, r.ratings,
            r.title, r.pros, r.cons, r.advice, r.verified_experience, r.helpful_count,
            r.reply_body, r.reply_at, r.published_at, r.created_at,
            ci.name AS company_city, u.display_pseudonym
     FROM reviews r
     JOIN companies c ON c.id = r.company_id
     LEFT JOIN cities ci ON ci.id = c.city_id
     LEFT JOIN users u ON u.id = r.user_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const countParams = relationship ? [companyId, relationship] : [companyId];
  const countRows = await read(
    `SELECT COUNT(*)::int AS total FROM reviews r WHERE ${where.join(" AND ")}`,
    countParams
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      relationship: row.relationship,
      relationshipLabel: relationshipLabel(row.relationship),
      period: row.period_label,
      role: row.role_label,
      rating: Number(row.rating_overall),
      ratings: row.ratings || {},
      title: row.title,
      pros: row.pros,
      cons: row.cons,
      advice: row.advice,
      verifiedExperience: row.verified_experience,
      helpfulCount: row.helpful_count,
      reply: row.reply_body ? { body: row.reply_body, at: row.reply_at } : null,
      publishedAt: row.published_at,
      authorLabel: ["former_intern", "current_intern"].includes(row.relationship)
        ? `Stagiaire · ${row.company_city || ""}`.trim()
        : `${relationshipLabel(row.relationship)} · ${row.company_city || ""}`.trim(),
    })),
    total: countRows[0]?.total ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/*  Offres                                                                    */
/* -------------------------------------------------------------------------- */
export async function listOffers(filters = {}, { limit = 24, offset = 0 } = {}) {
  const where = ["o.status = 'published'", "c.publication_status = 'published'"];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace("$?", `$${params.length}`));
  };

  if (filters.q) {
    const terms = fold(filters.q).split(" ").filter((word) => word.length > 1);
    if (terms.length) {
      const clauses = terms.map((term) => {
        params.push(`%${term}%`);
        return `o.search_text LIKE $${params.length}`;
      });
      where.push(
        terms.length === 1 || filters.qMode !== "any" ? clauses.join(" AND ") : `(${clauses.join(" OR ")})`
      );
    }
  }
  if (filters.cities?.length) add("ci.slug = ANY($?)", filters.cities);
  if (filters.neighborhoods?.length) add("n.slug = ANY($?)", filters.neighborhoods);
  if (filters.sectors?.length) add("s.slug = ANY($?)", filters.sectors);
  if (filters.contracts?.length) add("o.contract_type = ANY($?)", filters.contracts);
  if (filters.internshipsOnly) where.push("o.contract_type LIKE 'stage%'");
  if (filters.education) add("o.education_level ILIKE $?", `%${filters.education}%`);
  if (filters.experience) add("o.experience_band = $?", filters.experience);
  if (filters.company) add("c.slug = $?", filters.company);
  if (filters.verifiedOnly) where.push("c.verification_level >= 1");
  if (filters.salaryVisible) where.push("o.salary_visible = TRUE");
  if (filters.publishedDays > 0) add("o.published_at > NOW() - ($? || ' days')::interval", String(filters.publishedDays));

  const order =
    filters.sort === "deadline"
      ? "ORDER BY o.deadline_at ASC NULLS LAST"
      : filters.sort === "pertinence" && filters.q
        ? "ORDER BY o.published_at DESC"
        : "ORDER BY o.published_at DESC";

  params.push(limit, offset);
  const rows = await read(
    `${offerSelect()} WHERE ${where.join(" AND ")} ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const countRows = await read(
    `SELECT COUNT(*)::int AS total FROM job_offers o
     JOIN companies c ON c.id = o.company_id
     LEFT JOIN cities ci ON ci.id = COALESCE(o.city_id, c.city_id)
     LEFT JOIN neighborhoods n ON n.id = COALESCE(o.neighborhood_id, c.neighborhood_id)
     LEFT JOIN company_sectors cs ON cs.company_id = c.id AND cs.is_primary = TRUE
     LEFT JOIN sectors s ON s.id = cs.sector_id
     WHERE ${where.join(" AND ")}`,
    params.slice(0, params.length - 2)
  );
  const total = countRows[0]?.total ?? 0;
  return {
    items: rows.map(toOfferCard),
    total,
    page: Math.floor(offset / limit) + 1,
    perPage: limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getOfferBySlug(slug) {
  const row = await readOne(
    `${offerSelect("o.description, o.missions, o.profile, o.benefits, o.apply_target")}
     WHERE o.slug = $1 LIMIT 1`,
    [slug]
  );
  if (!row) return null;
  return {
    ...toOfferCard(row),
    description: row.description,
    missions: row.missions,
    profile: row.profile,
    benefits: row.benefits,
    applyTarget: row.apply_target,
  };
}

export async function companyOffers(companyId, limit = 12) {
  const rows = await read(
    `${offerSelect()}
     WHERE o.company_id = $1 AND o.status = 'published'
     ORDER BY o.published_at DESC LIMIT $2`,
    [companyId, limit]
  );
  return rows.map(toOfferCard);
}

export async function similarCompanies(company, limit = 6) {
  const rows = await read(
    `${companySelect()}
     WHERE c.publication_status = 'published' AND c.deleted_at IS NULL
       AND c.id <> $1
       AND (s.slug = $2 OR ci.slug = $3)
     ORDER BY (s.slug = $2) DESC, c.rating_avg DESC
     LIMIT $4`,
    [company.id || null, company.sector?.slug || "", company.city?.slug || "", limit]
  );
  const settings = await getSettings();
  return rows.map((row) => toCompanyCard(row, settings));
}

/* -------------------------------------------------------------------------- */
/*  Carte                                                                     */
/* -------------------------------------------------------------------------- */
export async function mapCompanies(filters = {}, bbox = null) {
  const settings = await getSettings();
  const { where, params } = buildCompanyFilters(filters);
  const conditions = [where ? where.replace(/^WHERE /, "") : "1=1", "c.lat IS NOT NULL", "c.lng IS NOT NULL"];
  const allParams = [...params];
  if (bbox && bbox.length === 4 && bbox.every((value) => Number.isFinite(value))) {
    // Convention : [ouest, sud, est, nord] = [minLng, minLat, maxLng, maxLat]
    allParams.push(bbox[0], bbox[1], bbox[2], bbox[3]);
    conditions.push(
      `c.lng BETWEEN $${allParams.length - 3} AND $${allParams.length - 1} AND c.lat BETWEEN $${allParams.length - 2} AND $${allParams.length}`
    );
  }
  allParams.push(300);
  const rows = await read(
    `${companySelect()} WHERE ${conditions.join(" AND ")} LIMIT $${allParams.length}`,
    allParams
  );
  return rows.map((row) => toCompanyCard(row, settings));
}

/* -------------------------------------------------------------------------- */
/*  Accueil, référentiels, réputation                                         */
/* -------------------------------------------------------------------------- */
export async function homeData() {
  const settings = await getSettings();
  const minRating = settings.min_reviews_for_rating ?? 3;
  const [[counts], cities, sectors, hiringRows, newestRows, topRatedRows, verifiedRows, internshipOffers] = await readBatch([
    [`SELECT
       (SELECT COUNT(*)::int FROM companies WHERE publication_status = 'published' AND deleted_at IS NULL) AS companies,
       (SELECT COUNT(*)::int FROM job_offers o JOIN companies c ON c.id = o.company_id
          WHERE o.status = 'published' AND c.publication_status = 'published'
            AND (o.deadline_at IS NULL OR o.deadline_at > NOW())) AS offers,
       (SELECT COUNT(*)::int FROM reviews WHERE status = 'published') AS reviews,
       (SELECT COUNT(*)::int FROM companies WHERE verification_level > 0 AND publication_status = 'published') AS verified`],
    [`SELECT ci.slug, ci.name, ci.region, ci.intro,
            (SELECT COUNT(*)::int FROM companies c WHERE c.city_id = ci.id AND c.publication_status='published') AS companies,
            (SELECT COUNT(*)::int FROM job_offers o JOIN companies c ON c.id = o.company_id
               WHERE COALESCE(o.city_id, c.city_id) = ci.id AND o.status='published'
                 AND (o.deadline_at IS NULL OR o.deadline_at > NOW())) AS offers
     FROM cities ci WHERE ci.is_active = TRUE ORDER BY ci.sort_order`],
    [`SELECT s.slug, s.name, s.icon, s.color, s.description,
            (SELECT COUNT(*)::int FROM company_sectors cs JOIN companies c ON c.id = cs.company_id
              WHERE cs.sector_id = s.id AND c.publication_status='published') AS companies
     FROM sectors s WHERE s.is_active = TRUE ORDER BY s.sort_order`],
    [`${companySelect()}
     WHERE c.publication_status='published' AND c.deleted_at IS NULL AND c.is_hiring = TRUE
     ORDER BY c.rating_avg DESC, c.rating_count DESC LIMIT 8`],
    [`${companySelect()}
     WHERE c.publication_status='published' AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC LIMIT 8`],
    [`${companySelect()}
     WHERE c.publication_status='published' AND c.deleted_at IS NULL AND c.rating_count >= $1
     ORDER BY c.rating_avg DESC, c.rating_count DESC LIMIT 8`,
      [minRating]],
    [`${companySelect()}
     WHERE c.publication_status='published' AND c.deleted_at IS NULL AND c.verification_level > 0
     ORDER BY c.verification_level DESC, c.rating_avg DESC LIMIT 12`],
    [`${offerSelect()}
     WHERE o.status='published' AND o.contract_type LIKE 'stage%'
       AND (o.deadline_at IS NULL OR o.deadline_at > NOW())
     ORDER BY o.published_at DESC LIMIT 6`],
  ]);
  return {
    counts,
    demoBanner: settings.demo_banner !== false,
    cities,
    sectors,
    hiring: hiringRows.map((row) => toCompanyCard(row, settings)),
    newest: newestRows.map((row) => toCompanyCard(row, settings)),
    topRated: topRatedRows.map((row) => toCompanyCard(row, settings)),
    verified: verifiedRows.map((row) => toCompanyCard(row, settings)),
    internships: internshipOffers.map(toOfferCard),
  };
}

export async function metaData() {
  const settings = await getSettings();
  const [cities, sectors, [stats]] = await readBatch([
    [`SELECT ci.slug, ci.name, ci.region, ci.center_lat, ci.center_lng, ci.zoom,
            (SELECT COUNT(*)::int FROM companies c WHERE c.city_id = ci.id AND c.publication_status='published') AS companies,
            (SELECT json_agg(json_build_object('slug', n.slug, 'name', n.name, 'district', d.name) ORDER BY n.name)
               FROM neighborhoods n LEFT JOIN districts d ON d.id = n.district_id
               WHERE n.city_id = ci.id) AS neighborhoods,
            (SELECT json_agg(json_build_object('slug', d.slug, 'name', d.name) ORDER BY d.name)
               FROM districts d WHERE d.city_id = ci.id) AS districts
     FROM cities ci WHERE ci.is_active = TRUE ORDER BY ci.sort_order`],
    [`SELECT s.slug, s.name, s.icon, s.color, s.description,
            (SELECT COUNT(*)::int FROM company_sectors cs JOIN companies c ON c.id = cs.company_id
              WHERE cs.sector_id = s.id AND c.publication_status='published') AS companies
     FROM sectors s WHERE s.is_active = TRUE ORDER BY s.sort_order`],
    [`SELECT
       (SELECT COUNT(*)::int FROM companies WHERE publication_status='published' AND deleted_at IS NULL) AS companies,
       (SELECT COUNT(*)::int FROM job_offers o JOIN companies c ON c.id = o.company_id
          WHERE o.status='published' AND (o.deadline_at IS NULL OR o.deadline_at > NOW())
            AND c.publication_status='published') AS offers,
       (SELECT COUNT(*)::int FROM reviews WHERE status='published') AS reviews`],
  ]);
  return {
    cities,
    sectors,
    stats,
    settings: {
      siteName: settings.site_name,
      tagline: settings.tagline,
      demoBanner: settings.demo_banner !== false,
      minReviewsForRating: settings.min_reviews_for_rating ?? 3,
      minReviewsForRanking: settings.min_reviews_for_ranking ?? 5,
      mapStyleUrl: settings.map_style_url,
      contactEmail: settings.contact_email,
      paymentMode: settings.payment_mode,
      features: settings.features || {},
    },
  };
}

export async function reputationData() {
  const settings = await getSettings();
  const minRanking = settings.min_reviews_for_ranking ?? 5;
  const bySector = await read(
    `SELECT s.slug AS sector_slug, s.name AS sector_name, s.color, s.icon,
            c.slug, c.name, c.rating_avg, c.rating_count,
            ci.slug AS city_slug, ci.name AS city_name
     FROM companies c
     JOIN company_sectors cs ON cs.company_id = c.id AND cs.is_primary = TRUE
     JOIN sectors s ON s.id = cs.sector_id
     LEFT JOIN cities ci ON ci.id = c.city_id
     WHERE c.publication_status='published' AND c.rating_count >= $1
     ORDER BY s.sort_order, c.rating_avg DESC, c.rating_count DESC`,
    [minRanking]
  );
  const grouped = new Map();
  for (const row of bySector) {
    if (!grouped.has(row.sector_slug)) {
      grouped.set(row.sector_slug, {
        sector: { slug: row.sector_slug, name: row.sector_name, color: row.color, icon: row.icon },
        companies: [],
      });
    }
    const bucket = grouped.get(row.sector_slug);
    if (bucket.companies.length < 5) {
      bucket.companies.push({
        slug: row.slug,
        name: row.name,
        rating: Number(row.rating_avg),
        ratingCount: row.rating_count,
        city: row.city_name,
      });
    }
  }
  const recent = await read(
    `SELECT r.id, r.title, r.rating_overall, r.relationship, r.published_at, r.pros,
            c.slug AS company_slug, c.name AS company_name, ci.name AS city_name
     FROM reviews r JOIN companies c ON c.id = r.company_id
     LEFT JOIN cities ci ON ci.id = c.city_id
     WHERE r.status='published' ORDER BY r.published_at DESC LIMIT 8`
  );
  const internships = await read(
    `SELECT c.slug, c.name, AVG(NULLIF(r.ratings->>'internship','')::numeric)::float AS score,
            COUNT(*)::int AS reviews
     FROM reviews r JOIN companies c ON c.id = r.company_id
     WHERE r.status='published' AND NULLIF(r.ratings->>'internship','') IS NOT NULL
     GROUP BY c.slug, c.name HAVING COUNT(*) >= 3
     ORDER BY score DESC LIMIT 5`
  );
  const atmosphere = await read(
    `SELECT c.slug, c.name, AVG(NULLIF(r.ratings->>'work_env','')::numeric)::float AS score,
            COUNT(*)::int AS reviews
     FROM reviews r JOIN companies c ON c.id = r.company_id
     WHERE r.status='published' AND NULLIF(r.ratings->>'work_env','') IS NOT NULL
     GROUP BY c.slug, c.name HAVING COUNT(*) >= 3
     ORDER BY score DESC LIMIT 5`
  );
  return {
    bySector: [...grouped.values()],
    recent: recent.map((row) => ({
      ...row,
      rating: Number(row.rating_overall),
      relationshipLabel: relationshipLabel(row.relationship),
    })),
    internships: internships.map((row) => ({ ...row, score: Number(Number(row.score).toFixed(1)) })),
    atmosphere: atmosphere.map((row) => ({ ...row, score: Number(Number(row.score).toFixed(1)) })),
  };
}

/* -------------------------------------------------------------------------- */
/*  Suggestions de recherche                                                  */
/* -------------------------------------------------------------------------- */
export async function suggest(term, { limit = 8 } = {}) {
  const folded = fold(term);
  if (!folded || folded.length < 2) {
    return { companies: [], sectors: [], neighborhoods: [], offers: [], corrected: null };
  }
  const like = `%${folded}%`;
  const [companies, sectors, neighborhoods, offers] = await Promise.all([
    read(
      `SELECT c.slug, c.name, c.rating_avg, c.rating_count, ci.name AS city_name, s.name AS sector_name
       FROM companies c
       LEFT JOIN cities ci ON ci.id = c.city_id
       LEFT JOIN company_sectors cs ON cs.company_id = c.id AND cs.is_primary = TRUE
       LEFT JOIN sectors s ON s.id = cs.sector_id
       WHERE c.publication_status='published' AND c.search_text LIKE $1
       ORDER BY (c.name ILIKE $2) DESC, c.rating_count DESC LIMIT $3`,
      [like, `${term}%`, limit]
    ),
    read(
      `SELECT slug, name, icon FROM sectors
       WHERE lower(name) LIKE $1 OR slug LIKE $1
       ORDER BY (lower(name) LIKE $2) DESC LIMIT 4`,
      [like, `${folded}%`]
    ),
    read(
      `SELECT n.slug, n.name, ci.slug AS city_slug, ci.name AS city_name
       FROM neighborhoods n JOIN cities ci ON ci.id = n.city_id
       WHERE lower(n.name) LIKE $1 LIMIT 4`,
      [like]
    ),
    read(
      `SELECT o.slug, o.title, o.contract_type, c.name AS company_name
       FROM job_offers o JOIN companies c ON c.id = o.company_id
       WHERE o.status='published' AND o.search_text LIKE $1
       ORDER BY o.published_at DESC LIMIT 4`,
      [like]
    ),
  ]);

  // Correction de frappe : on propose le secteur ou la ville le plus proche.
  let corrected = null;
  if (!companies.length && folded.length >= 4) {
    const candidates = await read(
      `SELECT slug, name, 'secteur' AS kind FROM sectors
       UNION ALL SELECT slug, name, 'ville' FROM cities WHERE is_active = TRUE
       UNION ALL SELECT slug, name, 'entreprise' FROM companies WHERE publication_status = 'published'`
    );
    let bestDistance = 3;
    for (const candidate of candidates) {
      for (const word of [fold(candidate.name), ...fold(candidate.name).split(" ")]) {
        if (word.length < 4) continue;
        const distance = levenshtein(folded, word, bestDistance);
        if (distance < bestDistance) {
          bestDistance = distance;
          corrected = candidate;
        }
      }
    }
  }

  return {
    companies,
    sectors,
    neighborhoods,
    offers,
    corrected,
  };
}

/* -------------------------------------------------------------------------- */
/*  Récupération par identifiants (favoris, suivi de candidatures)             */
/* -------------------------------------------------------------------------- */
export async function companiesByIds(ids = []) {
  if (!ids.length) return [];
  const settings = await getSettings();
  const rows = await read(
    `${companySelect()} WHERE c.id = ANY($1::uuid[]) AND c.publication_status = 'published'`,
    [ids]
  );
  return rows.map((row) => toCompanyCard(row, settings));
}

export async function offersByIds(ids = []) {
  if (!ids.length) return [];
  const rows = await read(`${offerSelect()} WHERE o.id = ANY($1::uuid[])`, [ids]);
  return rows.map(toOfferCard);
}

export async function companiesBySlugs(slugs = []) {
  if (!slugs.length) return [];
  const settings = await getSettings();
  const rows = await read(
    `${companySelect()} WHERE c.slug = ANY($1::text[]) AND c.publication_status = 'published'`,
    [slugs]
  );
  return rows.map((row) => toCompanyCard(row, settings));
}
