/**
 * Envoi d'e-mails transactionnels.
 *
 * Trois modes, choisis par variables d'environnement :
 *   - `MAIL_MODE=demo` (défaut) : rien n'est envoyé, le message est écrit dans
 *     la console. C'est le mode des environnements de démonstration.
 *   - `RESEND_API_KEY` défini : envoi HTTP via l'API Resend.
 *   - `SMTP_URL` défini : non pris en charge ici (à brancher sur un relais
 *     externe) — on retombe alors en mode journal avec un avertissement.
 *
 * Aucune erreur d'envoi ne doit casser une requête métier : `sendMail` renvoie
 * toujours `{ sent, mode, id?, error? }` et journalise.
 */

import { SITE } from "./site.js";

const FROM = process.env.MAIL_FROM || `CONGLOMERAT <bonjour@conglomerat.cm>`;
const MODE = (process.env.MAIL_MODE || (process.env.RESEND_API_KEY ? "live" : "demo")).toLowerCase();

export function mailerMode() {
  return MODE === "live" && process.env.RESEND_API_KEY ? "live" : "demo";
}

export function mailerConfigured() {
  return mailerMode() === "live";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Gabarit minimal, lisible dans tous les clients de messagerie. */
export function layout({ title, body, cta }) {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.href)}"
         style="background:#22C07A;color:#04140c;padding:12px 18px;border-radius:10px;
                text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="fr"><body style="margin:0;background:#0B1310;color:#EAF3EE;font-family:Inter,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="font-size:12px;letter-spacing:.14em;color:#8FA79B;text-transform:uppercase">
      ${escapeHtml(SITE.name)}
    </p>
    <h1 style="font-size:22px;margin:8px 0 16px">${escapeHtml(title)}</h1>
    <div style="font-size:15px;line-height:1.65;color:#C7D6CE">${body}</div>
    ${button}
    <p style="margin-top:32px;font-size:12px;color:#7B9088">
      Vous recevez ce message parce qu'une action a été demandée avec cette adresse sur
      ${escapeHtml(SITE.url)}. Si vous n'êtes pas à l'origine de cette demande, ignorez-le.
    </p>
  </div>
</body></html>`;
}

async function viaResend({ to, subject, text, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status} ${detail.slice(0, 180)}`);
  }
  const payload = await response.json().catch(() => ({}));
  return payload.id || null;
}

/**
 * Envoie un e-mail.
 * @param {{to:string, subject:string, text:string, html?:string}} message
 * @returns {Promise<{sent:boolean, mode:string, id?:string|null, error?:string}>}
 */
export async function sendMail({ to, subject, text, html }) {
  if (!to || !subject) {
    return { sent: false, mode: "demo", error: "destinataire ou sujet manquant" };
  }
  const mode = mailerMode();
  if (mode !== "live") {
    console.info(`[mail] (démo) → ${to} · ${subject}`);
    return { sent: false, mode: "demo" };
  }
  try {
    const id = await viaResend({ to, subject, text, html: html || layout({ title: subject, body: `<p>${escapeHtml(text)}</p>` }) });
    return { sent: true, mode, id };
  } catch (error) {
    console.warn(`[mail] échec d'envoi à ${to} :`, error.message);
    return { sent: false, mode, error: error.message };
  }
}

/** Lien de réinitialisation de mot de passe. */
export function passwordResetMail({ email, token, minutes = 60 }) {
  const href = `${SITE.url}/login?reset=${encodeURIComponent(token)}`;
  return {
    to: email,
    subject: "Réinitialisation de votre mot de passe — CONGLOMERAT",
    text:
      `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable ${minutes} minutes) :\n${href}\n\n` +
      "Si vous n'avez rien demandé, ignorez cet e-mail : votre mot de passe reste inchangé.",
    html: layout({
      title: "Réinitialiser votre mot de passe",
      body: `<p>Vous avez demandé à changer votre mot de passe. Le lien ci-dessous est valable
        ${minutes} minutes et ne peut servir qu'une fois.</p>`,
      cta: { href, label: "Choisir un nouveau mot de passe" },
    }),
  };
}

/** Accusé de réception d'une contribution. */
export function contributionReceipt({ email, name }) {
  return {
    to: email,
    subject: "Votre fiche est entre nos mains — CONGLOMERAT",
    text:
      `Merci pour la fiche « ${name} ». Notre équipe vérifie l'adresse et le téléphone ` +
      "avant publication (objectif : 48 heures). Vous recevrez un message à la publication.",
    html: layout({
      title: "Merci, la fiche est en modération",
      body: `<p>Nous vérifions la fiche « <strong>${escapeHtml(name)}</strong> » : adresse, numéro et
        secteur. Objectif : 48 heures.</p>`,
      cta: { href: `${SITE.url}/contribuer`, label: "Proposer une autre fiche" },
    }),
  };
}

/** Notification interne (nouvelle revendication, signalement, message). */
export function staffNotice({ subject, text, href }) {
  return {
    to: process.env.STAFF_EMAIL || "moderation@conglomerat.cm",
    subject: `[modération] ${subject}`,
    text: href ? `${text}\n\n${SITE.url}${href}` : text,
    html: layout({ title: subject, body: `<p>${escapeHtml(text)}</p>`, cta: href ? { href: `${SITE.url}${href}`, label: "Ouvrir dans l'administration" } : null }),
  };
}

export default { sendMail, mailerMode, mailerConfigured, layout, passwordResetMail, contributionReceipt, staffNotice };
