# CONGLOMERAT

**L'annuaire des entreprises du Cameroun.** Des fiches vérifiées (adresse, téléphone, horaires),
des avis modérés écrits par des employés et des stagiaires, une carte, un comparateur et des
offres d'emploi — avec un serveur Express, sans compilation frontend, sans dépendance à un service de cartes payant.

- **Production** : <https://conglomerat.cm> (application Express : pages HTML + API)
- **Base** : Neon ou PostgreSQL en production, PGlite en mémoire pour la démonstration locale
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
npm run db:seed           # facultatif, uniquement sur une base de test
npm run db:check          # contrôles d'intégrité
```

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` / `npm start` | Application Express (`server.js`) : sert `/api/*` et `public/` ; même routage sur Render et Vercel. |
| `npm run check` | Vérifications statiques : syntaxe, i18n FR/EN, icônes, imports, réécritures, schéma. |
| `npm run smoke` | Fumée DOM : initialise les 19 pages dans un DOM simulé + contrôle du chrome partagé, et échoue à la moindre exception. |
| `npm run db:init` | Applique `db/schema.sql` en transaction sur la base cible, sans importer de données. |
| `npm run db:seed` | Charge les données et comptes de démo (idempotent ; base de test uniquement). |
| `npm run db:check` | Contrôle d'intégrité des données (publication, notes, téléphones, offres). |
| `npm run assets` | Régénère logos, favicons et image Open Graph (`sharp`). |
| `npm run icons` | Régénère `public/assets/js/core/icons.js` depuis `lucide-static` (131 icônes). |
| `npm run vendor` | Régénère les fichiers navigateur locaux (MapLibre, GSAP, Three.js, Lenis). |
| `npm run test:postgres` | Intégration avec un PostgreSQL local jetable (migration, récupération, événements et statistiques). |

Le schéma est **double** : `db/schema.sql` fait foi et `db/schema.mjs` en est la version
embarquée. Après toute modification du SQL :

```bash
node scripts/gen-schema.mjs   # ou npm run db:schema
npm run check                 # vérifie que les deux versions sont cohérentes
```

## Variables d'environnement

Toutes sont facultatives en local. **En production, une URL PostgreSQL et `AUTH_SECRET` sont
obligatoires** : le mode démonstration (PGlite) n'est pas embarqué dans les fonctions
serverless — voir la note de déploiement ci-dessous.

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | `POSTGRES_URL` si définie | Chaîne PostgreSQL. Sans URL, PGlite n’est activé qu’en développement local. |
| `AUTH_SECRET` | généré | Clé de signature des cookies de session. **À définir en production.** |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `credentials.js` | Surcharge du compte super administrateur. |
| `PAYMENT_MODE` | `demo` | Paiement Mobile Money simulé (code `123456`). |
| `MAIL_MODE` | `demo` | `live` + `RESEND_API_KEY` pour de vrais e-mails. |
| `RESEND_API_KEY`, `MAIL_FROM`, `STAFF_EMAIL` | — | Envoi d'e-mails (accusés, notifications de modération). |

## Structure

```
server-api/             Handlers intégrés à l’application Express
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
| `/api/suggest` · `/api/events` | GET · POST | Autocomplétion · mesure d’audience agrégée (identifiant de répétition optionnel). |
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
4. Appliquer `npm run db:init` sur la base ciblée. Ne lancer `npm run db:seed` que sur une base de test.
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
Configurer les mêmes variables de production que sur Vercel. Si la base est un service
**Render Postgres**, utiliser son URL **interne** pour un service Render qui partage le
réseau privé ; depuis Vercel ou un poste externe, utiliser l’URL **externe** et les
règles d’accès/TLS du fournisseur. Ne pas désactiver la vérification des certificats.
Configurer le health check du Web Service sur `/healthz` : le processus reste sain
pendant le réveil de la base. `/api/health` contrôle séparément l’accès aux données.

### Diagnostic de la base

- Sur Neon (`*.neon.tech`), préférer l’URL **pooled** : le pilote envoie les requêtes en HTTPS.
  Une autre URL PostgreSQL utilise un petit pool TCP, sans WebSocket. Héberger l’application
  dans une région proche de la base réduit les allers-retours. `DATABASE_URL` a priorité
  sur `POSTGRES_URL`. Ne jamais mettre ces variables dans les assets publics.
- Sur Vercel, configurer la variable dans l’environnement réellement déployé (**Production**
  ou **Preview**), puis **redéployer**. Tester avec `curl -i https://<domaine>/api/health`.
- `/api/health` renvoie **200** si la base répond et que les tables principales sont là,
  sinon **503** avec un code court. Une base initialisée mais vide est saine (`companies: 0`).

