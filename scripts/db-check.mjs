#!/usr/bin/env node
/**
 * `npm run db:check` — contrôle d'intégrité de la base.
 *
 * Fonctionne avec Neon (`DATABASE_URL`) ou avec PGlite, auquel cas la base de
 * démonstration est chargée en mémoire : les mêmes requêtes valident alors les
 * données de `data/seed`.
 *
 * Code de sortie 1 si une anomalie bloquante est détectée.
 */

import fs from "node:fs";
import { one, databaseMode } from "../server-api/_lib/db.js";

for (const name of [".env.local", ".env"]) {
  const file = new URL(`../${name}`, import.meta.url);
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

const rows = [];
function record(label, value, { ok = true, hint = "" } = {}) {
  rows.push({ label, value, ok, hint });
}

async function scalar(sql, params = []) {
  const row = await one(sql, params);
  return row ? Object.values(row)[0] : null;
}

async function main() {
  console.log("\nCONGLOMERAT — contrôle de la base\n");

  const mode = databaseMode();
  console.log(`  Source : ${mode}\n`);

  /* ------------------------------------------------------------- volumes */
  const volume = await one(
    `SELECT
       (SELECT COUNT(*)::int FROM companies WHERE deleted_at IS NULL) AS companies,
       (SELECT COUNT(*)::int FROM companies WHERE publication_status='published' AND deleted_at IS NULL) AS published,
       (SELECT COUNT(*)::int FROM companies WHERE provenance='exemple') AS demo,
       (SELECT COUNT(*)::int FROM reviews) AS reviews,
       (SELECT COUNT(*)::int FROM reviews WHERE status='published') AS reviews_published,
       (SELECT COUNT(*)::int FROM job_offers) AS offers,
       (SELECT COUNT(*)::int FROM cities) AS cities,
       (SELECT COUNT(*)::int FROM sectors) AS sectors,
       (SELECT COUNT(*)::int FROM users) AS users,
       (SELECT COUNT(*)::int FROM payments) AS payments`
  );
  for (const [key, value] of Object.entries(volume || {})) {
    record(`Volumétrie · ${key}`, value);
  }

  /* --------------------------------------------------- publications vides */
  const publishedWithoutSector = await scalar(
    `SELECT COUNT(*)::int FROM companies c
     WHERE c.publication_status='published' AND c.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM company_sectors cs WHERE cs.company_id = c.id)`
  );
  record("Fiches publiées sans secteur", publishedWithoutSector, {
    ok: publishedWithoutSector === 0,
    hint: "rattacher un secteur principal",
  });

  const publishedWithoutCity = await scalar(
    `SELECT COUNT(*)::int FROM companies
     WHERE publication_status='published' AND deleted_at IS NULL AND city_id IS NULL`
  );
  record("Fiches publiées sans ville", publishedWithoutCity, {
    ok: publishedWithoutCity === 0,
    hint: "city_id obligatoire pour apparaître dans /villes",
  });

  /* --------------------------------------------------------- coordonnées */
  const badPhones = await scalar(
    `SELECT COUNT(*)::int FROM companies
     WHERE deleted_at IS NULL AND COALESCE(contacts->>'phone','') <> ''
       AND (contacts->>'phone') !~ '^\\+237[0-9]{9}$'`
  );
  record("Téléphones hors format E.164 (+237…)", badPhones, {
    ok: badPhones === 0,
    hint: "normaliser avec normalizeCameroonPhone()",
  });

  const duplicatePhones = await scalar(
    `SELECT COUNT(*)::int FROM (
       SELECT contacts->>'phone' AS phone FROM companies
       WHERE deleted_at IS NULL AND COALESCE(contacts->>'phone','') <> ''
       GROUP BY 1 HAVING COUNT(*) > 1
     ) dupes`
  );
  record("Téléphones partagés par plusieurs fiches", duplicatePhones, {
    ok: duplicatePhones === 0,
    hint: "vérifier les doublons de fiche",
  });

  /* ----------------------------------------------------------- notation */
  const ratingDrift = await scalar(
    `SELECT COUNT(*)::int FROM companies c
     WHERE c.deleted_at IS NULL
       AND (
         c.rating_count <> (SELECT COUNT(*) FROM reviews r WHERE r.company_id = c.id AND r.status='published')
         OR ABS(c.rating_avg - COALESCE((
              SELECT AVG(r.rating_overall) FROM reviews r
              WHERE r.company_id = c.id AND r.status='published'), 0)) > 0.05
       )`
  );
  record("Notes d'entreprise désynchronisées des avis", ratingDrift, {
    ok: ratingDrift === 0,
    hint: "recalculer rating_avg / rating_count",
  });

  /* -------------------------------------------------------------- avis */
  const reviewOutOfRange = await scalar(
    `SELECT COUNT(*)::int FROM reviews
     WHERE rating_overall < 1 OR rating_overall > 5`
  );
  record("Avis hors barème (1–5)", reviewOutOfRange, { ok: reviewOutOfRange === 0 });

  const shortReviews = await scalar(
    `SELECT COUNT(*)::int FROM reviews WHERE length(COALESCE(pros,'')) < 40 OR length(COALESCE(cons,'')) < 40`
  );
  record("Avis trop courts (moins de 40 caractères)", shortReviews, {
    ok: shortReviews === 0,
    hint: "la règle produit impose 40 caractères minimum",
  });

  /* ------------------------------------------------------------- offres */
  const orphanOffers = await scalar(
    `SELECT COUNT(*)::int FROM job_offers o
     WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = o.company_id)`
  );
  record("Offres sans entreprise", orphanOffers, { ok: orphanOffers === 0 });

  const badContracts = await scalar(
    `SELECT COUNT(*)::int FROM job_offers
     WHERE contract_type NOT IN
       ('cdi','cdd','stage_academique','stage_professionnel','stage_pre_emploi','freelance','interim')`
  );
  record("Offres avec un type de contrat inconnu", badContracts, { ok: badContracts === 0 });

  const publishedOffersOnDraftCompany = await scalar(
    `SELECT COUNT(*)::int FROM job_offers o
     JOIN companies c ON c.id = o.company_id
     WHERE o.status='published' AND c.publication_status <> 'published'`
  );
  record("Offres publiées sur une fiche non publiée", publishedOffersOnDraftCompany, {
    ok: publishedOffersOnDraftCompany === 0,
    hint: "dépublier l'offre ou publier la fiche",
  });

  const expiredStillPublished = await scalar(
    `SELECT COUNT(*)::int FROM job_offers
     WHERE status='published' AND deadline_at IS NOT NULL AND deadline_at < NOW()`
  );
  record("Offres publiées dont la date limite est passée", expiredStillPublished, {
    ok: true,
    hint: "clôture automatique attendue côté tâche planifiée (non bloquant)",
  });

  /* ------------------------------------------------------------ comptes */
  const passwordlessUsers = await scalar(
    `SELECT COUNT(*)::int FROM users WHERE COALESCE(password_hash,'') = '' AND role <> 'super_admin'`
  );
  record("Comptes sans mot de passe", passwordlessUsers, { ok: passwordlessUsers === 0 });

  const orphanMembers = await scalar(
    `SELECT COUNT(*)::int FROM company_members m
     WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)
        OR NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = m.company_id)`
  );
  record("Rattachements entreprise orphelins", orphanMembers, { ok: orphanMembers === 0 });

  /* --------------------------------------------------------- modération */
  const staleQueue = await scalar(
    `SELECT COUNT(*)::int FROM reviews
     WHERE status='pending' AND created_at < NOW() - INTERVAL '7 days'`
  );
  record("Avis en attente depuis plus de 7 jours", staleQueue, {
    ok: staleQueue === 0,
    hint: "objectif produit : 48 h de modération",
  });

  const openReports = await scalar(`SELECT COUNT(*)::int FROM reports WHERE status='open'`);
  record("Signalements ouverts", openReports, { ok: true, hint: "informatif" });

  const pendingClaims = await scalar(`SELECT COUNT(*)::int FROM claim_requests WHERE status='pending'`);
  record("Revendications en attente", pendingClaims, { ok: true, hint: "informatif" });

  const pendingResets = await scalar(
    "SELECT COUNT(*)::int FROM password_resets WHERE used_at IS NULL AND expires_at > NOW()"
  );
  record("Jetons de réinitialisation actifs", pendingResets, { ok: true, hint: "informatif" });

  /* -------------------------------------------------------------- solo */
  const soloInternships = await scalar(
    `SELECT COUNT(*)::int FROM job_offers WHERE contract_type LIKE 'stage%'`
  );
  record("Offres de stage", String(soloInternships), { ok: true });

  /* ------------------------------------------------------------ affichage */
  const width = Math.max(...rows.map((row) => row.label.length)) + 2;
  for (const row of rows) {
    const mark = row.ok ? "✓" : "✗";
    const value = String(row.value).padStart(6);
    console.log(`  ${mark} ${row.label.padEnd(width)}${value}${row.hint && !row.ok ? `   → ${row.hint}` : ""}`);
  }

  const failures = rows.filter((row) => !row.ok);
  console.log("");
  if (failures.length) {
    console.log(`  ${failures.length} anomalie(s) détectée(s).\n`);
    return 1;
  }
  console.log("  Aucune anomalie bloquante.\n");
  return 0;
}

let code = 0;
try {
  code = await main();
} catch (error) {
  console.error("\n  Échec du contrôle :", error.reason || error.code || "unexpected_error", "\n");
  code = 1;
} finally {
  // PGlite et les connexions distantes se terminent d'eux-mêmes : rien à fermer ici.
}
process.exit(code);
