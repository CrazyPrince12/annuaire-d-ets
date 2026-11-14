/**
 * GET /api/offers — offres d'emploi et de stage.
 * Paramètres : q, ville, quartier, secteur, contrat, type=stage, niveau,
 *              experience, entreprise, verif=1, salaire=1, depuis=7, tri, page.
 * La route /stages arrive ici avec `type=stage`.
 */
import { handler, ok, parseFilters, requireMethod } from "./_lib/http.js";
import { searchOffers } from "./_lib/repo.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const base = parseFilters(req.query);
  const type = String(req.query.type || "");
  const filters = {
    ...base,
    contracts: base.contracts.length ? base.contracts : [],
    internshipsOnly: type === "stage" ? true : base.internships,
    education: String(req.query.niveau || req.query.education || ""),
    experience: String(req.query.experience || ""),
    company: String(req.query.entreprise || req.query.company || ""),
    verifiedOnly: req.query.verif === "verified" || req.query.verified === "1",
    salaryVisible: req.query.salaire === "1" || req.query.salary === "1",
    publishedDays: Number(req.query.depuis || req.query.publishedDays || 0) || 0,
    sort: String(req.query.tri || req.query.sort || "recentes"),
  };

  const result = await searchOffers(filters, {
    limit: base.perPage,
    offset: (base.page - 1) * base.perPage,
  });

  return ok(res, { ...result, filters });
});
