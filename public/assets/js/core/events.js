import { post } from "./api.js";

const views = new Map();
const seenKey = (slug) => `cg:seen:${slug}`;

function readSeen(slug) {
  try { return sessionStorage.getItem(seenKey(slug)); } catch { return null; }
}

function writeSeen(slug, value) {
  try { sessionStorage.setItem(seenKey(slug), value); } catch { /* mode privé */ }
}

export function trackContact(kind, companySlug) {
  // Le navigateur peut livrer le clic même s'il ouvre un autre site ou une app.
  const eventId = globalThis.crypto?.randomUUID?.();
  return post("/events", { kind, companySlug, eventId }, { keepalive: true, retry: Boolean(eventId) }).catch(() => null);
}

export function trackView(companySlug) {
  if (views.has(companySlug)) return views.get(companySlug);
  const seen = readSeen(companySlug);
  if (seen === "1") return;
  const eventId = seen || globalThis.crypto?.randomUUID?.();
  if (eventId) writeSeen(companySlug, eventId);
  const pending = post("/events", { kind: "view", companySlug, eventId }, {
    keepalive: true, retry: Boolean(eventId), // retry protégé par la clé UNIQUE en base
  }).then((result) => {
    if (result.accepted) writeSeen(companySlug, "1");
    else views.delete(companySlug);
  }).catch(() => { views.delete(companySlug); });
  views.set(companySlug, pending);
  return pending;
}
