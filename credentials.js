// ============================================================================
//  CONGLOMERAT — Identifiants du compte administrateur
// ============================================================================
//  ⚠️  À LIRE :
//  - Ce fichier est lu UNIQUEMENT côté serveur (fonctions /api/*). Il n'est
//    jamais servi au navigateur : il vit à la racine du projet, en dehors de
//    public/, donc inaccessible par URL.
//  - Il est versionné parce que le projet l'exige, mais un mot de passe en clair
//    dans Git n'est PAS un secret. Avant une mise en production :
//      1. Change le mot de passe ci-dessous (12 caractères minimum).
//      2. Ou, mieux : définis ADMIN_EMAIL et ADMIN_PASSWORD dans les variables
//         d'environnement Vercel — elles ont la priorité sur ce fichier.
//  - Ces identifiants ouvrent la connexion sur la page /login normale (même
//    formulaire que les utilisateurs). Le rôle décide de la redirection vers
//    /admin. Aucun lien public ne mène à /admin.
//  - Le compte est reconnu même si la base de données est vide : c'est le
//    compte de secours (super administrateur).
// ============================================================================

export const CREDENTIALS = {
  superAdmin: {
    email: "admin@conglomerat.cm",
    password: "Conglomerat!2026",
    name: "Administrateur CONGLOMERAT",
  },
};

// Vérification de la robustesse, utile en développement.
const MIN_PASSWORD_LENGTH = 12;
if (CREDENTIALS.superAdmin.password.length < MIN_PASSWORD_LENGTH) {
  console.warn(
    `[credentials] Le mot de passe administrateur fait moins de ${MIN_PASSWORD_LENGTH} caractères.`
  );
}

export default CREDENTIALS;
