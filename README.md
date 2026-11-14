# CONGLOMERAT

**L'annuaire des entreprises du Cameroun.** Des fiches vérifiées (adresse, téléphone, horaires),
des avis modérés écrits par des employés et des stagiaires, une carte, un comparateur et des
offres d'emploi — sans framework, sans build, sans dépendance à un service de cartes payant.

- **Production** : <https://conglomerat.cm> (application statique + fonctions serverless)
- **Base** : Neon (PostgreSQL) en production, PGlite en mémoire pour la démonstration locale
- **Licence** : MIT

---

## Démarrage

```bash
npm install          # dépendances (aucune compilation)
npm run dev          # http://localhost:3000 — base de démonstration chargée en mémoire
```

La démonstration démarre sans configuration : `56` entreprises, `94` avis et `35` offres sont
chargés à chaque démarrage (les écritures sont perdues à l'arrêt, c'est voulu).

Pour brancher une vraie base :

```bash
cp .env.example .env      # puis renseigner DATABASE_URL
npm run db:init           # crée le schéma
npm run db:seed           # charge les données de démonstration
npm run db:check          # contrôles d'intégrité
```

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` / `npm start` | Serveur local (`dev.mjs`) : applique les réécritures de `vercel.json`, sert `/api/*` et `public/`. |
| `npm run check` | Vérifications statiques : syntaxe, i18n FR/EN, icônes, imports, réécritures, schéma. |
| `npm run smoke` | Fumée DOM : initialise les 19 pages dans un DOM simulé et échoue à la moindre exception. |
| `npm run db:init` | Applique `db/schema.sql` sur la base cible. |
| `npm run db:seed` | Charge `data/seed` (idempotent). |
| `npm run db:check` | Contrôle d'intégrité des données (publication, notes, téléphones, offres). |
| `npm run assets` | Régénère logos, favicons et image Open Graph (`sharp`). |
| `npm run icons` | Régénère `public/assets/js/core/icons.js` depuis `lucide-static` (130 icônes). |
| `npm run vendor` | Recopie MapLibre GL dans `public/assets/vendor`. |

Le schéma est **double** : `db/schema.sql` fait foi et `db/schema.mjs` en est la version
embarquée. Après toute modification du SQL :

```bash
node scripts/gen-schema.mjs   # ou npm run db:schema
npm run check                 # vérifie que les deux versions sont cohérentes
```

## Variables d'environnement

Toutes sont facultatives en local. **En production, `DATABASE_URL` et `AUTH_SECRET` sont
obligatoires** : le mode démonstration (PGlite) n'est pas embarqué dans les fonctions
serverless — voir la note de déploiement ci-dessous.

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | — | Chaîne Neon. Absente = PGlite en mémoire (démo, **local uniquement**). |
| `AUTH_SECRET` | généré | Clé de signature des cookies de session. **À définir en production.** |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `credentials.js` | Surcharge du compte super administrateur. |
| `PAYMENT_MODE` | `demo` | Paiement Mobile Money simulé (code `123456`). |
| `MAIL_MODE` | `demo` | `live` + `RESEND_API_KEY` pour de vrais e-mails. |
| `RESEND_API_KEY`, `MAIL_FROM`, `STAFF_EMAIL` | — | Envoi d'e-mails (accusés, notifications de modération). |

## Structure

```
api/                    Fonctions serverless (une par route)
  _lib/                 texte, validation, auth JWT, base, mailer, HTTP
  admin/                data.js (lectures) · actions.js (écritures + audit)
  companies/[slug].js   Offres, avis, carte, me-*, billing, enterprise…
data/seed/              Données de démonstration (entreprises, avis, offres)
db/                     schema.sql (source) · schema.mjs (généré) · load.mjs
public/
  *.html                Une coquille statique par route (chrome injecté par nav.js)
  assets/css/           tokens · base · components · pages
  assets/js/core/       config, i18n, api, ui, nav, recherche, carte, favoris…
  assets/js/pages/      Un module par page, chargé dynamiquement via body[data-page]
scripts/                check, db-check, build-assets, gen-icons, gen-schema, vendor
dev.mjs                 Serveur local sans dépendance, miroir de vercel.json
```

## API

Toutes les réponses suivent `{ ok: true, data }` ou `{ ok: false, error, details }`.

| Route | Méthodes | Rôle |
| --- | --- | --- |
| `/api/companies` | GET | Recherche filtrée (q, ville, secteur, contrat, note, tri…). |
| `/api/companies/:slug` | GET | Fiche complète : avis, offres, similaires, secteurs. |
| `/api/offers`, `/api/offers/:slug` | GET | Offres d'emploi et détail. |
| `/api/home`, `/api/meta`, `/api/map`, `/api/reputation` | GET | Données d'accueil, villes/secteurs, carte (bbox), classements. |
| `/api/suggest`, `/api/events` | GET/POST | Autocomplétion, mesure d'audience agrégée. |
| `/api/reviews`, `/api/contributions`, `/api/reports`, `/api/claims` | POST | Contributions et modération. |
| `/api/apply` | POST | Candidature à une offre. |
| `/api/auth` | GET/POST | Session, connexion, inscription, mot de passe oublié/réinitialisé. |
| `/api/me`, `/api/me-*` | GET/PATCH/DELETE | Compte : profil, favoris, alertes, suivi, avis. |
| `/api/enterprise` | GET/PATCH/POST | Espace entreprise : fiches, offres, revendications. |
| `/api/admin/data`, `/api/admin/actions` | GET/POST | Administration (journal d'audit systématique). |
| `/api/billing` | GET/POST | Offre premium, paiement Mobile Money simulé. |
| `/api/og` | GET | Image de partage SVG 1200×630 (entreprise ou générique). |
| `/api/sitemap`, `/api/llms`, `/api/health` | GET | SEO, résumé pour agents, état du service. |

## Comptes de démonstration

| Rôle | Identifiants | Redirection |
| --- | --- | --- |
| Candidat | `demo@conglomerat.cm` / `Demo!2026conglomerat` | `/compte` |
| Entreprise | `entrepriseconglomerat@conglomerat.cm` / `Entreprise!2026` | `/espace-entreprise` |
| Modérateur | `moderateur@conglomerat.cm` / `Moderateur!2026` | `/admin` |
| Super administrateur | `admin@conglomerat.cm` / `Conglomerat!2026` | `/admin` |

Le bouton de chaque carte de démonstration remplit et soumet le formulaire.

## Déploiement

1. Importer le dépôt dans Vercel (aucune étape de build : `vercel.json` pointe sur `public/`).
2. Créer une base Neon et renseigner `DATABASE_URL`, `AUTH_SECRET` (obligatoire),
   éventuellement `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `RESEND_API_KEY`.
3. `npm run db:init` puis, si l'on veut la démo en ligne, `npm run db:seed`.
4. Vérifier `/api/health` : `{ ok: true, mode: "neon", companies: n }`.

Les en-têtes de sécurité (nosniff, frame-options, referrer-policy, permissions-policy) et le
`noindex` de `/admin` sont déclarés dans `vercel.json`.

### Pourquoi `DATABASE_URL` est indispensable sur Vercel

Le mode démonstration s'appuie sur PGlite, qui embarque un binaire WebAssembly de 13,5 Mo
(`postgres.wasm` + `postgres.data`). Traçé par le bundler de Vercel, ce binaire était recopié
dans **chacune** des 41 fonctions serverless (≈ 540 Mo au total) : le build passait, puis le
déploiement échouait à l'étape « Deploying outputs… ».

`api/_lib/db.js` charge donc PGlite par un spécificateur calculé, invisible du bundler : chaque
fonction est passée de **14,5 Mo à 0,5 Mo**. En contrepartie, sans `DATABASE_URL` la base n'existe
pas en ligne — l'API répond alors `503` avec un message explicite (« Définissez DATABASE_URL… »)
au lieu d'une erreur 500, et `/api/health` renvoie `database: "unconfigured"`.

Autres garde-fous de `vercel.json` : `maxDuration: 10` (limite des fonctions Node du plan Hobby ;
une valeur supérieure fait refuser le déploiement). `npm run check` vérifie que ni PGlite ni
`sharp` ne sont réimportés statiquement dans `api/` (contrôle « Poids des fonctions »).

## Qualité

- `npm run check` : 11 contrôles statiques (dont 885 clés i18n en FR **et** EN, et le poids
  des fonctions serverless).
- `npm run smoke` : 19 pages initialisées dans un DOM simulé (`linkedom`), sans navigateur.
- `npm run db:check` : 27 contrôles d'intégrité.
- Accessibilité : navigation clavier, `aria-*` explicites, contrastes contrôlés, `prefers-reduced-motion`.
- Performance : aucune étape de build, CSS critique unique, polices `woff2` locales, MapLibre
  chargé uniquement sur `/carte` (repli liste sans WebGL).
- Données de démonstration clairement signalées (`provenance = 'exemple'`, badge « exemple »).

## Licence

MIT © 2026 CrazyPrince12. Les icônes Lucide sont sous licence ISC ; Manrope et Inter sous SIL OFL.
