// Messages d'aide en français et en créole haïtien (SEL 3.5 et 3.6.9)
export const LANGUES = [['fr', 'Français'], ['ht', 'Kreyòl']];

export const SECURITE = {
  fr: "Compte bloqué après 5 essais échoués. Session fermée après 20 minutes d'inactivité.",
  ht: 'Kont lan bloke apre 5 esè ki pa bon. Sesyon an fèmen apre 20 minit san ou pa fè anyen.',
};

// [titre, texte, rôles concernés (tous si absent)]
export const AIDE = {
  fr: [
    ['Connexion', "Entrez votre nom d'utilisateur et votre mot de passe. Après 5 essais échoués, le compte est bloqué : demandez à l'administrateur de le débloquer. Si vous n'utilisez pas l'application pendant 20 minutes, reconnectez-vous."],
    ['Joueurs', "Cherchez un joueur par son nom ou ouvrez « Critères » pour filtrer par poste, pied, division, âge et indice minimal. La liste est triée par indice de performance. Pour un joueur de moins de 18 ans, le nom du tuteur et son accord écrit sont obligatoires, et son téléphone n'est jamais affiché."],
    ['Radar et comparaison', "Le radar montre le centile du joueur parmi les joueurs du même poste : 90 veut dire qu'il fait mieux que 90 % d'entre eux. Il faut avoir joué au moins 450 minutes dans la saison pour y figurer. « Comparer » superpose deux joueurs."],
    ['Matchs', "Créez le match, choisissez les deux équipes, puis touchez chaque joueur : titulaire, remplaçant, puis absent. Il faut 11 titulaires par équipe. Importez ensuite la vidéo pour pouvoir coder.", ['ADMIN', 'ANALYSTE']],
    ['Codage vidéo', "Mettez la vidéo en pause sur une action, touchez le terrain pour placer la zone, puis choisissez le type d'action, le joueur et le résultat. « Ajouter l'événement » l'enregistre aussitôt. Pour une passe ou un centre, un second toucher sur le terrain donne le point d'arrivée : il alimente la carte des passes de la fiche du match. Pour un tir ou un but, indiquez la partie du corps : les tirs, buts et xG de la tête apparaissent sur la fiche du joueur. « Dessiner » pose sur la vidéo flèches droites ou courbes, zones, liaisons entre joueurs, triangles et étiquettes joueur ; après un calibrage en 4 coins, les distances s'affichent en mètres. Indiquez qui a le ballon avec les boutons de possession. Quand tout le match est codé, « Valider » calcule les statistiques : le nombre de buts codés doit être égal au score.", ['ADMIN', 'ANALYSTE']],
    ['Dessins et suivi sur la vidéo', "« Dessiner » permet de tracer des flèches, des cercles, des traits et du texte sur l'image. « Suivi joueur » mesure la distance et la vitesse d'un joueur : désignez 4 coins du terrain sur l'image, puis suivez le joueur du doigt pendant que la vidéo joue.", ['ADMIN', 'ANALYSTE']],
    ['Rapports de scouting', "Le scout rédige le rapport (forces, faiblesses, note sur 10, recommandation) puis le soumet. Le directeur sportif le valide ou le renvoie avec un commentaire. Les clubs clients ne voient un rapport qu'une fois validé.", ['ADMIN', 'SCOUT', 'DIRECTEUR', 'CLIENT']],
    ['Shortlists', "Une shortlist est une liste de joueurs à suivre. Depuis la fiche d'un joueur, touchez « + Shortlist » pour l'ajouter à une liste ou en créer une.", ['ADMIN', 'SCOUT', 'DIRECTEUR', 'CLIENT']],
    ['Abonnements et paiements', "Choisissez le club et la formule : le montant, l'échéance et la facture sont calculés. Enregistrez chaque paiement sur sa facture ; l'abonnement devient actif quand la facture est soldée. Impayé 15 jours après l'échéance, il est suspendu. Une facture ou un paiement ne se supprime jamais : il s'annule avec un motif.", ['ADMIN', 'AGENT']],
    ['Export PDF', "Le bouton « Exporter en PDF » d'une fiche, d'une comparaison ou d'un rapport ouvre le document, prêt à être enregistré ou imprimé."],
    ['Administration', "Créez les comptes et donnez un rôle à chacun : le mot de passe provisoire est envoyé par courriel. Le journal montre qui a fait quoi, quand et depuis quel poste. « Sauvegarder maintenant » copie la base et les vidéos sur le disque externe et le serveur cloud.", ['ADMIN']],
  ],
  ht: [
    ['Koneksyon', 'Antre non itilizatè w ak modpas ou. Apre 5 esè ki pa bon, kont lan bloke : mande administratè a debloke l. Si ou pase 20 minit san itilize aplikasyon an, konekte ankò.'],
    ['Jwè yo', 'Chèche yon jwè ak non l, oswa ouvri « Critères » pou triye pa pòs, pye, divizyon, laj ak endis minimòm. Lis la klase selon endis pèfòmans. Pou yon jwè ki poko gen 18 an, non responsab li ak akò ekri li obligatwa, epi telefòn li pa janm parèt.'],
    ['Rada ak konparezon', 'Rada a montre ran jwè a pami jwè ki nan menm pòs la : 90 vle di li fè pi byen pase 90 % nan yo. Fòk jwè a jwe omwen 450 minit nan sezon an pou l parèt ladan l. « Comparer » mete de jwè youn sou lòt.'],
    ['Match yo', 'Kreye match la, chwazi de ekip yo, epi touche chak jwè : titilè, ranplasan, epi absan. Fòk gen 11 titilè pa ekip. Apre sa, mete videyo a pou ou ka kode.', ['ADMIN', 'ANALYSTE']],
    ['Kodaj videyo', 'Kanpe videyo a sou yon aksyon, touche teren an pou make zòn nan, epi chwazi kalite aksyon an, jwè a ak rezilta a. « Ajouter l\'événement » anrejistre l menm kote a. Di ki ekip ki gen balon an ak bouton posesyon yo. Lè tout match la fin kode, « Valider » kalkile estatistik yo : kantite bi ki kode dwe egal ak eskò a.', ['ADMIN', 'ANALYSTE']],
    ['Desen ak swivi sou videyo a', '« Dessiner » pèmèt ou trase flèch, sèk, trè ak tèks sou imaj la. « Suivi joueur » mezire distans ak vitès yon jwè : montre 4 kwen teren an sou imaj la, epi swiv jwè a ak dwèt ou pandan videyo a ap jwe.', ['ADMIN', 'ANALYSTE']],
    ['Rapò scouting', 'Scout la ekri rapò a (fòs, feblès, nòt sou 10, rekòmandasyon) epi li soumèt li. Direktè espòtif la valide l oswa li voye l tounen ak yon kòmantè. Klib kliyan yo wè yon rapò sèlman lè l fin valide.', ['ADMIN', 'SCOUT', 'DIRECTEUR', 'CLIENT']],
    ['Shortlist', 'Yon shortlist se yon lis jwè w ap swiv. Nan fich yon jwè, touche « + Shortlist » pou mete l nan yon lis oswa pou kreye youn.', ['ADMIN', 'SCOUT', 'DIRECTEUR', 'CLIENT']],
    ['Abònman ak peman', 'Chwazi klib la ak fòmil la : montan an, dat limit la ak fakti a kalkile pou kont yo. Anrejistre chak peman sou fakti pa l ; abònman an vin aktif lè fakti a fin peye. Si l pa peye 15 jou apre dat limit la, li sispann. Yon fakti oswa yon peman pa janm efase : ou anile l ak yon rezon.', ['ADMIN', 'AGENT']],
    ['Ekspò PDF', 'Bouton « Exporter en PDF » nan yon fich, yon konparezon oswa yon rapò ouvri dokiman an, pare pou anrejistre oswa enprime.'],
    ['Administrasyon', 'Kreye kont yo epi bay chak moun yon wòl : modpas pwovizwa a voye pa imèl. Jounal la montre ki moun ki fè kisa, ki lè, ak depi ki pòs. « Sauvegarder maintenant » kopye baz done a ak videyo yo sou disk ekstèn lan ak sèvè cloud la.', ['ADMIN']],
  ],
};
