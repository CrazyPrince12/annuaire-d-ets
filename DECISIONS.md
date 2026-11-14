# Décisions d'architecture

Journal des choix qui ne vont pas de soi. Chaque entrée indique le contexte, la décision et ce
qu'il faudrait changer pour revenir dessus.

---

### 1. Paiement Mobile Money simulé

**Contexte.** L'offre premium doit être démontrable sans contrat marchand MTN/Orange.
**Décision.** Tout le parcours (choix du plan → opérateur → confirmation) est réel côté interface
et base (`payments`, `subscriptions`), mais la validation du code est locale : `PAYMENT_MODE`
vaut `demo` et le PIN accepté est `123456`. Les montants sont en FCFA, les références
(`DEMO-2026-0001`) sont générées côté serveur.
**Pour revenir en arrière.** Remplacer la vérification du PIN dans `api/billing.js` par un appel
au PSP ; les tables et l'interface ne changent pas.

### 2. Compte super administrateur de secours

**Contexte.** Une installation neuve n'a aucun utilisateur, donc aucun moyen d'entrer dans
`/admin`.
**Décision.** `credentials.js` (à la racine, hors de `public/`, jamais servi au navigateur)
contient un compte de secours, surchargeable par `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Le fichier est
versionné pour que la démonstration fonctionne dès le clone ; son mot de passe est public et doit
impérativement être remplacé en production. Il ne vit pas en base : il est reconnu à la
connexion et reçoit le rôle `super_admin`. Une session admin expire en 8 h (7 jours pour les
autres rôles).

### 3. Entreprises réelles et fiches d'exemple

**Contexte.** Un annuaire vide ne démontre rien ; de vraies données sans vérification
tromperaient les visiteurs.
**Décision.** `data/seed/companies.real.mjs` contient 16 fiches documentées et
`companies.demo.mjs` 40 fiches marquées `provenance = 'exemple'`. Les fiches d'exemple portent
un badge visible, n'ont pas d'avis, et `POST /api/admin/actions {resource:"company",
action:"purge_demo"}` les supprime en une fois (confirmation `SUPPRIMER`).

### 4. Icônes SVG intégrées, pas de police d'icônes

**Décision.** `scripts/gen-icons.mjs` extrait 131 tracés de `lucide-static` et les embarque dans
`icons.js` (26 Ko, arbre de 24 × 24). Aucune requête réseau, aucun FOUT, `currentColor` partout.
Les icônes de marque (WhatsApp, LinkedIn, Facebook, Google, Instagram, `xBrand`) sont dessinées à la
main. La clé de la marque X porte un suffixe (`xBrand`) pour ne jamais écraser l'icône Lucide `x`,
qui est la croix de fermeture de tous les boutons « quitter » (voir décision 22).
Deux icônes manquantes dans Lucide (`maps`, `table-cells-large`) ont été remplacées par `map` et
`table-2`.

### 5. MapLibre GL 4.7.1 auto-hébergé, OpenFreeMap sans clé

**Contexte.** MapLibre 6 est ESM-only et casse un `<script>` classique ; la carte doit fonctionner
hors ligne de développement.
**Décision.** Version **4.7.1** recopiée par `npm run vendor`, style OpenFreeMap (sans clé ni
quota), marqueurs HTML. Si WebGL est absent, `supportsWebGL()` bascule sur une liste triée par
distance — même information, sans carte.

### 6. Une seule surface SQL pour deux moteurs

**Décision.** `api/_lib/db.js` expose `query`/`one` et choisit Neon (`@neondatabase/serverless`)
ou PGlite (`@electric-sql/pglite`) selon `DATABASE_URL`. Tout le SQL est écrit en PostgreSQL
standard : pas de fonction propriétaire, pas d'ORM. Les paramètres sont toujours `$1…$n`.
**Conséquence.** PGlite ne persiste pas : le mode démo recharge les données à chaque démarrage.

### 7. Pas d'étape de build, i18n dans un dictionnaire

**Décision.** Les pages sont des fichiers HTML statiques ; les modules ES sont servis tels quels.
Aucun bundler, donc aucun `dist/`. La traduction vit dans `public/assets/js/core/i18n.js`
(884 clés FR + 884 EN) ; le HTML porte des attributs `data-i18n`, le JS appelle `t("clé")`.
`npm run check` échoue si une clé utilisée manque dans l'une des deux langues.

### 8. Avis uniquement sur les fiches de démonstration

**Décision.** Aucun avis n'est inventé pour une entreprise réelle : les 94 avis de seeds portent
sur des slugs `provenance='exemple'`. Les entreprises réelles sans avis affichent « pas encore
d'avis » et masquent le bloc de notation (sinon `0/5` donnerait une fausse impression).

### 9. Téléphones de démonstration

**Décision.** Les fiches d'exemple utilisent `+2376000000NN` (NN = index), donc un numéro
manifestement fictif, jamais un vrai numéro camerounais. Le serveur normalise tout numéro en
`+237XXXXXXXXX` (`normalizeCameroonPhone`) et refuse le reste.

### 10. Sessions JWT en cookie HttpOnly, mots de passe scrypt

**Décision.** Aucun stockage de session en base : un JWT HS256 signé par `AUTH_SECRET`, posé en
cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production. Mots de passe hachés en scrypt
(`scrypt$N$r$p$sel$hash`) avec `timingSafeEqual`. Réinitialisation par jeton à usage unique :
seule l'empreinte SHA-256 est stockée (`password_resets`), validité 60 minutes.

### 11. Recherche en langage naturel interprétée côté serveur

**Décision.** `api/_lib/interpret.js` transforme « garage à Bafoussam pas cher » en filtres
(`secteur=garage`, `ville=bafoussam`) puis la recherche s'exécute en SQL. La réponse renvoie
`interpretation` et `relaxed` pour que l'interface explique ce qui a été compris. Correction
orthographique volontairement prudente (seuil ≥ 2 pour les mots de plus de 5 lettres, sinon
« dwala » devenait « douala »).

### 12. Facturation dans `api/billing.js`

**Décision.** Un seul fichier gère plans, abonnements et paiements plutôt que trois routes. Les
plans sont en base (seed) et non codés en dur. Le mode (`demo`) est renvoyé par l'API, l'interface
l'affiche.

### 13. Contrat de `/api/health`

**Décision.** `{ ok, mode: "neon"|"demo", companies, error? }`. `ok` reste vrai en mode démo :
la santé décrit la disponibilité du service, pas la présence d'une base distante. `db:check` et
la supervision peuvent ainsi l'utiliser tel quel.

### 14. Identité visuelle

**Décision.** Marque « C » : arc dégradé `#3FE39A → #22C07A → #0B8F55` et point jaune `#FFC83D`,
sur fond nocturne `#0B1310`. Typographie Manrope 800 pour les titres, Inter pour le texte, toutes
deux auto-hébergées en `woff2`. Le thème sombre est le défaut ; clair et « auto » sont proposés.

