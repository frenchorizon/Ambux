/** Brouillon juridique. À faire relire par un humain avant toute publication. */

export const BETA_NOTICE = "Pas un dispositif médical, version bêta, sans garantie.";

export const LEGAL_DRAFT_TITLE = "Brouillon à faire relire par un humain.";

export const LEGAL_DRAFT_BODY =
  "Ce texte n'est pas un conseil juridique. Il n'a pas été validé. Les champs « à compléter » attendent l'identité réelle de l'éditeur. Aucun SIRET et aucune adresse n'ont été inventés.";

export const CONSENT_CHECKBOX =
  "Je confirme que je n'importe que des données dont j'ai le droit, que j'ai lu l'avertissement sur les données de santé, et que je comprends le stockage local et l'envoi éventuel des adresses.";

export const PUBLISHER: { term: string; detail: string }[] = [
  { term: "Éditeur", detail: "Nicolas — à compléter (nom complet)" },
  { term: "Projet", detail: "Ambux" },
  { term: "Statut", detail: "à compléter" },
  { term: "Adresse", detail: "à compléter" },
  { term: "SIRET", detail: "à compléter" },
  { term: "Courriel", detail: "à compléter" },
  { term: "Directeur de la publication", detail: "à compléter" },
  { term: "Hébergeur du fichier", detail: "à compléter" },
];

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export const MENTIONS: LegalSection[] = [
  {
    title: "Objet",
    paragraphs: [
      "Ambux prépare le planning du lendemain pour une société de transport sanitaire. Le logiciel de régulation déjà en place, Lomaco ou un autre, n'est pas remplacé. Cette version est une bêta publique et gratuite. L'accès n'est pas un abonnement. Un avis peut être donné en échange.",
      "L'ambition du projet est de devenir une référence nationale de la génération de planning, en s'intégrant aux logiciels existants. Ce n'est pas un statut acquis.",
    ],
  },
  {
    title: "Ce qu'Ambux n'est pas",
    paragraphs: [
      BETA_NOTICE,
      "Ambux n'est pas un dispositif médical, ni un dossier patient, ni un hébergeur de données de santé. Les kilomètres affichés ne sont pas facturables. Aucune garantie d'exactitude, de disponibilité ou de résultat n'est donnée.",
      "Aucun tarif n'est en vigueur. Les montants éventuellement affichés sur l'accueil sont indicatifs et futurs.",
    ],
  },
  {
    title: "Données",
    paragraphs: [
      "Les courses, les noms, les adresses et le planning restent sur l'appareil, dans ce navigateur. Le détail est dans la politique de confidentialité. Les adresses peuvent être envoyées au géocodage ou au routage seulement si ces services sont utilisés et si le mode privé est éteint.",
      "Un avis facultatif peut quitter l'appareil : une note, un texte, une capture choisie, et des compteurs anonymes. Aucun patient, aucune adresse et aucun planning détaillé n'est joint par Ambux.",
    ],
  },
  {
    title: "Droit et contact",
    paragraphs: ["Droit applicable : à compléter, une fois l'éditeur identifié.", "Contact : à compléter."],
  },
];