| Code | Action |
| --- | --- |
| `missing_url` / `invalid_url` | Vérifier l’environnement, le format `postgresql://…` et l’encodage des caractères du mot de passe. |
| `schema_missing` | Exécuter `npm run db:init` avec la même base, puis vérifier `/api/health`. Le script corrigé ne saute plus les instructions précédées d’un commentaire. |
| `credentials` / `permissions` | Vérifier l’identifiant, la base, le mot de passe et les droits du rôle. |
| `connection` / `tls` | Vérifier réseau privé/externe, SSL, disponibilité du fournisseur et proximité des régions. |

L’accueil regroupe ses lectures sur Neon et peut être mis en cache par le CDN. Le navigateur
retente une seule fois une lecture transitoirement indisponible. Les vues ne sont plus écrites
lors du `GET` d’une fiche : `/api/events` enregistre la vue et incrémente le compteur dans une
seule requête. Une répétition avec le même UUID ne l’incrémente pas à nouveau. Les limites de
charge restent locales à chaque instance.

### Lecture des anciens logs

L'extrait du commit `eb45498` montre un build réussi puis « Deploying outputs… ».
Il ne contient pas le message final d'échec ; les avertissements `engines` ne
suffisent pas à en déterminer la cause. Les commits suivants avaient déjà retiré
PGlite du traçage des fonctions, mais n'avaient pas unifié le serveur.

## Qualité

- `npm run check` : 11 contrôles statiques (dont les clés i18n en FR **et** EN, et le poids
  des fonctions serverless).
- `npm run smoke` : 19 pages initialisées dans un DOM simulé (`linkedom`) + 1 contrôle du chrome
  partagé (en-tête minimal sur mobile, recherche et favoris présents dans le tiroir), sans navigateur.
- `npm run db:check` : 27 contrôles d'intégrité.
- Accessibilité : navigation clavier, `aria-*` explicites, contrastes contrôlés, `prefers-reduced-motion`.
- Performance : aucune étape de build, CSS critique unique, polices `woff2` locales, MapLibre
  chargé uniquement sur `/carte` (repli liste sans WebGL). L’aperçu Google Maps d’une fiche
  réelle est chargé seulement au clic ; le lien vers la carte de l’annuaire reste utilisable.
- Données de démonstration clairement signalées (`provenance = 'exemple'`, badge « exemple »).

## Références UX et choix de performance

- **UI/UX Pro Max et Design DNA** : l’accueil privilégie la recherche, puis l’exploration par
  ville. L’atlas garde les tokens de l’annuaire (vert et accent ambre, Manrope et Inter,
  contraste clair/sombre). Le formulaire mobile est visible et fonctionne comme formulaire GET.
- **Framer, UI Skills, Lucide et boutons 2026** : animation courte sans masquer le titre, verre
  dépoli limité à quelques surfaces et styles 1/5/7/12/15, plus le sceau 21 pour le Premium.
- **Three.js** : le bouton « Maquette 3D » est optionnel ; l’illustration responsive AVIF/WebP
  reste disponible si WebGL manque. La scène partage les géométries des bâtiments, limite la
  densité de pixels et redessine seulement à la rotation ou au redimensionnement. La maquette
  est illustrative ; les liens par ville et la vraie carte sont indépendants.
- **Mouvement** : CSS scroll-driven, View Transitions, IntersectionObserver et GSAP. Le réglage
  « Défilement fluide » de l’accueil active Lenis et ScrollTrigger à la demande sur ordinateur.
  Le défilement natif reste le défaut ; le réglage est désactivé en économie de données et
  lorsqu’une préférence de mouvement réduit est active. Aucun second moteur UI ou embed 3D.
- **France** : dans l’explorateur, un formulaire séparé cherche par dénomination, SIREN ou SIRET
  dans l’Annuaire officiel, ou ouvre la même requête dans Pappers. Aucune requête France n’est
  envoyée tant que l’utilisateur n’a pas choisi une source.

Le modèle `docs/verify-workflow.example.yml` peut être copié vers `.github/workflows/verify.yml`
par un mainteneur autorisé pour exécuter les tests en CI. Pour exécuter le même scénario en local,
démarrer une instance PostgreSQL de **test**, puis définir
`TEST_POSTGRES_URL=postgresql://utilisateur:mot_de_passe@127.0.0.1:5432/postgres` et lancer
`npm run test:postgres`. Le rôle doit pouvoir créer une base temporaire ; `DATABASE_URL`
n’est jamais utilisée comme cible de ce test.

## Licence

MIT © 2026 CrazyPrince12. Les icônes Lucide sont sous licence ISC ; Manrope et Inter sous SIL OFL. MapLibre GL JS est sous BSD-3-Clause ; GSAP est distribué selon sa licence standard ; Three.js et Lenis sont sous MIT.
