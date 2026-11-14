/**
 * Ré-export de la configuration du site (source unique : `public/assets/js/core/config.js`).
 * Permet aux fonctions serverless d'utiliser `SITE_NAME` sans en dupliquer la valeur.
 */
export { SITE_NAME, SITE, UI, FEATURES, PALETTE } from "../../public/assets/js/core/config.js";
export { SITE as default } from "../../public/assets/js/core/config.js";
