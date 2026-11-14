/**
 * Chargement du jeu de données initial.
 *
 * Fonction unique utilisée dans les deux contextes :
 *   - `npm run db:init` → base Neon de production ;
 *   - mode démonstration (DATABASE_URL absente) → base PGlite en mémoire.
 *
 * `query(text, params)` doit renvoyer un tableau de lignes.
 * Toutes les insertions sont idempotentes : relancer le script ne duplique rien.
 */
import { buildDataset } from "../data/seed/index.mjs";
import { hashPassword } from "../server-api/_lib/password.js";

const json = (value) => JSON.stringify(value ?? null);

export async function seedDatabase(query, { log = () => {} } = {}) {
  const data = buildDataset();
  const ids = {
    cities: new Map(),
    districts: new Map(),
    neighborhoods: new Map(),
    sectors: new Map(),
    companies: new Map(),
    users: new Map(),
    offers: new Map(),
    plans: new Map(),
  };

  /* ---------------------------------------------------------------- villes */
  for (const city of data.cities) {
    const rows = await query(
      `INSERT INTO cities (slug, name, region, intro, center_lat, center_lng, zoom, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, region = EXCLUDED.region, intro = EXCLUDED.intro,
             center_lat = EXCLUDED.center_lat, center_lng = EXCLUDED.center_lng,
             zoom = EXCLUDED.zoom, sort_order = EXCLUDED.sort_order, updated_at = NOW()
       RETURNING id`,
      [city.slug, city.name, city.region, city.intro, city.lat, city.lng, city.zoom, city.sortOrder]
    );
    ids.cities.set(city.slug, rows[0].id);

    for (const districtName of city.districts) {
      const slug = districtName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const districtRows = await query(
        `INSERT INTO districts (city_id, slug, name) VALUES ($1,$2,$3)
         ON CONFLICT (city_id, slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [ids.cities.get(city.slug), slug, districtName]
      );
      ids.districts.set(`${city.slug}:${districtName}`, districtRows[0].id);
    }

    for (const [slug, name, lat, lng, districtName] of city.neighborhoods) {
      const rowsNeighborhood = await query(
        `INSERT INTO neighborhoods (city_id, district_id, slug, name, lat, lng)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (city_id, slug) DO UPDATE
           SET name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
               district_id = EXCLUDED.district_id
         RETURNING id`,
        [
          ids.cities.get(city.slug),
          ids.districts.get(`${city.slug}:${districtName}`) || null,
          slug,
          name,
          lat,
          lng,
        ]
      );
      ids.neighborhoods.set(`${city.slug}:${slug}`, rowsNeighborhood[0].id);
    }
  }
  log(`villes : ${data.cities.length}`);

  /* --------------------------------------------------------------- secteurs */
  for (const sector of data.sectors) {
    const rows = await query(
      `INSERT INTO sectors (slug, name, icon, color, description, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, icon = EXCLUDED.icon, color = EXCLUDED.color,
             description = EXCLUDED.description, sort_order = EXCLUDED.sort_order,
             updated_at = NOW()
       RETURNING id`,
      [sector.slug, sector.name, sector.icon, sector.color, sector.description, sector.order]
    );
    ids.sectors.set(sector.slug, rows[0].id);
  }
  log(`secteurs : ${data.sectors.length}`);

  /* ---------------------------------------------------------------- comptes */
  // Un seul hachage partagé pour les auteurs techniques : ces comptes ne se
  // connectent jamais, le coût de scrypt est donc payé une seule fois.
  const authorHash = await hashPassword("seed-authors-not-loginable");
  for (const user of data.users) {
    const passwordHash =
      user.role === "user" && user.email.includes("@seed.conglomerat.invalid")
        ? authorHash
        : await hashPassword(user.password);
    const rows = await query(
      `INSERT INTO users (email, password_hash, role, status, first_name, last_name,
                          display_pseudonym, email_verified_at, city_id, education_level, field, points)
       VALUES ($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name
       RETURNING id`,
      [
        String(user.email).toLowerCase(),
        passwordHash,
        user.role,
        user.firstName,
        user.lastName,
        user.pseudonym || "",
        user.emailVerified ? new Date() : null,
        user.citySlug ? ids.cities.get(user.citySlug) : null,
        user.educationLevel || null,
        user.field || null,
        user.points || 0,
      ]
    );
    ids.users.set(user.email, rows[0].id);
  }
  log(`comptes : ${data.users.length}`);

  /* ------------------------------------------------------------ entreprises */
  for (const company of data.companies) {
    const cityId = ids.cities.get(company.citySlug);
    const neighborhoodSlug = company.neighborhoods?.[0];
    const neighborhoodId = neighborhoodSlug
      ? ids.neighborhoods.get(`${company.citySlug}:${neighborhoodSlug}`)
      : null;
    const districtId = company.districtName
      ? ids.districts.get(`${company.citySlug}:${company.districtName}`)
      : null;
    const verifiedAt =
      company.verificationLevel > 0
        ? new Date(Date.now() - 90 * 86400000)
        : null;
    const verificationExpires =
      company.verificationLevel > 0 ? new Date(Date.now() + 275 * 86400000) : null;

    const rows = await query(
      `INSERT INTO companies (
         slug, name, legal_name, description_short, description_long, founded_year,
         size_band, employees_estimate, legal_status, languages, city_id, district_id,
         neighborhood_id, address, landmark, lat, lng, hours, contacts, benefits,
         hiring_domains, contract_types, publication_status, verification_level,
         verified_at, verification_expires_at, rating_avg, rating_count, is_hiring,
         hiring_roles, provenance, source_url, search_text, last_checked_at, view_count
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,
         $18::jsonb,$19::jsonb,$20::jsonb,$21::jsonb,$22::jsonb,'published',$23,
         $24,$25,$26,$27,$28,$29::jsonb,$30,$31,$32,$33,$34
       )
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, legal_name = EXCLUDED.legal_name,
         description_short = EXCLUDED.description_short,
         description_long = EXCLUDED.description_long,
         founded_year = EXCLUDED.founded_year, size_band = EXCLUDED.size_band,
         employees_estimate = EXCLUDED.employees_estimate,
         legal_status = EXCLUDED.legal_status, languages = EXCLUDED.languages,
         city_id = EXCLUDED.city_id, district_id = EXCLUDED.district_id,
         neighborhood_id = EXCLUDED.neighborhood_id, address = EXCLUDED.address,
         landmark = EXCLUDED.landmark, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
         hours = EXCLUDED.hours, contacts = EXCLUDED.contacts, benefits = EXCLUDED.benefits,
         hiring_domains = EXCLUDED.hiring_domains, contract_types = EXCLUDED.contract_types,
         verification_level = EXCLUDED.verification_level, verified_at = EXCLUDED.verified_at,
         verification_expires_at = EXCLUDED.verification_expires_at,
         rating_avg = EXCLUDED.rating_avg, rating_count = EXCLUDED.rating_count,
         is_hiring = EXCLUDED.is_hiring, hiring_roles = EXCLUDED.hiring_roles,
         provenance = EXCLUDED.provenance, source_url = EXCLUDED.source_url,
         search_text = EXCLUDED.search_text, updated_at = NOW()
       RETURNING id`,
      [
        company.slug,
        company.name,
        company.legalName,
        company.descriptionShort,
        company.descriptionLong,
        company.foundedYear,
        company.sizeBand,
        company.employeesEstimate,
        company.legalStatus,
        json(company.languages),
        cityId,
        districtId,
        neighborhoodId,
        company.address,
        company.landmark,
        company.lat,
        company.lng,
        json(company.hours),
        json(company.contacts),
        json(company.benefits),
        json(company.hiringDomains),
        json(company.contractTypes),
        company.verificationLevel,
        verifiedAt,
        verificationExpires,
        company.ratingAvg,
        company.ratingCount,
        company.isHiring,
        json(company.hiringRoles),
        company.provenance,
        company.sourceUrl,
        company.searchText,
        new Date(),
        demoViewCount(company.slug, company.provenance),
      ]
    );
    ids.companies.set(company.slug, rows[0].id);

    await query(
      `INSERT INTO company_sectors (company_id, sector_id, is_primary)
       VALUES ($1,$2,TRUE) ON CONFLICT DO NOTHING`,
      [rows[0].id, ids.sectors.get(company.sectorSlug)]
    );
  }
  log(`entreprises : ${data.companies.length}`);

  /* ------------------------------------------------------------------- avis */
  let reviewCount = 0;
  for (const review of data.reviews) {
    const companyId = ids.companies.get(review.companySlug);
    const userId = ids.users.get(review.authorEmail);
    if (!companyId || !userId) continue;
    await query(
      `INSERT INTO reviews (
         company_id, user_id, relationship, period_label, role_label, rating_overall,
         ratings, title, pros, cons, advice, status, verified_experience,
         helpful_count, reply_body, reply_at, published_at, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)
       ON CONFLICT DO NOTHING`,
      [
        companyId,
        userId,
        review.relationship,
        review.periodLabel,
        review.roleLabel,
        review.ratingOverall,
        json(review.ratings),
        review.title,
        review.pros,
        review.cons,
        review.advice,
        review.status,
        review.verifiedExperience,
        review.helpfulCount,
        review.replyBody,
        review.replyAt,
        review.publishedAt,
        review.createdAt,
      ]
    );
    reviewCount += 1;
  }
  log(`avis : ${reviewCount}`);

  /* ----------------------------------------------------------------- offres */
  for (const offer of data.offers) {
    const companyId = ids.companies.get(offer.companySlug);
    if (!companyId) continue;
    const rows = await query(
      `INSERT INTO job_offers (
         slug, company_id, title, contract_type, description, missions, profile,
         education_level, experience_band, skills, benefits, city_id, neighborhood_id,
         salary_min, salary_max, salary_visible, apply_mode, apply_target, status,
         published_at, deadline_at, search_text
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title, contract_type = EXCLUDED.contract_type,
         description = EXCLUDED.description, missions = EXCLUDED.missions,
         profile = EXCLUDED.profile, education_level = EXCLUDED.education_level,
         experience_band = EXCLUDED.experience_band, skills = EXCLUDED.skills,
         benefits = EXCLUDED.benefits, city_id = EXCLUDED.city_id,
         neighborhood_id = EXCLUDED.neighborhood_id, salary_min = EXCLUDED.salary_min,
         salary_max = EXCLUDED.salary_max, salary_visible = EXCLUDED.salary_visible,
         status = EXCLUDED.status, published_at = EXCLUDED.published_at,
         deadline_at = EXCLUDED.deadline_at, search_text = EXCLUDED.search_text,
         updated_at = NOW()
       RETURNING id`,
      [
        offer.slug,
        companyId,
        offer.title,
        offer.contractType,
        offer.description,
        offer.missions,
        offer.profile,
        offer.educationLevel,
        offer.experienceBand,
        json(offer.skills),
        offer.benefits,
        ids.cities.get(offer.citySlug),
        offer.neighborhoodSlug
          ? ids.neighborhoods.get(`${offer.citySlug}:${offer.neighborhoodSlug}`)
          : null,
        offer.salaryMin,
        offer.salaryMax,
        offer.salaryVisible,
        offer.applyMode,
        offer.applyTarget,
        offer.status,
        offer.publishedAt,
        offer.deadlineAt,
        offer.searchText,
      ]
    );
    ids.offers.set(offer.slug, rows[0].id);
  }
  log(`offres : ${data.offers.length}`);

  /* ------------------------------------------------------------------ plans */
  for (const plan of data.plans) {
    const rows = await query(
      `INSERT INTO plans (slug, name, period, price_xaf, features, is_active)
       VALUES ($1,$2,$3,$4,$5::jsonb,TRUE)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, period = EXCLUDED.period, price_xaf = EXCLUDED.price_xaf,
             features = EXCLUDED.features
       RETURNING id`,
      [plan.slug, plan.name, plan.period, plan.priceXaf, json(plan.features)]
    );
    ids.plans.set(plan.slug, rows[0].id);
  }

  /* --------------------------------------------------------------- réglages */
  for (const [key, value] of Object.entries(data.settings)) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1,$2::jsonb)
       ON CONFLICT (key) DO NOTHING`,
      [key, json(value)]
    );
  }

  /* ------------------------------------------- données de démonstration liées */
  const demoId = ids.users.get("demo@conglomerat.cm");
  const ownerId = ids.users.get("entrepriseconglomerat@conglomerat.cm");
  const demoCompany = ids.companies.get("cabinet-ekombo-conseil");
  const techHub = ids.companies.get("yaounde-tech-hub");
  const fintech = ids.companies.get("fintech-nkap");

  if (ownerId && demoCompany) {
    await query(
      `INSERT INTO company_members (company_id, user_id, role) VALUES ($1,$2,'owner')
       ON CONFLICT DO NOTHING`,
      [demoCompany, ownerId]
    );
  }

  if (demoId) {
    for (const companyId of [techHub, fintech, demoCompany].filter(Boolean)) {
      await query(
        `INSERT INTO favorites (user_id, target_type, target_id) VALUES ($1,'company',$2)
         ON CONFLICT DO NOTHING`,
        [demoId, companyId]
      );
    }
    await query(
      `INSERT INTO user_trackers (user_id, company_id, free_label, status, note)
       SELECT $1, $2, 'Candidature spontanée', 'sent', 'Relancer la semaine prochaine' 
       WHERE NOT EXISTS (SELECT 1 FROM user_trackers WHERE user_id = $1 AND company_id = $2)`,
      [demoId, techHub]
    );
    await query(
      `INSERT INTO alerts (user_id, filters, frequency, channels)
       SELECT $1, $2::jsonb, 'weekly', '["site","email"]'::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE user_id = $1)`,
      [demoId, json({ cities: ["douala"], sectors: ["comptabilite"], contractTypes: ["stage_professionnel"] })]
    );

    const firstOffer = [...ids.offers.entries()].find(([slug]) => slug.startsWith("fintech-nkap-"));
    if (firstOffer) {
      await query(
        `INSERT INTO applications (job_offer_id, user_id, cover_letter, status)
         VALUES ($1,$2,$3,'reviewing') ON CONFLICT DO NOTHING`,
        [firstOffer[1], demoId, "Candidature de démonstration envoyée depuis le site."]
      );
    }

    // Un avis déjà publié rattaché au compte de démonstration, pour que
    // « Mon compte → Mes avis » ne soit pas vide à la première connexion.
    if (techHub) {
      const alreadyOwned = await query(
        `SELECT id FROM reviews WHERE user_id = $1 AND company_id = $2 LIMIT 1`,
        [demoId, techHub]
      );
      if (!alreadyOwned.length) {
        const candidate = await query(
          `SELECT id FROM reviews WHERE company_id = $1 AND status = 'published'
           ORDER BY created_at ASC LIMIT 1`,
          [techHub]
        );
        if (candidate.length) {
          await query(
            `UPDATE reviews SET user_id = $2 WHERE id = $1 AND NOT EXISTS (
               SELECT 1 FROM reviews WHERE user_id = $2 AND company_id = $3
             )`,
            [candidate[0].id, demoId, techHub]
          );
        }
      }
    }

    const subscription = await query(
      `INSERT INTO subscriptions (user_id, plan_id, status, started_at, ends_at)
       SELECT $1,$2,'active', NOW() - INTERVAL '12 days', NOW() + INTERVAL '18 days'
       WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = $1)
       RETURNING id`,
      [demoId, ids.plans.get("premium-mensuel")]
    );
    if (subscription[0]?.id) {
      await query(
        `INSERT INTO payments (user_id, subscription_id, plan_id, provider_ref, amount_xaf, channel, status, buyer_name, buyer_email, raw_event)
         VALUES ($1,$2,$3,$4,2500,'mtn','succeeded',$5,$6,$7::jsonb)
         ON CONFLICT (provider_ref) DO NOTHING`,
        [
          demoId,
          subscription[0].id,
          ids.plans.get("premium-mensuel"),
          "DEMO-2026-0001",
          "Aïcha N.",
          "demo@conglomerat.cm",
          json({ simulated: true, confirmed_at: new Date().toISOString() }),
        ]
      );
    }
  }

  // File de modération de l'administration : contributions, signalement, réclamation.
  await query(
    `INSERT INTO contributions (kind, company_id, payload, status)
     SELECT 'new_company', NULL, $1::jsonb, 'pending'
     WHERE NOT EXISTS (SELECT 1 FROM contributions WHERE kind = 'new_company' AND status = 'pending')`,
    [
      json({
        name: "Boulangerie Le Levain d'Or",
        sector: "commerce",
        city: "yaounde",
        neighborhood: "mendong",
        description:
          "Boulangerie-pâtisserie de quartier proposant du pain au levain, des viennoiseries et des gâteaux sur commande.",
        phone: "+237699112233",
        submittedBy: "Visiteur anonyme",
      }),
    ]
  );
  await query(
    `INSERT INTO contributions (kind, company_id, payload, status)
     SELECT 'edit_company', $1, $2::jsonb, 'pending'
     WHERE NOT EXISTS (SELECT 1 FROM contributions WHERE kind = 'edit_company' AND status = 'pending')`,
    [
      demoCompany,
      json({
        fields: {
          contacts: {
            before: { phone: "+23760000011", whatsapp: "23760000011" },
            after: { phone: "+23760000019", whatsapp: "23760000019" },
          },
          address: { before: "", after: "Rue 1.847, Bastos, face à l'ancienne ambassade" },
        },
        submittedBy: "Serge M.",
      }),
    ]
  );
  await query(
    `INSERT INTO reports (target_type, target_id, reason, details, status)
     SELECT 'company', $1, 'adresse_incorrecte', $2, 'open'
     WHERE NOT EXISTS (SELECT 1 FROM reports WHERE status = 'open')`,
    [demoCompany, "Le repère indiqué ne correspond plus, l'immeuble a été démoli."]
  );
  await query(
    `INSERT INTO claim_requests (company_id, full_name, role_title, work_email, phone, proof_note, status)
     SELECT $1, 'Serge Mbarga', 'Directeur associé', 'direction@ekombo-conseil.cm', '+237699445566',
            'Extrait RCCM et attestation de représentation fournis.', 'pending'
     WHERE NOT EXISTS (SELECT 1 FROM claim_requests WHERE company_id = $1)`,
    [demoCompany]
  );
  await query(
    `INSERT INTO contact_messages (name, email, subject, message)
     SELECT 'Nadège T.', 'nadege.t@example.com', 'Question sur les avis',
            'Bonjour, comment obtenir le badge Expérience vérifiée pour un stage effectué en 2024 ?'
     WHERE NOT EXISTS (SELECT 1 FROM contact_messages)`
  );
  await query(
    `INSERT INTO audit_logs (actor_email, action, object_type, object_id, after)
     SELECT 'admin@conglomerat.cm', 'seed.install', 'system', 'initial', $1::jsonb
     WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = 'seed.install')`,
    [json({ dataset: "v1", companies: data.companies.length, reviews: reviewCount })]
  );

  return {
    companies: data.companies.length,
    reviews: reviewCount,
    offers: data.offers.length,
    users: data.users.length,
  };
}

function demoViewCount(slug, provenance) {
  // Compteur de vues de démonstration, stable pour un même slug (graphiques admin).
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) % 977;
  return (provenance === "reel" ? 120 : 40) + (hash % 260);
}

export default seedDatabase;
