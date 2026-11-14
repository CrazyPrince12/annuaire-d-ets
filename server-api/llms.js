/**
 * GET /llms.txt — résumé factuel du site pour les moteurs génératifs.
 * Contenu volontairement court, vérifiable, sans promesse marketing.
 */
import { one } from "./_lib/db.js";
import { handler, publicOrigin, requireMethod } from "./_lib/http.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const origin = publicOrigin(req);
  const stats = await one(
    `SELECT
       (SELECT COUNT(*)::int FROM companies WHERE publication_status='published' AND deleted_at IS NULL) AS companies,
       (SELECT COUNT(*)::int FROM reviews WHERE status='published') AS reviews,
       (SELECT COUNT(*)::int FROM job_offers o JOIN companies c ON c.id = o.company_id
          WHERE o.status='published' AND c.publication_status='published'
            AND (o.deadline_at IS NULL OR o.deadline_at > NOW())) AS offers`
  );

  const text = `# CONGLOMERAT

> Annuaire de découverte des entreprises de Yaoundé, Douala et Bafoussam (Cameroun) :
> localisation par quartier, avis structurés par type d'expérience, offres d'emploi et de stage,
> comparateur, et fiches vérifiées sur pièces.

Site : ${origin}
Langue : français. Devise : franc CFA (XAF). Fuseau : Africa/Douala.

## Chiffres actuels
- ${stats.companies} entreprises publiées
- ${stats.offers} offres d'emploi et de stage actives
- ${stats.reviews} avis publiés après modération

## Pages principales
- [Accueil](${origin}/) : recherche, villes, secteurs, entreprises qui recrutent
- [Explorer](${origin}/explorer) : recherche filtrée (ville, quartier, secteur, taille, vérification, contrats, note)
- [Carte](${origin}/carte) : carte interactive des entreprises géolocalisées
- [Offres](${origin}/offres) : emplois et stages, filtres par contrat et niveau d'études
- [Stages](${origin}/stages) : uniquement les stages
- [Avis](${origin}/avis) : classements par secteur et par critère (minimum 5 avis)
- [Villes](${origin}/villes) : Yaoundé, Douala, Bafoussam
- [Secteurs](${origin}/secteurs) : 14 secteurs d'activité
- [Comparer](${origin}/comparer) : comparaison de 2 à 3 entreprises
- [Contribuer](${origin}/contribuer) : proposer une entreprise ou une correction, sans compte

## Règles de données
- Une note n'est affichée qu'à partir de 3 avis publiés ; un classement à partir de 5 avis.
- Les avis sont anonymes, modérés avant publication, et ne peuvent pas être supprimés par l'entreprise.
- La vérification d'identité (RCCM, NIU, appel téléphonique) est distincte de la note de réputation.
- Les fiches marquées « donnée d'exemple » sont un jeu de démonstration, pas des entreprises réelles.
- Les coordonnées des entreprises réelles ne sont affichées que si elles ont été confirmées.

## Structure des fiches
Chaque fiche : identité, secteur, taille, année de création, adresse et quartier, horaires,
contacts, offres actives, avis par critère (ambiance, management, conditions, rémunération,
évolution, stage, recrutement), entreprises similaires.

## Contact
Les messages passent par ${origin}/contact. Aucune donnée personnelle n'est vendue.
`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.end(text);
});
