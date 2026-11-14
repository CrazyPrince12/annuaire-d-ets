/** POST /api/contact — message au support (visible dans l'admin). */
import { query } from "./_lib/db.js";
import { enforceRateLimit, getIp, handler, ok, readBody, requireMethod } from "./_lib/http.js";
import { optionalString, requireEmail, requireString } from "./_lib/validate.js";
import { sendMail, staffNotice } from "./_lib/mailer.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "POST")) return;
  enforceRateLimit(`contact:${getIp(req)}`, { max: 5, windowMs: 3600_000 });

  const body = await readBody(req);
  const name = requireString(body.name, { min: 2, max: 80, label: "Le nom" });
  const email = requireEmail(body.email, "L'adresse e-mail");
  const subject = optionalString(body.subject, { max: 140 });
  const message = requireString(body.message, { min: 20, max: 4000, label: "Le message" });

  await query(
    "INSERT INTO contact_messages (name, email, subject, message) VALUES ($1,$2,$3,$4)",
    [name, email, subject, message]
  );

  await sendMail(
    staffNotice({
      subject: `Message de ${name}`,
      text: `${subject || "Sans sujet"} — ${message.slice(0, 400)}`,
      href: "/admin#messages",
    })
  );

  return ok(
    res,
    {
      message:
        "Message reçu. Nous répondons sous deux jours ouvrés. Pour une urgence liée à une offre, utilisez le bouton Signaler de la page concernée.",
    },
    201
  );
});
