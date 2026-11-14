/**
 * Référentiel géographique de départ.
 * Les trois villes ouvertes au lancement sont les seules actives ; les autres
 * agglomérations du Cameroun peuvent être ajoutées depuis l'admin (is_active).
 * Coordonnées : centroïdes de quartier, précision volontairement approximative
 * (elles servent au placement des marqueurs, pas au porte-à-porte).
 */
export const cities = [
  {
    slug: "yaounde",
    name: "Yaoundé",
    region: "Centre",
    lat: 3.8667,
    lng: 11.5167,
    zoom: 12,
    sortOrder: 1,
    intro:
      "Capitale politique du Cameroun, Yaoundé concentre l'administration, les sièges d'institutions, les cabinets de conseil, les organisations internationales et un tissu dense de PME de services.",
    districts: [
      "Yaoundé I",
      "Yaoundé II",
      "Yaoundé III",
      "Yaoundé IV",
      "Yaoundé V",
      "Yaoundé VI",
      "Yaoundé VII",
    ],
    neighborhoods: [
      ["bastos", "Bastos", 3.8918, 11.5189, "Yaoundé II"],
      ["centre-ville", "Centre-ville", 3.8667, 11.5167, "Yaoundé I"],
      ["nlongkak", "Nlongkak", 3.8874, 11.519, "Yaoundé I"],
      ["essos", "Essos", 3.881, 11.525, "Yaoundé II"],
      ["mokolo", "Mokolo", 3.872, 11.503, "Yaoundé I"],
      ["tsinga", "Tsinga", 3.885, 11.507, "Yaoundé I"],
      ["ekie", "Ekie", 3.862, 11.496, "Yaoundé I"],
      ["ngoa-ekelle", "Ngoa-Ekelle", 3.862, 11.5, "Yaoundé I"],
      ["mvog-mbi", "Mvog-Mbi", 3.8567, 11.5231, "Yaoundé I"],
      ["mimboman", "Mimboman", 3.849, 11.54, "Yaoundé IV"],
      ["odza", "Odza", 3.789, 11.53, "Yaoundé VI"],
      ["biyem-assi", "Biyem-Assi", 3.825, 11.489, "Yaoundé VI"],
      ["mendong", "Mendong", 3.8167, 11.5, "Yaoundé VI"],
      ["ekounou", "Ekounou", 3.832, 11.51, "Yaoundé VI"],
      ["nsam", "Nsam", 3.8497, 11.506, "Yaoundé III"],
      ["etoudi", "Etoudi", 3.91, 11.51, "Yaoundé I"],
      ["omnisport", "Omnisport", 3.872, 11.535, "Yaoundé IV"],
      ["emana", "Emana", 3.872, 11.445, "Yaoundé III"],
      ["djoungolo", "Djoungolo", 3.875, 11.515, "Yaoundé I"],
      ["golf", "Golf", 3.8985, 11.5232, "Yaoundé II"],
    ],
  },
  {
    slug: "douala",
    name: "Douala",
    region: "Littoral",
    lat: 4.0511,
    lng: 9.7679,
    zoom: 12,
    sortOrder: 2,
    intro:
      "Capitale économique et premier port du pays, Douala rassemble la logistique, la banque, l'industrie, les télécoms et les sièges des grands groupes opérant en Afrique centrale.",
    districts: ["Douala I", "Douala II", "Douala III", "Douala IV", "Douala V"],
    neighborhoods: [
      ["bonanjo", "Bonanjo", 4.045, 9.69, "Douala I"],
      ["akwa", "Akwa", 4.053, 9.701, "Douala I"],
      ["bonapriso", "Bonapriso", 4.035, 9.698, "Douala I"],
      ["deido", "Deido", 4.065, 9.713, "Douala II"],
      ["new-bell", "New Bell", 4.056, 9.708, "Douala II"],
      ["kotto", "Kotto", 4.047, 9.718, "Douala II"],
      ["bepanda", "Bépanda", 4.063, 9.735, "Douala V"],
      ["makepe", "Makepe", 4.072, 9.75, "Douala V"],
      ["bonamoussadi", "Bonamoussadi", 4.095, 9.744, "Douala V"],
      ["cite-des-palmiers", "Cité des Palmiers", 4.07, 9.73, "Douala V"],
      ["bonaberi", "Bonabéri", 4.076, 9.66, "Douala IV"],
      ["logbaba", "Logbaba", 4.033, 9.762, "Douala III"],
      ["yassa", "Yassa", 4.018, 9.8, "Douala III"],
      ["japoma", "Japoma", 4.0, 9.83, "Douala III"],
    ],
  },
  {
    slug: "bafoussam",
    name: "Bafoussam",
    region: "Ouest",
    lat: 5.4781,
    lng: 10.417,
    zoom: 13,
    sortOrder: 3,
    intro:
      "Chef-lieu de la région de l'Ouest et carrefour commercial des hauts plateaux, Bafoussam vit de l'agro-industrie, du négoce, de la microfinance et des services de proximité.",
    districts: ["Bafoussam I", "Bafoussam II", "Bafoussam III"],
    neighborhoods: [
      ["centre", "Centre", 5.4781, 10.417, "Bafoussam I"],
      ["tamdja", "Tamdja", 5.47, 10.425, "Bafoussam I"],
      ["kamkop", "Kamkop", 5.485, 10.41, "Bafoussam II"],
      ["djeleng", "Djeleng", 5.48, 10.43, "Bafoussam II"],
      ["tougang", "Tougang", 5.47, 10.4, "Bafoussam I"],
      ["banengo", "Banengo", 5.466, 10.42, "Bafoussam III"],
      ["ndiangdam", "Ndiangdam", 5.49, 10.44, "Bafoussam II"],
      ["kouekong", "Kouekong", 5.5, 10.35, "Bafoussam III"],
      ["tyo-village", "Tyo-Village", 5.472, 10.44, "Bafoussam III"],
    ],
  },
];

/** Ordre et libellés des quartiers retenus pour la carte d'accueil. */
export const featuredNeighborhoods = [
  "bastos",
  "bonanjo",
  "bonamoussadi",
  "akwa",
  "centre-ville",
  "makepe",
];
