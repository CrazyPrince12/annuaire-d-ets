/** GET /api/companies — liste filtrée, triée et paginée. */
import { handler, ok, parseFilters, requireMethod } from "./_lib/http.js";
import { interpretQuery } from "./_lib/interpret.js";
import { listCompanies, metaData, searchCompanies } from "./_lib/repo.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const filters = parseFilters(req.query);
  const options = {
    limit: filters.perPage,
    offset: (filters.page - 1) * filters.perPage,
  };

  let result = null;
  let interpretation = null;

  if (filters.q) {
    // 1) recherche stricte : tous les mots doivent correspondre
    const strict = await listCompanies(filters, options);
    if (strict.total > 0) result = { ...strict, relaxed: false, correctedQuery: null };

    // 2) si peu de résultats, on comprend la phrase (« stage comptable bonamoussadi »)
    if (strict.total <= 2) {
      const referentials = await metaData();
      const parsed = interpretQuery(filters.q, referentials);
      const recognized =
        (parsed.filters.cities?.length || 0) +
        (parsed.filters.sectors?.length || 0) +
        (parsed.filters.neighborhoods?.length || 0) +
        (parsed.filters.internships ? 1 : 0);
      if (recognized > 0) {
        const retry = await listCompanies(
          { ...filters, ...parsed.filters, q: parsed.residual || undefined },
          options
        );
        if (retry.total > 0 || recognized >= 2) {
          result = { ...retry, relaxed: true, correctedQuery: null };
          interpretation = parsed.chips;
        }
      }
    }

    // 3) correction orthographique puis recherche élargie
    if (!result || result.total === 0) {
      const fallback = await searchCompanies(filters, options);
      if (!result || fallback.total > result.total) {
        result = { ...fallback, interpretation: undefined };
      }
    }
  } else {
    result = await searchCompanies(filters, options);
  }

  return ok(res, {
    ...result,
    interpretation,
    filters: {
      q: filters.q,
      cities: filters.cities,
      sectors: filters.sectors,
      sort: filters.sort,
    },
  });
});
