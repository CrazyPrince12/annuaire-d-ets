/** Constantes métier partagées par les pages (miroir de api/_lib/validate.js). */

export const CONTRACTS = [
  "cdi",
  "cdd",
  "stage_academique",
  "stage_professionnel",
  "stage_pre_emploi",
  "freelance",
  "interim",
];

export const RELATIONSHIPS = [
  "current_employee",
  "former_employee",
  "current_intern",
  "former_intern",
  "candidate",
  "customer_partner",
];

export const CRITERIA = ["work_env", "management", "conditions", "pay", "growth"];

/** Motifs de signalement acceptés par /api/reports. */
export const REPORT_REASONS = [
  "adresse_incorrecte",
  "numero_errone",
  "entreprise_inexistante",
  "entreprise_fermee",
  "usurpation_identite",
  "informations_trompeuses",
  "contenu_inapproprie",
  "doublon",
  "offre_suspecte",
  "autre",
];
