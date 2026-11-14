# CONGLOMERAT

**L'annuaire des entreprises du Cameroun.** Des fiches vérifiées (adresse, téléphone, horaires),
des avis modérés écrits par des employés et des stagiaires, une carte, un comparateur et des
offres d'emploi — avec un serveur Express, sans compilation frontend, sans dépendance à un service de cartes payant.

- **Production** : <https://conglomerat.cm> (application Express : pages HTML + API)
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
| `npm run dev` / `npm start` | Application Express (`server.js`) : sert `/api/*` et `public/` ; même routage sur Render et Vercel. |
| `npm run check` | Vérifications statiques : syntaxe, i18n FR/EN, icônes, imports, réécritures, schéma. |
| `npm run smoke` | Fumée DOM : initialise les 19 pages dans un DOM simulé + contrôle du chrome partagé, et échoue à la moindre exception. |
| `npm run db:init` | Applique `db/schema.sql` sur la base cible. |
| `npm run db:seed` | Charge `data/seed` (idempotent). |
| `npm run db:check` | Contrôle d'intégrité des données (publication, notes, téléphones, offres). |
| `npm run assets` | Régénère logos, favicons et image Open Graph (`sharp`). |
| `npm run icons` | Régénère `public/assets/js/core/icons.js` depuis `lucide-static` (131 icônes). |
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
server-api/             Fonctions serverless (une par route)
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
server.js               Application Express exportée (Vercel) et serveur HTTP (Render)
server-api/             Handlers API et helpers (hors du dossier spécial api de Vercel)
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

### Version Node

Utiliser **Node 22.x**, fixée dans `package.json` et `.nvmrc`, plutôt qu'une plage
ouverte (`>=20.11`) ou Node 26. Le développement et les tests utilisent Node 22.

### Vercel

1. Importer le dépôt, avec la racine du dépôt comme **Root Directory**.
2. Sélectionner le preset **Express** (également déclaré dans `vercel.json`).
   Supprimer les anciens overrides **Output Directory = public** et les éventuelles
   commandes personnalisées. Le script de build ne fait que vérifier le code.
3. Configurer Node **22.x** et les variables `DATABASE_URL`, `AUTH_SECRET`, `SITE_URL`,
   puis les variables facultatives de `.env.example`.
4. Initialiser Neon avec `npm run db:init` ; `npm run db:seed` est facultatif.
5. Déployer le nouveau commit (pas simplement relancer l'ancien déploiement), puis
   vérifier `/`, `/explorer`, `/api/health` et une fiche entreprise.

Vercel détecte l'export Express de `server.js` et le transforme en une seule fonction.
Les anciens handlers sont dans `server-api/` pour ne plus produire une fonction par
fichier dans le dossier réservé `api/`. Les URL `/api/*` ne changent pas.
Les fichiers de `public/` peuvent être servis directement par le CDN Vercel ; Express
les sert également sur Render et en local. Aucun catch-all ne renvoie l'accueil à
la place d'une API inconnue : les erreurs restent de vraies 404.

### Render

Créer un **Web Service**, build `npm ci && npm run build`, démarrage `npm start`,
Node 22.x. Le serveur écoute sur `0.0.0.0` et le port fourni par `PORT`.
Configurer les mêmes variables de production que sur Vercel.

### Base de données

`DATABASE_URL` (Neon) est indispensable pour une base persistante en production.
PGlite est réservé à la démonstration locale en mémoire et chargé dynamiquement ;
il n'est pas embarqué par le bundler Vercel. Sans Neon, un déploiement Vercel peut
servir les pages mais l'API de données sera dégradée. `/api/health` expose cet état.
Les limites de débit en mémoire sont par instance, pas globales entre instances.

### Lecture des anciens logs

L'extrait du commit `eb45498` montre un build réussi puis « Deploying outputs… ».
Il ne contient pas le message final d'échec ; les avertissements `engines` ne
suffisent pas à en déterminer la cause. Les commits suivants avaient déjà retiré
PGlite du traçage des fonctions, mais n'avaient pas unifié le serveur.

## Qualité

- `npm run check` : 11 contrôles statiques (dont 885 clés i18n en FR **et** EN, et le poids
  des fonctions serverless).
- `npm run smoke` : 19 pages initialisées dans un DOM simulé (`linkedom`) + 1 contrôle du chrome
  partagé (en-tête minimal sur mobile, recherche et favoris présents dans le tiroir), sans navigateur.
- `npm run db:check` : 27 contrôles d'intégrité.
- Accessibilité : navigation clavier, `aria-*` explicites, contrastes contrôlés, `prefers-reduced-motion`.
- Performance : aucune étape de build, CSS critique unique, polices `woff2` locales, MapLibre
  chargé uniquement sur `/carte` (repli liste sans WebGL).
- Données de démonstration clairement signalées (`provenance = 'exemple'`, badge « exemple »).

## Licence

MIT © 2026 CrazyPrince12. Les icônes Lucide sont sous licence ISC ; Manrope et Inter sous SIL OFL.