### 15. Interface bilingue dès le premier jour

**Décision.** FR par défaut, EN complet. Le choix est stocké en `localStorage` et appliqué avant
peinture par un script inline dupliqué dans chaque `<head>` (avec le thème), pour éviter tout
flash. `lang` et `data-lang` sont posés sur `<html>`.

### 16. Une coquille HTML par route, chrome injecté par JS

**Décision.** Chaque route a son fichier statique (bon titre, bonne description, bon canonical)
et déclenche **un** module via `body[data-page]`. Le header, le footer, le menu mobile et le
bandeau cookies sont injectés au chargement (`nav.js`), ce qui évite de dupliquer 200 lignes de
chrome dans 28 fichiers. Les pages sans module (mentions légales…) ont `data-page=""`.

### 17. Service worker limité à la coquille

**Décision.** Le SW met en cache CSS/JS/polices/icônes (`stale-while-revalidate`) et les pages
visitées (`network-first`). Les appels `/api/*` ne sont **jamais** servis depuis le cache : un
annuaire avec des horaires périmés serait pire qu'inutile. Hors ligne, on retombe sur la dernière
page connue ou `/hors-ligne`.

### 18. Vérifications statiques plutôt que tests unitaires

**Décision.** `scripts/check.mjs` vérifie ce qui casse réellement dans ce projet : clés i18n
manquantes, icônes inexistantes, imports morts, réécritures sans fichier, schéma désynchronisé,
textes de remplissage. `scripts/db-check.mjs` vérifie les invariants métier (notes synchronisées,
téléphones E.164, offres orphelines). Les deux tournent sans navigateur ni réseau, donc en CI.

