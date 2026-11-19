/**
 * GET /api/companies/:slug
 * Tout ce dont la fiche entreprise a besoin en un appel :
 * identité, contacts, horaires, agrégats d'avis, avis, offres, similaires.
 */
import { getSettings } from "../_lib/db.js";
import { handler, ok, requireMethod, HttpError } from "../_lib/http.js";
import {
  companyOffers,
  companyReviewSummary,
  companyReviews,
  companySectorList,
  getCompanyBySlug,
  similarCompanies,
} from "../_lib/repo.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const slug = String(req.query.slug || "").trim();
  if (!slug) throw new HttpError(400, "Slug manquant.");

  const company = await getCompanyBySlug(slug);
  if (!company) throw new HttpError(404, "Cette entreprise n'existe pas ou n'est plus publiée.");
  if (company.publicationStatus !== "published") {
    throw new HttpError(410, "Cette fiche a été retirée de l'annuaire.");
  }

  const [settings, summary, reviews, offers, similar, sectors] = await Promise.all([
    getSettings(),
    companyReviewSummary(company.id),
    companyReviews(company.id, { limit: 12, sort: "helpful" }),
    companyOffers(company.id),
    similarCompanies(company, 6),
    companySectorList(slug),
  ]);

  const minReviews = settings.min_reviews_for_rating ?? 3;
  return ok(res, {
    company: {
      ...company,
      rating: summary.total >= minReviews ? summary.average : null,
      ratingCount: summary.total,
    },
    summary,
    minReviews,
    reviews,
    offers,
    similar,
    sectors,
    demoDataset: company.provenance === "exemple",
  });
});