export const PRIVACY: LegalSection[] = [
  {
    title: "Responsable",
    paragraphs: [
      "Responsable du traitement : Nicolas — à compléter (nom complet), pour le projet Ambux. Tant que les mentions légales ne sont pas complétées, cette politique reste un brouillon.",
    ],
  },
  {
    title: "Où vivent les données",
    paragraphs: [
      "Les courses, les noms, les adresses, les équipages, les véhicules, les règles et le brouillon de planning sont enregistrés dans le stockage local de ce navigateur, sur l'appareil. Ambux n'a pas de serveur métier. Rien n'est envoyé vers un compte Ambux. Il n'y a pas de mesure d'audience.",
      "Une copie peut être téléchargée (CSV, Excel, feuilles, sauvegarde .ambux.json). Ce fichier ne quitte l'appareil que si la personne qui l'a exporté le déplace elle-même.",
    ],
  },
  {
    title: "Adresses envoyées si un service est utilisé",
    paragraphs: [
      "Le mode « Pas d'envoi d'adresse », dans Réglages, rubrique Routage, coupe Photon, OSRM, son miroir et OpenRouteService. Les coordonnées se saisissent à la main. Les kilomètres sont estimés dans le navigateur. Aucune adresse n'est envoyée. En mode entreprise, ce choix est proposé dans l'assistant, avant le premier géocodage.",
      "Si ce mode est éteint, un avertissement s'affiche avant le premier envoi. La case est mémorisée dans ce navigateur, sous la clé versionnée ambux.routing.notice.v1. Elle se révoque dans Réglages. La révocation bloque l'envoi suivant. Elle n'efface pas les durées déjà calculées.",
      "Le géocodage (bouton Localiser, ou résolution d'une adresse à l'import) envoie le texte de l'adresse à Photon, photon.komoot.io. Le nom d'une personne n'est pas ajouté à cette requête.",
      "Le routage, lorsqu'il n'est pas laissé en estimation locale, envoie des coordonnées à router.project-osrm.org. En secours, routing.openstreetmap.de peut être appelé. Si une clé OpenRouteService est présente dans ce navigateur (ambux.ors), les coordonnées peuvent aussi être envoyées à api.openrouteservice.org. La clé ambux.routing = estimate force les kilomètres estimés sans couper le géocodage. Sans ces usages, ou en mode privé, ces envois n'ont pas lieu. Un délai et quelques essais s'appliquent. Si le service ne répond pas, les kilomètres estimés sont signalés.",
      "La carte charge des tuiles du secteur affiché auprès d'OpenStreetMap (tile.openstreetmap.org, ou un miroir). L'attribution OpenStreetMap reste visible. Un modèle https peut être indiqué dans ambux.tiles. Aucun nom de patient n'est dans cette requête.",
    ],
  },
  {
    title: "Données de santé",
    paragraphs: [
      "Un import CSV, Excel ou Lomaco peut contenir des données de santé, ou des données qui permettent d'identifier un patient. Ambux ne fournit pas d'hébergement agréé de données de santé. La personne qui importe doit avoir le droit de traiter ces données.",
    ],
  },
  {
    title: "Consentement d'import",
    paragraphs: [
      "En mode entreprise, le premier import de fichier est bloqué tant qu'une case n'a pas été cochée. Le consentement est mémorisé dans ce navigateur, sous une clé versionnée. Il se révoque dans Réglages. La révocation bloque l'import suivant. Elle n'efface pas les données déjà présentes.",
      "L'effacement complet est la commande « Effacer toutes mes données de ce navigateur ». Elle retire les clés Ambux de ce navigateur et laisse les autres sites.",
    ],
  },
  {
    title: "Durée et demandes",
    paragraphs: [
      "Les données restent jusqu'à cet effacement, ou jusqu'à ce que le navigateur supprime les données du site.",
      "L'accès, la rectification et l'effacement se font sur l'appareil. Le contact de l'éditeur est à compléter.",
    ],
  },
  {
    title: "Formulaire local",
    paragraphs: [
      "« Noter ma société » enregistre le formulaire dans ce navigateur. Aucun message n'est envoyé. Il ne débloque pas la bêta : l'accès est déjà gratuit.",
    ],
  },
  {
    title: "Avis",
    paragraphs: [
      "« Donner mon avis » est facultatif. Ambux peut envoyer la note, le texte saisi, une capture seulement si un fichier image est choisi, et un contexte technique : version, écran, mode données fictives ou entreprise, nombre de courses, d'équipages et de véhicules. Les patients, les adresses, les noms d'équipage et le planning détaillé ne sont pas joints.",
      "Tant que l'adresse d'envoi n'est pas renseignée, le message s'ouvre dans le logiciel de courriel de l'appareil. Il n'y a pas de mesure d'audience.",
    ],
  },
];
