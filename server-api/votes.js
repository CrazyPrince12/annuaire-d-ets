/**
 * POST /api/votes  { reviewId } — marque un avis comme utile (bascule).
 * Un seul vote par compte et par avis.
 */
import { one, query } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import { handler, ok, readBody, requireMethod, HttpError } from "./_lib/http.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req);
  const body = await readBody(req);
  const reviewId = String(body.reviewId || "");
  if (!/^[0-9a-f-]{36}$/i.test(reviewId)) throw new HttpError(400, "Avis invalide.");

  const review = await one("SELECT id, status FROM reviews WHERE id = $1", [reviewId]);
  if (!review || review.status !== "published") throw new HttpError(404, "Avis introuvable.");

  const existing = await one("SELECT 1 AS found FROM review_votes WHERE review_id = $1 AND user_id = $2", [
    reviewId,
    user.id,
  ]);

  if (existing) {
    await query("DELETE FROM review_votes WHERE review_id = $1 AND user_id = $2", [reviewId, user.id]);
    await query("UPDATE reviews SET helpful_count = GREATEST(helpful_count - 1, 0) WHERE id = $1", [reviewId]);
  } else {
    await query("INSERT INTO review_votes (review_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [
      reviewId,
      user.id,
    ]);
    await query("UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = $1", [reviewId]);
  }

  const updated = await one("SELECT helpful_count FROM reviews WHERE id = $1", [reviewId]);
  return ok(res, {
    voted: !existing,
    helpfulCount: updated.helpful_count,
    message: existing ? "Vote retiré." : "Merci, votre vote aide les autres.",
  });
});
