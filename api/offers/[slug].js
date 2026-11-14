/** GET /api/offers/:slug — détail d'une offre + entreprise + offres proches. */
import { handler, ok, requireMethod, HttpError } from "../_lib/http.js";
import { companyOffers, getCompanyBySlug, getOfferBySlug, listOffers } from "../_lib/repo.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const slug = String(req.query.slug || "").trim();
  if (!slug) throw new HttpError(400, "Slug manquant.");

  const offer = await getOfferBySlug(slug);
  if (!offer) throw new HttpError(404, "Cette offre n'existe pas ou a été retirée.");

  const company = await getCompanyBySlug(offer.company.slug);
  const [others, similar] = await Promise.all([
    company ? companyOffers(company.id, 5) : Promise.resolve([]),
    listOffers({ sectors: offer.sector ? [offer.sector.slug] : [], limit: 4 }, { limit: 4 }),
  ]);

  return ok(res, {
    offer,
    company: company
      ? {
          slug: company.slug,
          name: company.name,
          short: company.short,
          verified: company.verified,
          provenance: company.provenance,
          city: company.city,
          neighborhood: company.neighborhood,
          rating: company.rating,
          ratingCount: company.ratingCount,
          logoColor: company.sector?.color,
          contacts: company.contacts,
          hours: company.hours,
        }
      : null,
    otherOffers: others.filter((item) => item.slug !== slug),
    similarOffers: similar.items.filter((item) => item.slug !== slug).slice(0, 4),
  });
});
