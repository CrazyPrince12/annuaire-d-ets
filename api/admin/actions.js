/**
 * POST /api/admin/actions — toutes les écritures du panneau d'administration.
 *
 * Body : { resource, id, action, payload }
 * Chaque action vérifie une permission précise côté serveur, écrit une ligne
 * dans le journal d'audit et renvoie un message explicite.
 */
import { one, query, setSetting } from "../_lib/db.js";
import { can, isAdminRole, logAudit, requireUser } from "../_lib/auth.js";
import { handler, ok, readBody, requireMethod, HttpError } from "../_lib/http.js";
import { optionalString, requireOneOf, requireString } from "../_lib/validate.js";
import { normalizeCameroonPhone, slugify } from "../_lib/text.js";

async function refreshCompanyRating(companyId) {
  const stats = await one(
    `SELECT COUNT(*)::int AS total, COALESCE(AVG(rating_overall), 0) AS average
     FROM reviews WHERE company_id = $1 AND status = 'published'`,
    [companyId]
  );
  await query("UPDATE companies SET rating_avg = $2, rating_count = $3, updated_at = NOW() WHERE id = $1", [
    companyId,
    Number(Number(stats.average).toFixed(1)),
    stats.total,
  ]);
  return stats;
}

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req);
  if (!isAdminRole(user.role)) throw new HttpError(403, "Espace réservé à l'équipe.");

  const body = await readBody(req);
  const resource = String(body.resource || "");
  const action = String(body.action || "");
  const id = String(body.id || "");
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const reason = optionalString(payload.reason, { max: 400 });

  /* ------------------------------------------------------------------ avis */
  if (resource === "review") {
    if (!can(user, "reviews.moderate")) throw new HttpError(403, "Permission de modération requise.");
    const review = await one("SELECT id, company_id, status FROM reviews WHERE id = $1", [id]);
    if (!review) throw new HttpError(404, "Avis introuvable.");

    if (action === "approve") {
      await query(
        "UPDATE reviews SET status='published', published_at=COALESCE(published_at, NOW()), decision_reason='', updated_at=NOW() WHERE id=$1",
        [id]
      );
    } else if (action === "reject") {
      if (!reason) throw new HttpError(400, "Un motif de refus est obligatoire.");
      await query("UPDATE reviews SET status='rejected', decision_reason=$2, updated_at=NOW() WHERE id=$1", [
        id,
        reason,
      ]);
    } else if (action === "hide") {
      await query("UPDATE reviews SET status='hidden', decision_reason=$2, updated_at=NOW() WHERE id=$1", [
        id,
        reason || "Masqué par la modération",
      ]);
    } else if (action === "verify") {
      await query("UPDATE reviews SET verified_experience=TRUE, updated_at=NOW() WHERE id=$1", [id]);
    } else {
      throw new HttpError(400, "Action inconnue pour un avis.");
    }
    await refreshCompanyRating(review.company_id);
    await logAudit(req, user, `review.${action}`, { objectType: "review", objectId: id, after: { reason } });
    return ok(res, { message: `Avis ${action === "approve" ? "publié" : action === "reject" ? "refusé" : "mis à jour"}.` });
  }

  /* ------------------------------------------------------------ contributions */
  if (resource === "contribution") {
    if (!can(user, "contributions.moderate")) throw new HttpError(403, "Permission requise.");
    const contribution = await one("SELECT * FROM contributions WHERE id = $1", [id]);
    if (!contribution) throw new HttpError(404, "Contribution introuvable.");

    if (action === "approve") {
      let createdSlug = null;
      if (contribution.kind === "new_company") {
        const data = contribution.payload || {};
        const city = await one("SELECT id FROM cities WHERE slug = $1", [data.city]);
        const sector = await one("SELECT id FROM sectors WHERE slug = $1", [data.sector]);
        const neighborhood = data.neighborhood
          ? await one("SELECT id, district_id FROM neighborhoods WHERE slug = $1 AND city_id = $2", [
              data.neighborhood,
              city?.id || null,
            ])
          : null;
        if (!city || !sector) throw new HttpError(400, "Ville ou secteur inconnu dans la contribution.");
        let slug = slugify(`${data.name}-${city.slug}`);
        const exists = await one("SELECT id FROM companies WHERE slug = $1", [slug]);
        if (exists) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
        const phone = data.phone ? normalizeCameroonPhone(data.phone) : "";
        const rows = await query(
          `INSERT INTO companies (slug, name, description_short, city_id, district_id, neighborhood_id,
                                  address, landmark, contacts, publication_status, provenance, search_text, is_hiring)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'published','contribution',$10,FALSE)
           RETURNING id`,
          [
            slug,
            data.name,
            data.description || "",
            city.id,
            neighborhood?.district_id || null,
            neighborhood?.id || null,
            data.address || "",
            data.landmark || "",
            JSON.stringify({
              phone,
              whatsapp: phone.replace(/^\+/, ""),
              email: data.email || "",
              website: data.website || "",
              social: {},
            }),
            `${data.name} ${data.description || ""} ${city.slug}`.toLowerCase(),
          ]
        );
        await query("INSERT INTO company_sectors (company_id, sector_id, is_primary) VALUES ($1,$2,TRUE)", [
          rows[0].id,
          sector.id,
        ]);
        createdSlug = slug;
        await query("UPDATE contributions SET company_id = $2 WHERE id = $1", [id, rows[0].id]);
      } else if (contribution.company_id) {
        const fields = contribution.payload?.fields || {};
        const updates = [];
        const params = [contribution.company_id];
        const map = {
          address: "address",
          landmark: "landmark",
          description_short: "description_short",
          description_long: "description_long",
        };
        for (const [key, value] of Object.entries(fields)) {
          if (map[key]) {
            params.push(String(value?.after ?? value).slice(0, 2000));
            updates.push(`${map[key]} = $${params.length}`);
          }
          if (key === "contacts" && value?.after) {
            const contacts = value.after;
            params.push(JSON.stringify(contacts));
            updates.push(`contacts = contacts || $${params.length}::jsonb`);
          }
        }
        if (updates.length) {
          await query(`UPDATE companies SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $1`, params);
        }
      }
      await query(
        `UPDATE contributions SET status='approved', reviewer_id=$2, decision_reason=$3,
                points_awarded = 10, updated_at = NOW() WHERE id=$1`,
        [id, user.id, reason]
      );
      if (contribution.user_id) {
        await query("UPDATE users SET points = points + 10 WHERE id = $1", [contribution.user_id]);
      }
      await logAudit(req, user, "contribution.approved", { objectType: "contribution", objectId: id, after: { createdSlug } });
      return ok(res, {
        message: createdSlug
          ? `Contribution acceptée. Fiche créée : ${createdSlug}.`
          : "Correction acceptée et appliquée.",
        slug: createdSlug,
      });
    }

    if (action === "reject") {
      if (!reason) throw new HttpError(400, "Un motif est obligatoire.");
      await query(
        "UPDATE contributions SET status='rejected', reviewer_id=$2, decision_reason=$3, updated_at=NOW() WHERE id=$1",
        [id, user.id, reason]
      );
      await logAudit(req, user, "contribution.rejected", { objectType: "contribution", objectId: id, after: { reason } });
      return ok(res, { message: "Contribution refusée. Le motif sera communiqué au contributeur." });
    }
    throw new HttpError(400, "Action inconnue.");
  }

  /* ------------------------------------------------------------- signalements */
  if (resource === "report") {
    if (!can(user, "reports.moderate")) throw new HttpError(403, "Permission requise.");
    const report = await one("SELECT * FROM reports WHERE id = $1", [id]);
    if (!report) throw new HttpError(404, "Signalement introuvable.");
    const status = action === "resolve" ? "resolved" : action === "reject" ? "rejected" : null;
    if (!status) throw new HttpError(400, "Action inconnue.");
    await query("UPDATE reports SET status=$2, resolution=$3 WHERE id=$1", [id, status, reason]);
    if (action === "resolve" && payload.suspendCompany && report.target_type === "company") {
      await query(
        "UPDATE companies SET publication_status='suspended', updated_at=NOW() WHERE id=$1",
        [report.target_id]
      );
    }
    await logAudit(req, user, `report.${action}`, { objectType: "report", objectId: id, after: { reason } });
    return ok(res, { message: status === "resolved" ? "Signalement traité." : "Signalement classé sans suite." });
  }

  /* ------------------------------------------------------------------- claims */
  if (resource === "claim") {
    if (!can(user, "claims.manage")) throw new HttpError(403, "Permission requise.");
    const claim = await one("SELECT * FROM claim_requests WHERE id = $1", [id]);
    if (!claim) throw new HttpError(404, "Demande introuvable.");
    if (action === "approve") {
      if (claim.user_id) {
        await query(
          `INSERT INTO company_members (company_id, user_id, role) VALUES ($1,$2,'owner')
           ON CONFLICT (company_id, user_id) DO UPDATE SET role='owner'`,
          [claim.company_id, claim.user_id]
        );
        await query("UPDATE users SET role='company' WHERE id = $1 AND role = 'user'", [claim.user_id]);
      }
      await query("UPDATE claim_requests SET status='approved' WHERE id=$1", [id]);
    } else if (action === "reject") {
      if (!reason) throw new HttpError(400, "Un motif est obligatoire.");
      await query("UPDATE claim_requests SET status='rejected' WHERE id=$1", [id]);
    } else {
      throw new HttpError(400, "Action inconnue.");
    }
    await logAudit(req, user, `claim.${action}`, { objectType: "claim", objectId: id, after: { reason } });
    return ok(res, { message: action === "approve" ? "Revendication approuvée." : "Revendication refusée." });
  }

  /* -------------------------------------------------------------- entreprises */
  if (resource === "company") {
    if (!can(user, "companies.edit")) throw new HttpError(403, "Permission requise.");
    const company = await one("SELECT id, slug, publication_status, verification_level, name FROM companies WHERE slug = $1", [id])
      || await one("SELECT id, slug, publication_status, verification_level, name FROM companies WHERE id::text = $1", [id]);
    if (!company) throw new HttpError(404, "Entreprise introuvable.");

    if (action === "publish") {
      await query("UPDATE companies SET publication_status='published', deleted_at=NULL, updated_at=NOW() WHERE id=$1", [company.id]);
    } else if (action === "unpublish") {
      await query("UPDATE companies SET publication_status='draft', updated_at=NOW() WHERE id=$1", [company.id]);
    } else if (action === "suspend") {
      if (!reason) throw new HttpError(400, "Un motif de suspension est obligatoire.");
      await query("UPDATE companies SET publication_status='suspended', updated_at=NOW() WHERE id=$1", [company.id]);
    } else if (action === "archive") {
      await query("UPDATE companies SET publication_status='archived', updated_at=NOW() WHERE id=$1", [company.id]);
    } else if (action === "verify") {
      const level = Number(payload.level);
      if (![0, 1, 2].includes(level)) throw new HttpError(400, "Niveau de vérification invalide (0, 1 ou 2).");
      await query(
        `UPDATE companies SET verification_level=$2,
                verified_at = CASE WHEN $2 > 0 THEN NOW() ELSE NULL END,
                verification_expires_at = CASE WHEN $2 > 0 THEN NOW() + INTERVAL '12 months' ELSE NULL END,
                updated_at = NOW() WHERE id=$1`,
        [company.id, level]
      );
      await logAudit(req, user, "company.verify", {
        objectType: "company",
        objectId: company.slug,
        before: { level: company.verification_level },
        after: { level },
      });
      return ok(res, { message: level === 0 ? "Vérification retirée." : `Niveau ${level} accordé.` });
    } else if (action === "update") {
      const allowed = ["name", "description_short", "description_long", "address", "landmark", "legal_status"];
      const updates = [];
      const params = [company.id];
      for (const key of allowed) {
        if (payload[key] === undefined) continue;
        params.push(String(payload[key]).slice(0, 3000));
        updates.push(`${key} = $${params.length}`);
      }
      if (payload.contacts && typeof payload.contacts === "object") {
        params.push(JSON.stringify(payload.contacts));
        updates.push(`contacts = contacts || $${params.length}::jsonb`);
      }
      if (!updates.length) throw new HttpError(400, "Aucun champ à mettre à jour.");
      await query(`UPDATE companies SET ${updates.join(", ")}, updated_at=NOW() WHERE id=$1`, params);
    } else if (action === "purge_demo") {
      if (!can(user, "settings.write")) throw new HttpError(403, "Action réservée au super administrateur.");
      if (payload.confirm !== "SUPPRIMER") {
        throw new HttpError(400, "Saisissez SUPPRIMER pour confirmer la suppression des fiches d'exemple.");
      }
      const rows = await query("DELETE FROM companies WHERE provenance = 'exemple' RETURNING slug");
      await logAudit(req, user, "company.purge_demo", { after: { count: rows.length } });
      return ok(res, { message: `${rows.length} fiches d'exemple supprimées.`, count: rows.length });
    } else {
      throw new HttpError(400, "Action inconnue pour une entreprise.");
    }
    await logAudit(req, user, `company.${action}`, { objectType: "company", objectId: company.slug, after: { reason } });
    return ok(res, { message: "Fiche mise à jour." });
  }

  /* -------------------------------------------------------------------- offres */
  if (resource === "offer") {
    if (!can(user, "offers.moderate")) throw new HttpError(403, "Permission requise.");
    const offer = await one("SELECT id, slug, status FROM job_offers WHERE id = $1", [id]);
    if (!offer) throw new HttpError(404, "Offre introuvable.");
    if (action === "publish") {
      await query("UPDATE job_offers SET status='published', published_at=COALESCE(published_at, NOW()), updated_at=NOW() WHERE id=$1", [id]);
    } else if (action === "reject") {
      if (!reason) throw new HttpError(400, "Un motif est obligatoire.");
      await query("UPDATE job_offers SET status='rejected', updated_at=NOW() WHERE id=$1", [id]);
    } else if (action === "close") {
      await query("UPDATE job_offers SET status='closed', updated_at=NOW() WHERE id=$1", [id]);
    } else {
      throw new HttpError(400, "Action inconnue.");
    }
    await logAudit(req, user, `offer.${action}`, { objectType: "offer", objectId: offer.slug, after: { reason } });
    return ok(res, { message: "Offre mise à jour." });
  }

  /* ------------------------------------------------------------------- comptes */
  if (resource === "user") {
    if (!can(user, "users.manage")) throw new HttpError(403, "Permission requise.");
    const target = await one("SELECT id, email, role, status FROM users WHERE id = $1", [id]);
    if (!target) throw new HttpError(404, "Compte introuvable.");
    if (action === "suspend") {
      if (!reason) throw new HttpError(400, "Un motif est obligatoire.");
      if (target.role === "super_admin") throw new HttpError(403, "Ce compte ne peut pas être suspendu.");
      await query("UPDATE users SET status='suspended', updated_at=NOW() WHERE id=$1", [id]);
    } else if (action === "restore") {
      await query("UPDATE users SET status='active', updated_at=NOW() WHERE id=$1", [id]);
    } else if (action === "role") {
      if (user.role !== "super_admin") {
        throw new HttpError(403, "Seul un super administrateur peut changer les rôles.");
      }
      const role = requireOneOf(payload.role, ["user", "company", "moderator", "admin", "super_admin"], "Le rôle");
      if (target.id === user.id) throw new HttpError(400, "Vous ne pouvez pas modifier votre propre rôle.");
      await query("UPDATE users SET role=$2, updated_at=NOW() WHERE id=$1", [id, role]);
    } else {
      throw new HttpError(400, "Action inconnue.");
    }
    await logAudit(req, user, `user.${action}`, {
      objectType: "user",
      objectId: id,
      before: { status: target.status, role: target.role },
      after: { status: action === "suspend" ? "suspended" : action === "restore" ? "active" : payload.role },
    });
    return ok(res, { message: "Compte mis à jour." });
  }

  /* ------------------------------------------------------------------ réglages */
  if (resource === "settings") {
    if (!can(user, "settings.write")) throw new HttpError(403, "Permission requise.");
    const key = requireString(payload.key, { max: 60, label: "La clé" });
    if (!/^[a-z0-9_]+$/.test(key)) throw new HttpError(400, "Clé de réglage invalide.");
    const before = await one("SELECT value FROM settings WHERE key = $1", [key]);
    await setSetting(key, payload.value);
    await logAudit(req, user, "settings.update", {
      objectType: "settings",
      objectId: key,
      before: before?.value,
      after: payload.value,
    });
    return ok(res, { message: `Réglage « ${key} » enregistré.` });
  }

  /* ------------------------------------------------------------------ paiements */
  if (resource === "payment") {
    if (!can(user, "payments.read")) throw new HttpError(403, "Permission requise.");
    const payment = await one("SELECT * FROM payments WHERE id = $1", [id]);
    if (!payment) throw new HttpError(404, "Paiement introuvable.");
    if (action !== "refund") throw new HttpError(400, "Action inconnue.");
    await query("UPDATE payments SET status='refunded', updated_at=NOW() WHERE id=$1", [id]);
    if (payment.subscription_id) {
      await query("UPDATE subscriptions SET status='canceled' WHERE id = $1", [payment.subscription_id]);
    }
    await logAudit(req, user, "payment.refund", { objectType: "payment", objectId: id });
    return ok(res, { message: "Remboursement enregistré (simulation)." });
  }

  /* ------------------------------------------------------------------- messages */
  if (resource === "message") {
    if (!can(user, "content.write")) throw new HttpError(403, "Permission requise.");
    await query("UPDATE contact_messages SET status='archived' WHERE id=$1", [id]);
    return ok(res, { message: "Message archivé." });
  }

  throw new HttpError(400, "Ressource inconnue.");
});
