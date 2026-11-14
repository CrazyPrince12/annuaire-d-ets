/**
 * GET /api/home — données de la page d'accueil.
 * Une section vide côté données ne doit pas s'afficher : le front masque toute
 * liste de moins de 3 éléments (règle du cahier, appliquée dans le JS).
 */
import { handler, ok, requireMethod } from "./_lib/http.js";
import { homeData } from "./_lib/repo.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const data = await homeData();
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=120, stale-while-revalidate=300");
  return ok(res, data);
});
