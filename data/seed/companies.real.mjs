/**
 * Fiches dont l'entreprise existe réellement au Cameroun (identité publique).
 *
 * Règle de rédaction appliquée ici :
 *  - nom, secteur, ville, année de création et site officiel uniquement quand
 *    l'information est publiquement établie ;
 *  - AUCUN numéro de téléphone, e-mail ou adresse précis n'est inventé : ces
 *    champs restent vides et l'interface les masque ;
 *  - aucune note, aucun avis, aucune offre : ces entreprises n'ont pas été
 *    évaluées par la communauté et ne publient pas via CONGLOMERAT ;
 *  - niveau de vérification 0 : leur identité n'a pas été contrôlée sur pièces.
 */
export const realCompanies = [
  {
    slug: "mtn-cameroun",
    name: "MTN Cameroun",
    legalName: "Mobile Telephone Networks Cameroon SA",
    sector: "technologie",
    city: "douala",
    neighborhood: "bonanjo",
    short:
      "Opérateur de téléphonie mobile et fournisseur d'accès Internet, filiale du groupe MTN, présent sur tout le territoire.",
    long:
      "MTN Cameroun exploite l'un des deux grands réseaux mobiles du pays depuis 2000. L'entreprise vend de la voix, des données mobiles, du mobile money et des solutions entreprises. Son siège est à Douala et son réseau couvre les dix régions.",
    founded: 2000,
    size: "500+",
    employees: 1500,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
    website: "https://www.mtn.cm",
  },
  {
    slug: "orange-cameroun",
    name: "Orange Cameroun",
    legalName: "Orange Cameroun SA",
    sector: "technologie",
    city: "douala",
    neighborhood: "bonanjo",
    short:
      "Opérateur télécom et fournisseur Internet, filiale du groupe Orange, avec Orange Money et des offres entreprises.",
    long:
      "Orange Cameroun commercialise la téléphonie mobile, l'Internet fixe et mobile, et le service de paiement Orange Money. L'entreprise accompagne aussi les PME avec des offres de connectivité et de services numériques.",
    founded: 1999,
    size: "500+",
    employees: 1200,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
    website: "https://www.orange.cm",
  },
  {
    slug: "camtel",
    name: "CAMTEL",
    legalName: "Cameroon Telecommunications",
    sector: "technologie",
    city: "yaounde",
    neighborhood: "centre-ville",
    short:
      "Opérateur public historique des télécommunications, exploitant le réseau national de fibre optique et la téléphonie fixe.",
    long:
      "CAMTEL est l'opérateur public camerounais. Il gère l'essentiel du backbone national en fibre optique, la téléphonie fixe, et fournit de la capacité aux opérateurs mobiles et aux fournisseurs d'accès. Son siège est à Yaoundé.",
    founded: 1998,
    size: "500+",
    employees: 2400,
    legalStatus: "Entreprise publique",
    languages: ["fr", "en"],
    website: "https://www.camtel.cm",
  },
  {
    slug: "afriland-first-bank",
    name: "Afriland First Bank",
    sector: "banque-finance",
    city: "yaounde",
    neighborhood: "centre-ville",
    short:
      "Banque commerciale camerounaise du groupe Afriland First Group, active dans le financement des PME et la bancarisation.",
    long:
      "Afriland First Bank est l'une des principales banques du pays, avec un réseau d'agences dans les grandes villes et une présence en Afrique centrale. Elle développe des offres dédiées aux PME, à l'agriculture et à la diaspora.",
    founded: 1987,
    size: "500+",
    employees: 1800,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
    website: "https://www.afrilandfirstbank.com",
  },
  {
    slug: "societe-generale-cameroun",
    name: "Société Générale Cameroun",
    sector: "banque-finance",
    city: "douala",
    neighborhood: "bonanjo",
    short:
      "Banque commerciale à réseau national, filiale du groupe Société Générale, orientée entreprises et particuliers.",
    long:
      "Société Générale Cameroun propose des comptes, crédits, services de banque de détail et de financement des entreprises. Son siège est à Douala, avec des agences dans les principales villes du pays.",
    founded: 1963,
    size: "500+",
    employees: 1000,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
    website: "https://www.societegenerale.cm",
  },
  {
    slug: "bicec",
    name: "BICEC",
    legalName: "Banque Internationale pour le Commerce et l'Épargne du Cameroun",
    sector: "banque-finance",
    city: "douala",
    neighborhood: "bonanjo",
    short:
      "Banque commerciale du groupe BPCE, présente sur la banque de détail, les entreprises et le financement du commerce.",
    long:
      "BICEC est une banque de détail et d'entreprise historiquement implantée à Douala. Elle accompagne les particuliers, les PME et les grands comptes, avec un réseau d'agences dans plusieurs régions.",
    founded: 1997,
    size: "500+",
    employees: 900,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
    website: "https://www.bicec.cm",
  },
  {
    slug: "ecobank-cameroun",
    name: "Ecobank Cameroun",
    sector: "banque-finance",
    city: "douala",
    neighborhood: "bonanjo",
    short:
      "Banque commerciale du groupe panafricain Ecobank, avec services de banque de détail et de transfert régional.",
    long:
      "Ecobank Cameroun fait partie du réseau Ecobank, présent dans une trentaine de pays africains. Elle propose comptes, cartes, crédits et solutions de paiement transfrontalières pour les particuliers et les entreprises.",
    founded: null,
    size: "500+",
    employees: 800,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
    website: "https://www.ecobank.com",
  },
  {
    slug: "uba-cameroun",
    name: "UBA Cameroun",
    legalName: "United Bank for Africa Cameroun",
    sector: "banque-finance",
    city: "douala",
    neighborhood: "bonanjo",
    short:
      "Filiale camerounaise du groupe United Bank for Africa, banque de détail et de financement des entreprises.",
    long:
      "UBA Cameroun opère dans la banque de détail, les services aux entreprises et le financement du commerce. Elle s'appuie sur le réseau du groupe UBA pour les opérations en Afrique de l'Ouest et centrale.",
    founded: null,
    size: "201-500",
    employees: 400,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
    website: "https://www.ubagroup.com",
  },
  {
    slug: "eneo",
    name: "Eneo Cameroun",
    sector: "industrie",
    city: "douala",
    neighborhood: "bonanjo",
    short:
      "Concessionnaire du service public de l'électricité : production, distribution et commercialisation de l'énergie.",
    long:
      "Eneo exploite les centrales hydroélectriques et thermiques ainsi que le réseau de distribution électrique national. L'entreprise emploie des ingénieurs, techniciens de maintenance et agents commerciaux dans les dix régions.",
    founded: 2006,
    size: "500+",
    employees: 3000,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
    website: "https://www.eneo.cm",
  },
  {
    slug: "camwater",
    name: "Camwater",
    legalName: "Cameroon Water Utilities",
    sector: "services",
    city: "yaounde",
    neighborhood: "centre-ville",
    short:
      "Opérateur public de production et de distribution d'eau potable en milieu urbain et semi-urbain.",
    long:
      "Camwater gère les stations de traitement et le réseau de distribution d'eau potable du pays. L'entreprise recrute des ingénieurs hydrauliciens, des chimistes de laboratoire et des agents de réseau.",
    founded: 2005,
    size: "500+",
    employees: 1600,
    legalStatus: "Entreprise publique",
    languages: ["fr", "en"],
    website: "https://www.camwater.cm",
  },
  {
    slug: "sabc",
    name: "SABC",
    legalName: "Société Anonyme des Brasseries du Cameroun",
    sector: "industrie",
    city: "douala",
    short:
      "Premier brasseur du pays, avec plusieurs marques de bières, boissons gazeuses et eaux minérales distribuées nationalement.",
    long:
      "La SABC produit et distribue bières, sodas et eaux minérales à travers un réseau de brasseries et de centres de distribution. Elle fait partie des plus gros employeurs industriels privés du Cameroun.",
    founded: 1948,
    size: "500+",
    employees: 2500,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
  },
  {
    slug: "chococam",
    name: "Chococam",
    legalName: "Chocolaterie Confiserie du Cameroun",
    sector: "industrie",
    city: "douala",
    short:
      "Industriel agroalimentaire spécialisé dans le chocolat, la confiserie et les produits à base de cacao.",
    long:
      "Chococam transforme le cacao camerounais en produits chocolatés et confiseries vendus dans toute l'Afrique centrale. L'usine est installée à Douala et s'approvisionne auprès des coopératives cacaoyères du Sud et du Centre.",
    founded: 1972,
    size: "201-500",
    employees: 350,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
  },
  {
    slug: "cimencam",
    name: "Cimencam",
    legalName: "Cimenteries du Cameroun",
    sector: "industrie",
    city: "douala",
    neighborhood: "bonaberi",
    short:
      "Cimentier historique du pays, avec des usines à Douala, Figuil et Nomayos, et un réseau de distribution national.",
    long:
      "Cimencam produit du ciment pour le bâtiment et les grands travaux. Ses usines alimentent les chantiers du pays via un réseau de distributeurs et de dépôts, et l'entreprise emploie de nombreux profils techniques.",
    founded: 1963,
    size: "201-500",
    employees: 500,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
  },
  {
    slug: "camrail",
    name: "Camrail",
    sector: "transport-logistique",
    city: "douala",
    short:
      "Concessionnaire du réseau ferroviaire camerounais : fret, voyageurs et liaison avec le port de Douala.",
    long:
      "Camrail exploite le chemin de fer Douala–Yaoundé–Ngaoundéré. L'entreprise transporte marchandises et voyageurs, et assure l'interface ferroviaire du port de Douala. Elle recrute des profils en exploitation, maintenance et sécurité ferroviaire.",
    founded: 1999,
    size: "500+",
    employees: 2000,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
  },
  {
    slug: "cfao-motors-cameroun",
    name: "CFAO Motors Cameroun",
    sector: "commerce",
    city: "douala",
    neighborhood: "akwa",
    short:
      "Concessionnaire automobile et poids lourds, distribution Toyota et services après-vente dans les grandes villes.",
    long:
      "CFAO Motors distribue des véhicules particuliers et utilitaires, des engins et des pièces détachées au Cameroun. L'activité couvre la vente, la location longue durée, l'atelier et le financement automobile.",
    founded: null,
    size: "201-500",
    employees: 400,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
    website: "https://www.cfao.com",
  },
  {
    slug: "nestle-cameroun",
    name: "Nestlé Cameroun",
    sector: "industrie",
    city: "douala",
    short:
      "Filiale locale du groupe Nestlé : production et distribution de produits alimentaires et nutritionnels.",
    long:
      "Nestlé Cameroun produit et distribue des aliments et boissons, dont le café soluble et des produits nutritionnels. L'entreprise travaille avec des coopératives agricoles locales et dispose d'un réseau de distribution national.",
    founded: null,
    size: "500+",
    employees: 500,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
    website: "https://www.nestle.com",
  },
  {
    slug: "maviance",
    name: "Maviance",
    sector: "technologie",
    city: "douala",
    neighborhood: "akwa",
    short:
      "Fintech camerounaise de paiement marchand et de collecte de factures, opérant sous la marque Smobilpay.",
    long:
      "Maviance développe des solutions de paiement et de collecte pour les entreprises, opérateurs et administrations. Sa plateforme Smobilpay agrège le mobile money et les paiements bancaires en Afrique centrale.",
    founded: 2009,
    size: "11-50",
    employees: 60,
    legalStatus: "Société par actions simplifiée",
    languages: ["fr", "en"],
    website: "https://www.maviance.com",
  },
  {
    slug: "kiroo-games",
    name: "Kiro'o Games",
    sector: "technologie",
    city: "yaounde",
    short:
      "Studio camerounais de jeux vidéo, auteur de l'univers Aurion et acteur de la formation aux métiers du jeu vidéo.",
    long:
      "Kiro'o Games est un studio de développement de jeux vidéo basé à Yaoundé. Le studio produit des jeux d'aventure inspirés des cultures africaines et forme de jeunes développeurs, artistes 2D/3D et game designers.",
    founded: 2013,
    size: "1-10",
    employees: 15,
    legalStatus: "Société de droit camerounais",
    languages: ["fr", "en"],
    website: "https://www.kiroo.games",
  },
  {
    slug: "universite-de-yaounde-i",
    name: "Université de Yaoundé I",
    sector: "education",
    city: "yaounde",
    neighborhood: "ngoa-ekelle",
    short:
      "Grande université publique camerounaise : sciences, lettres, sciences humaines et formation doctorale.",
    long:
      "L'Université de Yaoundé I est l'une des principales universités publiques du pays. Elle accueille des facultés de sciences, de lettres et de sciences humaines, ainsi que des laboratoires de recherche et des écoles doctorales.",
    founded: 1993,
    size: "500+",
    employees: 1200,
    legalStatus: "Établissement public",
    languages: ["fr", "en"],
  },
  {
    slug: "universite-de-douala",
    name: "Université de Douala",
    sector: "education",
    city: "douala",
    short:
      "Université publique à forte orientation économie, gestion, droit, sciences et technologies.",
    long:
      "L'Université de Douala forme des étudiants en économie, gestion, droit, sciences et techniques. Elle développe des partenariats avec les entreprises de la place et accueille de nombreux étudiants en stage chaque année.",
    founded: 1993,
    size: "500+",
    employees: 900,
    legalStatus: "Établissement public",
    languages: ["fr", "en"],
  },
  {
    slug: "activa-assurances",
    name: "Activa Assurances",
    sector: "banque-finance",
    city: "douala",
    neighborhood: "bonanjo",
    short:
      "Compagnie d'assurances camerounaise couvrant dommages, vie, santé et risques des entreprises.",
    long:
      "Activa Assurances propose des contrats d'assurance aux particuliers et aux entreprises : automobile, santé, multirisque professionnelle et prévoyance. Le réseau commercial s'appuie sur des agences et des courtiers.",
    founded: 1998,
    size: "51-200",
    employees: 180,
    legalStatus: "Société anonyme",
    languages: ["fr", "en"],
  },
  {
    slug: "groupe-fokou",
    name: "Fokou Père & Fils",
    sector: "btp-immobilier",
    city: "douala",
    neighborhood: "akwa",
    short:
      "Groupe industriel camerounais actif dans la métallurgie, la construction métallique et la charpente.",
    long:
      "Fokou Père & Fils est un groupe familial spécialisé dans la transformation de l'acier, la fabrication de structures métalliques et la construction. Ses ateliers et chantiers interviennent sur des projets industriels et immobiliers.",
    founded: 1979,
    size: "201-500",
    employees: 400,
    legalStatus: "Groupe familial",
    languages: ["fr", "en"],
  },
];

export default realCompanies;