### 19. Envoi d'e-mails désactivé par défaut

**Décision.** `MAIL_MODE=demo` par défaut : les messages sont journalisés et les parcours restent
complets (l'API de mot de passe oublié répond de façon identique dans tous les cas). En
production, `RESEND_API_KEY` active l'envoi réel sans changement de code.

### 20. Images de partage

**Décision.** Les balises `og:image` pointent sur un JPG statique (`og-default.jpg`) car les
robots sociaux n'exécutent pas JavaScript. `/api/og?slug=…` fournit en complément un SVG
1200 × 630 à jour (nom, ville, secteur, note) pour les usages qui chargent l'image dynamiquement.

### 21. PGlite hors des fonctions serverless

**Décision.** Le mode démonstration (PGlite, PostgreSQL en WebAssembly) reste un confort de
développement local, jamais un composant déployé. `api/_lib/db.js` l'importe par un
spécificateur calculé pour que le bundler de Vercel ne le trace pas.

**Pourquoi.** PGlite pèse 23 Mo, dont `postgres.wasm` (8,1 Mo) et `postgres.data` (5,4 Mo).
Le bundler le recopiait dans chaque fonction : 41 fonctions × 14,5 Mo ≈ 540 Mo d'artefacts,
le build réussissait (`Build Completed in /vercel/output`) puis le déploiement cassait à
« Deploying outputs… ». Chaque fonction fait désormais 0,5 Mo. `maxDuration` est ramené à 10 s,
plafond des fonctions Node du plan Hobby (15 s faisait refuser le déploiement).

**Conséquence.** En ligne, `DATABASE_URL` (Neon) est obligatoire. Sans elle, l'API répond 503
avec un message actionnable et `/api/health` affiche `database: "unconfigured"`. Le contrôle
« Poids des fonctions » de `npm run check` interdit la réapparition d'un import statique de
PGlite ou de `sharp` dans `api/`.

### 22. La clé d'icône `x` est la croix, jamais la marque

**Contexte.** Le générateur fusionnait les tracés Lucide et les marques dessinées à la main dans le
même objet : la marque « X » (ex-Twitter) écrasait silencieusement l'icône `x` de Lucide. Tous les
boutons de fermeture (tiroir, palette de recherche, toasts, bannières, puces de filtre) affichaient
donc le logo du réseau social — confus, et juridiquement sensible (marque déposée).

**Décision.** La marque est nommée `xBrand` dans `scripts/gen-icons.mjs`, `x` reste la croix de
Lucide. Le pied de page utilise `icon("xBrand")`. `npm run check` échoue si la clé `x` ne contient
plus le tracé de la croix ou si `xBrand` disparaît.

### 23. Barre du haut à trois paliers sur mobile

**Contexte.** Sur un téléphone de 360 px, la barre du haut alignait six contrôles (marque, recherche,
favoris, thème, langue, menu) : débordement horizontal, donc page qui glisse latéralement. Et le
bouton de recherche de l'en-tête doublonnait celui du héros d'accueil.

**Décision.** Trois paliers explicites dans `components.css` :

- **< 768 px** : marque + bouton menu seulement. Recherche, favoris, thème, langue et compte vivent
  dans le tiroir (qui gagne une entrée « Rechercher » et un lien « Favoris »).
- **768–1023 px** : recherche + outils secondaires (` .header-tools`), navigation encore dans le
  tiroir — la barre était déjà saturée à 768 px avec les cinq liens.
- **≥ 1024 px** : barre complète : navigation, recherche, outils ; entre 1024 et 1279 px, espacements
  et largeurs sont compactés pour tenir sur une ligne.

`html { overflow-x: clip }` sert de filet de sécurité (contrairement à `hidden`, `clip` préserve le
`position: sticky` de l'en-tête et de la barre d'onglets). `npm run smoke` vérifie le chrome :
`.header-tools` présent, aucun `.search-mobile-btn` dans l'en-tête, recherche et favoris dans le
tiroir.
