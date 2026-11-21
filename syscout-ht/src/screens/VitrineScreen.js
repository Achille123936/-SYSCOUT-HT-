import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MatchsEnDirect from '../components/MatchsEnDirect';
import { api } from '../api';
import { C, F } from '../theme';
import { htg } from '../constantes';
import { useLarge } from '../components/ui';

// thème sombre de la page publique
const D = { fond: '#070d1f', bloc: '#0b1430', carte: '#101a3a', trait: 'rgba(255,255,255,.09)', doux: '#a9b6dc', bleu: '#4f7cff' };
const IMAGES = {
  fond: require('../../assets/accueil-fond.jpg'),
  codage: require('../../assets/captures/out_codage.png'),
  comparaison: require('../../assets/captures/out_comparaison.png'),
  match: require('../../assets/captures/out_match.png'),
  joueur: require('../../assets/captures/out_joueur.png'),
};

// « Voir en action » : les outils de la plateforme, image et texte en alternance
const OUTILS = [
  ['Télestration', 'Dessinez la tactique sur la vidéo', "Flèches droites ou courbes, liaisons entre joueurs, triangles et zones : après un calibrage en 4 coins, les distances s'affichent en mètres. La carte des passes de chaque équipe complète l'analyse.", 'fond', 'large'],
  ['Codage vidéo', 'Chaque action du match, codée en direct', "Type d'action, joueur, zone du terrain, départ et arrivée des passes, partie du corps des tirs : une touche de clavier par action, et une sauvegarde à chaque saisie.", 'codage', 'large'],
  ['Visualisation', 'Radars et comparaisons de joueurs', "Le profil d'un joueur en centiles de son poste, deux joueurs superposés, et les joueurs au profil le plus proche.", 'comparaison', 'mobile'],
  ['Matchs', 'Compositions, vidéo et statistiques', 'Les deux compositions, la vidéo du match et les statistiques de chaque équipe, calculées dès la validation du codage.', 'match', 'mobile'],
  ['Scouting', 'La fiche complète de chaque joueur', 'Identité, profil sportif, historique des clubs, statistiques par 90 minutes, indice de performance sur 100 et rapports de scouting validés.', 'joueur', 'mobile'],
];

// « Nos clients » : un onglet par métier
const METIERS = [
  ['Clubs', 'comparaison', ['Suivez votre équipe et vos adversaires match après match', 'Comparez vos joueurs à ceux de la Ligue, poste par poste', 'Consultez les rapports de scouting validés et exportez-les en PDF']],
  ['Scouts', 'joueur', ['Cherchez les joueurs par poste, âge, club et indice', 'Tenez vos shortlists et rédigez vos rapports', "Trouvez les profils les plus proches d'un joueur cible"]],
  ['Analystes', 'codage', ['Codez les matchs action par action sur la vidéo', 'Dessinez la tactique et mesurez les distances en mètres', 'Publiez les statistiques en un clic après contrôle de cohérence']],
  ['Directeurs sportifs', 'match', ['Validez les rapports de vos scouts', "Suivez les classements par poste et l'indice de performance", 'Préparez le recrutement sur des données réelles']],
];
const DIVISIONS = { D1: 'Division 1', D2: 'Division 2', ACADEMIE: 'Académie' };

const entier = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const decimal = (n, chiffres = 2) => Number(n).toFixed(chiffres).replace('.', ',');

// les chiffres du haut de page : des volumes de la plateforme et des moyennes de la saison, tous réels
function indicateurs(c) {
  if (!c) return [];
  const m = c.moyennes || {};
  return [
    [entier(c.joueurs), 'Joueurs suivis', 'fiches complètes'],
    [entier(c.matchs_codes), 'Matchs codés', 'statistiques publiées'],
    [entier(c.evenements), 'Actions codées', 'sur la vidéo'],
    m.xg_p90 != null ? [decimal(m.xg_p90), 'xG moyen', '/ 90 min.'] : null,
    m.dribbles_p90 != null ? [decimal(m.dribbles_p90, 1), 'Dribbles réussis', '/ 90 min.'] : null,
    m.passes_reussies_pct != null ? [`${decimal(m.passes_reussies_pct, 1)} %`, 'Passes réussies', 'moyenne de la saison'] : null,
    m.interceptions_p90 != null ? [decimal(m.interceptions_p90, 1), 'Interceptions', '/ 90 min.'] : null,
    m.vitesse_max_kmh != null ? [`${decimal(m.vitesse_max_kmh, 1)} km/h`, 'Vitesse maximale', 'mesurée'] : null,
  ].filter(Boolean).slice(0, 6);
}

// Page d'accueil publique : ce qu'est SYSCOUT-HT, pour qui, et à quel prix (RG11)
export default function VitrineScreen({ surConnexion, surInscription }) {
  const large = useLarge();
  const insets = useSafeAreaInsets();
  const defilement = useRef(null);
  const positions = useRef({});
  const [formules, setFormules] = useState(null);
  const [chiffres, setChiffres] = useState(null);
  const [metier, setMetier] = useState(0);
  useEffect(() => {
    api.get('/formules-publiques/').then(setFormules).catch(() => setFormules([]));
    api.get('/chiffres-publics/').then(setChiffres).catch(() => setChiffres(null));
  }, []);

  const repere = (cle) => ({ onLayout: (e) => { positions.current[cle] = e.nativeEvent.layout.y; } });
  const aller = (cle) => defilement.current?.scrollTo({ y: Math.max(0, (positions.current[cle] || 0) - 64), animated: true });
  const stats = indicateurs(chiffres);
  const choisi = METIERS[metier];

  const boutons = (centre) => (
    <View style={[st.actions, large && { flexDirection: 'row' }, centre && { alignSelf: 'center' }]}>
      <Pressable onPress={surInscription} style={({ pressed }) => [st.cta, st.ctaPlein, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        <Text style={st.ctaTxt}>Demander un compte</Text>
      </Pressable>
      <Pressable onPress={surConnexion} style={({ pressed }) => [st.cta, st.ctaVide, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        <Text style={st.ctaTxt}>Se connecter</Text>
      </Pressable>
    </View>
  );
  const logo = <View style={st.logo}><View style={st.logoBleu} /><View style={st.logoRouge} /><Text style={st.logoTxt}>SH</Text></View>;

  return (
    <ScrollView ref={defilement} style={{ flex: 1, backgroundColor: D.fond }} contentContainerStyle={{ flexGrow: 1 }} stickyHeaderIndices={[0]}>
      {/* barre de navigation, fixée en haut pendant le défilement */}
      <View style={[st.nav, { paddingTop: Math.max(insets.top, 10) + 4 }]}>
        <View style={[st.cadre, st.navLigne]}>
          {logo}
          <Text style={[st.marque, !large && { flex: 1 }]}>SYSCOUT-HT</Text>
          {large ? (
            <View style={st.liens}>
              {[['outils', 'Fonctionnalités'], ['clients', 'Pour qui'], ['formules', 'Formules'], ['championnats', 'Championnats']].map(([cle, nom]) => (
                <Pressable key={cle} onPress={() => aller(cle)} accessibilityRole="link"><Text style={st.lien}>{nom}</Text></Pressable>
              ))}
            </View>
          ) : null}
          {large ? <Pressable onPress={surConnexion} accessibilityRole="button"><Text style={[st.lien, { color: '#fff' }]}>Se connecter</Text></Pressable> : null}
          <Pressable onPress={large ? surInscription : surConnexion} style={st.navBouton} accessibilityRole="button">
            <Text style={st.navBoutonTxt}>{large ? "S'inscrire" : 'Se connecter'}</Text>
          </Pressable>
        </View>
      </View>

      {/* haut de page : l'analyse tactique en fond, et les chiffres de la plateforme */}
      <View style={st.hero}>
        <Image source={IMAGES.fond} style={st.plein} resizeMode="cover" accessibilityIgnoresInvertColors />
        <View style={st.voile} />
        <View style={[st.cadre, { paddingHorizontal: 20 }]}>
          <View style={[st.accroche, large && { paddingTop: 84, maxWidth: 760 }]}>
            <View style={st.pilule}><View style={st.point} /><Text style={st.piluleTxt}>Ligue Haïtienne{chiffres?.saison ? ` · saison ${chiffres.saison}` : ''}</Text></View>
            <Text style={[st.titre, large && { fontSize: 50, lineHeight: 56 }]}>L'analyse du football haïtien{'\n'}accessible à tous !</Text>
            <Text style={[st.texte, large && { fontSize: 17, lineHeight: 26 }]}>
              Les matchs de la Ligue codés action par action, des statistiques pour chaque joueur et des rapports de scouting pour les clubs.
            </Text>
            {boutons(false)}
          </View>
          {stats.length ? (
            <View style={[st.stats, large && { marginTop: 56 }]}>
              {stats.map(([valeur, nom, detail]) => (
                <View key={nom} style={[st.stat, { flexBasis: large ? '15%' : '46%' }]}>
                  <Text style={st.statValeur}>{valeur}</Text>
                  <Text style={st.statNom}>{nom}</Text>
                  <Text style={st.statDetail}>{detail}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {/* matchs codés en ce moment : score et minute, sans compte */}
      <View style={[st.section, { paddingVertical: 36, borderBottomWidth: 1, borderBottomColor: D.trait }]} {...repere('direct')}>
        <View style={st.cadre}>
          <Text style={[st.sur, { textAlign: 'center' }]}>MATCHS EN DIRECT</Text>
          <View style={{ marginTop: 18, alignItems: 'center' }}>
            <MatchsEnDirect sombre />
          </View>
          <Pressable onPress={surConnexion} accessibilityRole="button" style={{ marginTop: 14, alignSelf: 'center' }}>
            <Text style={st.lien}>Connectez-vous pour suivre les statistiques en direct ›</Text>
          </Pressable>
        </View>
      </View>

      {/* clubs des compétitions de la saison */}
      {chiffres?.clubs?.length ? (
        <View style={[st.section, { paddingVertical: 36, borderBottomWidth: 1, borderBottomColor: D.trait }]}>
          <View style={st.cadre}>
            <Text style={[st.sur, { textAlign: 'center' }]}>LES CLUBS SUIVIS SUR LA PLATEFORME</Text>
            <View style={[st.grille, { justifyContent: 'center', marginTop: 18 }]}>
              {chiffres.clubs.map((club, i) => (
                <View key={`${club.nom}-${club.ville}`} style={st.club}>
                  <View style={[st.clubSigle, { backgroundColor: i % 2 ? 'rgba(210,16,52,.18)' : 'rgba(79,124,255,.18)' }]}>
                    <Text style={[st.clubSigleTxt, { color: i % 2 ? '#ff8aa0' : '#9db5ff' }]}>{(club.sigle || club.nom.slice(0, 3)).toUpperCase()}</Text>
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={st.clubNom} numberOfLines={1}>{club.nom}</Text>
                    <Text style={st.clubDiv} numberOfLines={1}>{DIVISIONS[club.division] || club.division} · {club.ville}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {/* nos clients : un onglet par métier */}
      <View style={st.section} {...repere('clients')}>
        <View style={st.cadre}>
          <Text style={st.sur}>NOS CLIENTS</Text>
          <Text style={[st.h2, large && st.h2Large]}>SYSCOUT-HT s'adapte à chaque métier du football haïtien</Text>
          <View style={st.onglets} accessibilityRole="tablist">
            {METIERS.map(([nom], i) => (
              <Pressable key={nom} onPress={() => setMetier(i)} style={[st.onglet, metier === i && st.ongletActif]}
                accessibilityRole="tab" accessibilityState={{ selected: metier === i }}>
                <Text style={[st.ongletTxt, metier === i && { color: '#fff' }]}>{nom}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[st.metier, large && { flexDirection: 'row', alignItems: 'center' }]}>
            <View style={[st.vitrine, choisi[1] === 'codage' ? st.cadreLarge : st.cadreMobile, { backgroundColor: '#0a1128' }, large && { flex: 1 }]}>
              <Image source={IMAGES[choisi[1]]} style={choisi[1] === 'codage' ? st.plein : st.captureMobile} resizeMode="contain" />
            </View>
            <View style={[{ gap: 14, padding: 4 }, large && { flex: 1, paddingLeft: 26 }]}>
              <Text style={st.metierTitre}>{choisi[0]}</Text>
              {choisi[2].map((ligne) => (
                <View key={ligne} style={st.puce}><Text style={st.coche}>✓</Text><Text style={st.puceTxt}>{ligne}</Text></View>
              ))}
              <Pressable onPress={surInscription} style={[st.cta, st.ctaPlein, { alignSelf: 'flex-start', marginTop: 6 }]} accessibilityRole="button">
                <Text style={st.ctaTxt}>Demander un compte</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* formules d'abonnement */}
      {formules && formules.length ? (
        <View style={[st.section, { backgroundColor: D.bloc }]} {...repere('formules')}>
          <View style={st.cadre}>
            <Text style={[st.sur, { textAlign: 'center' }]}>NOS FORMULES</Text>
            <Text style={[st.h2, large && st.h2Large, { textAlign: 'center' }]}>Choisissez le plan qui correspond à vos ambitions</Text>
            <View style={[st.grille, { justifyContent: 'center', gap: large ? 18 : 22 }]}>
              {formules.map((formule, i) => {
                const forte = i === formules.length - 1 && formules.length > 1;
                return (
                  <View key={formule.nom} style={[st.formule, { flexBasis: large ? '31%' : '100%' }, forte && st.formuleForte]}>
                    {forte ? <View style={st.badge}><Text style={st.badgeTxt}>Le plus complet</Text></View> : null}
                    <Text style={st.formuleNom}>{formule.nom}</Text>
                    <Text style={st.prix}>{htg(formule.prix_mensuel_htg).replace(',00', '')}<Text style={st.parMois}> / mois</Text></Text>
                    {[`${formule.divisions_incluses.map((d) => DIVISIONS[d] || d).join(' et ')}`,
                      `${formule.nombre_comptes} compte(s) utilisateur`,
                      formule.rapports_inclus ? 'Rapports de scouting inclus' : 'Sans les rapports de scouting',
                      'Fiches, radars, comparaisons et export PDF'].map((ligne) => {
                      const sans = ligne.startsWith('Sans');
                      return (
                        <View key={ligne} style={st.puce}>
                          <Text style={[st.coche, sans && { color: D.doux }]}>{sans ? '–' : '✓'}</Text>
                          <Text style={[st.puceTxt, { fontSize: 13.5 }, sans && { color: D.doux }]}>{ligne}</Text>
                        </View>
                      );
                    })}
                    <Pressable onPress={surInscription} style={[st.cta, forte ? st.ctaPlein : st.ctaVide, { marginTop: 18, minWidth: 0 }]} accessibilityRole="button">
                      <Text style={st.ctaTxt}>Choisir {formule.nom}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            <Text style={st.note}>Paiement en espèces, par virement ou par MonCash. L'abonnement est activé dès que la facture est réglée.</Text>
          </View>
        </View>
      ) : null}

      {/* voir en action : les outils, image et texte en alternance */}
      <View style={st.section} {...repere('outils')}>
        <View style={st.cadre}>
          <Text style={[st.sur, { textAlign: 'center' }]}>VOIR EN ACTION</Text>
          <Text style={[st.h2, large && st.h2Large, { textAlign: 'center' }]}>Les outils des analystes, des scouts et des clubs, au quotidien</Text>
          <View style={{ gap: large ? 56 : 36 }}>
            {OUTILS.map(([categorie, titre, texte, image, format], i) => (
              <View key={titre} style={[{ gap: 18 }, large && { flexDirection: i % 2 ? 'row-reverse' : 'row', alignItems: 'center', gap: 40 }]}>
                <View style={[st.vitrine, format === 'large' ? st.cadreLarge : st.cadreMobile, large && { flex: 1.25 }]}>
                  <Image source={IMAGES[image]} style={format === 'large' ? st.plein : st.captureMobile} resizeMode={image === 'fond' ? 'cover' : 'contain'} />
                </View>
                <View style={[{ gap: 10 }, large && { flex: 1 }]}>
                  <Text style={st.categorie}>{categorie.toUpperCase()}</Text>
                  <Text style={st.outilTitre}>{titre}</Text>
                  <Text style={st.outilTexte}>{texte}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* compétitions couvertes */}
      {chiffres?.competitions?.length ? (
        <View style={[st.section, { backgroundColor: D.bloc }]} {...repere('championnats')}>
          <View style={st.cadre}>
            <Text style={st.sur}>NOS CHAMPIONNATS</Text>
            <Text style={[st.h2, large && st.h2Large]}>
              {chiffres.competitions.length} compétition(s) couverte(s) en Haïti{chiffres.saison ? ` · saison ${chiffres.saison}` : ''}
            </Text>
            <View style={st.grille}>
              {chiffres.competitions.map((c) => (
                <View key={c.nom} style={[st.competition, { flexBasis: large ? '31%' : '100%' }]}>
                  <View style={st.disponible}><View style={[st.point, { backgroundColor: C.dGreen }]} /><Text style={st.disponibleTxt}>Disponible</Text></View>
                  <Text style={st.competitionNom}>{c.nom}</Text>
                  <Text style={st.competitionDetail}>{DIVISIONS[c.niveau] || c.niveau} · {c.clubs} club(s)</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {/* appel final */}
      <View style={[st.section, { paddingVertical: large ? 80 : 54 }]}>
        <View style={[st.cadre, st.final]}>
          <Image source={IMAGES.fond} style={st.plein} resizeMode="cover" />
          <View style={[st.plein, { backgroundColor: 'rgba(15,40,120,.86)' }]} />
          <Text style={[st.titre, { textAlign: 'center', fontSize: large ? 38 : 28, lineHeight: large ? 44 : 34 }]}>Passez à la data.{'\n'}Dès aujourd'hui.</Text>
          {chiffres ? (
            <View style={st.compteurs}>
              {[[entier(chiffres.joueurs), 'joueurs'], [entier(chiffres.matchs_codes), 'matchs codés'], [String(chiffres.clubs.length), 'clubs']].map(([n, nom]) => (
                <View key={nom} style={{ alignItems: 'center' }}><Text style={st.compteur}>{n}</Text><Text style={st.compteurNom}>{nom}</Text></View>
              ))}
            </View>
          ) : <View style={{ height: 22 }} />}
          {boutons(true)}
          <Text style={st.mentions}>Compte activé par l'administrateur · Paiement MonCash, virement ou espèces · Français et Kreyòl</Text>
        </View>
      </View>

      {/* pied de page : bande aux couleurs du drapeau, liens utiles, nom de la marque en filigrane */}
      <View style={st.pied}>
        <View style={st.drapeau}><View style={{ flex: 1, backgroundColor: C.blue }} /><View style={{ flex: 1, backgroundColor: C.red }} /></View>
        <Text style={[st.filigrane, large && { fontSize: 168, bottom: -38 }]} numberOfLines={1} aria-hidden>SYSCOUT-HT</Text>
        <View style={[st.cadre, { paddingHorizontal: 20 }]}>
          <View style={[st.piedHaut, large && { flexDirection: 'row', alignItems: 'flex-start' }]}>
            <View style={[{ gap: 16 }, large && { flex: 1.5, paddingRight: 48 }]}>
              <View style={st.navLigne}>{logo}<Text style={[st.marque, { fontSize: 20, color: C.ink }]}>SYSCOUT-HT</Text></View>
              <Text style={st.piedTexte}>L'analyse vidéo, les statistiques et le scouting du football haïtien, réunis dans une seule plateforme.</Text>
              {chiffres ? (
                <View style={st.statut}>
                  <View style={[st.point, { backgroundColor: C.dGreen }]} />
                  <Text style={st.statutTxt}>Plateforme en ligne{chiffres.saison ? ` · saison ${chiffres.saison}` : ''} · {entier(chiffres.matchs_codes)} matchs codés</Text>
                </View>
              ) : null}
              <View style={st.etiquettes}>
                {['Français', 'Kreyòl', 'HTG', 'MonCash'].map((mot) => <View key={mot} style={st.etiquette}><Text style={st.etiquetteTxt}>{mot}</Text></View>)}
              </View>
            </View>
            <View style={[st.colonnes, large && { flex: 2, flexWrap: 'nowrap' }]}>
              {[['Plateforme', OUTILS.map(([categorie]) => [categorie, () => aller('outils')])],
                ['Pour qui', METIERS.map(([nom], i) => [nom, () => { setMetier(i); aller('clients'); }])],
                ['Accès', [['Formules', () => aller('formules')], ['Championnats', () => aller('championnats')],
                  ['Se connecter', surConnexion], ['Demander un compte', surInscription]]]].map(([titre, liens]) => (
                <View key={titre} style={[{ gap: 12, minWidth: 140 }, large && { flex: 1 }]}>
                  <Text style={st.colonneTitre}>{titre}</Text>
                  {liens.map(([nom, faire]) => (
                    <Pressable key={nom} onPress={faire} accessibilityRole="link">
                      {({ hovered, pressed }) => <Text style={[st.colonneLigne, (hovered || pressed) && st.colonneLigneActive]}>{nom}</Text>}
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          </View>

          <View style={[st.adresse, large && { flexDirection: 'row', alignItems: 'center' }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={st.adresseTitre}>Ayiti Data Foot S.A.</Text>
              <Text style={st.adresseTxt}>Pétion-Ville, Haïti · Ligue Haïtienne D1 et D2 · Académies de football</Text>
            </View>
            <Pressable onPress={surInscription} style={({ hovered }) => [st.adresseBouton, hovered && { opacity: 0.88 }]} accessibilityRole="button">
              <Text style={st.adresseBoutonTxt}>Demander un compte  →</Text>
            </Pressable>
          </View>

          <View style={[st.bas, large && { flexDirection: 'row', alignItems: 'center' }]}>
            <Text style={[st.basTxt, large && { flex: 1 }]}>© {new Date().getFullYear()} Ayiti Data Foot S.A. Tous droits réservés.</Text>
            <Text style={st.basTxt}>Réalisé par <Text style={{ color: C.ink, ...F.semi }}>Smartgen</Text></Text>
            <Pressable onPress={() => defilement.current?.scrollTo({ y: 0, animated: true })} style={({ hovered }) => [st.haut, hovered && { borderColor: C.blue }]}
              accessibilityRole="button" accessibilityLabel="Revenir en haut de la page">
              <Text style={st.hautTxt}>↑</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  cadre: { width: '100%', maxWidth: 1120, alignSelf: 'center' },
  plein: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  nav: { backgroundColor: 'rgba(7,13,31,.96)', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: D.trait },
  navLigne: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liens: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 26 },
  lien: { color: D.doux, fontSize: 14, ...F.medium },
  navBouton: { height: 38, paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.red, justifyContent: 'center', marginLeft: 8 },
  navBoutonTxt: { color: '#fff', fontSize: 13.5, ...F.semi },
  logo: { width: 36, height: 36, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logoBleu: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 18, backgroundColor: C.blue },
  logoRouge: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 18, backgroundColor: C.red },
  logoTxt: { color: '#fff', fontSize: 13, ...F.bold },
  marque: { color: '#fff', fontSize: 17, ...F.bold },
  hero: { overflow: 'hidden', paddingBottom: 48 },
  voile: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,13,31,.76)' },
  accroche: { paddingTop: 48 },
  pilule: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,.2)', backgroundColor: 'rgba(255,255,255,.06)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 20 },
  point: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.red },
  piluleTxt: { color: '#dbe3ff', fontSize: 12.5, ...F.medium },
  titre: { color: '#fff', fontSize: 33, lineHeight: 39, ...F.bold },
  texte: { color: '#c3cfee', fontSize: 15, lineHeight: 23, marginTop: 16, ...F.regular },
  actions: { gap: 10, marginTop: 28 },
  cta: { height: 50, borderRadius: 12, paddingHorizontal: 24, minWidth: 200, alignItems: 'center', justifyContent: 'center' },
  ctaPlein: { backgroundColor: C.red },
  ctaVide: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,.45)' },
  ctaTxt: { color: '#fff', fontSize: 15, ...F.semi },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 36 },
  stat: { flexGrow: 1, backgroundColor: 'rgba(16,26,58,.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', borderRadius: 14, padding: 14 },
  statValeur: { color: '#fff', fontSize: 23, ...F.bold },
  statNom: { color: '#dbe3ff', fontSize: 12.5, marginTop: 4, ...F.semi },
  statDetail: { color: D.doux, fontSize: 11.5, marginTop: 1, ...F.regular },
  section: { paddingHorizontal: 20, paddingVertical: 56, backgroundColor: D.fond },
  sur: { color: '#ff6b84', fontSize: 11.5, letterSpacing: 1.6, ...F.bold },
  h2: { color: '#fff', fontSize: 25, lineHeight: 31, marginTop: 8, marginBottom: 26, ...F.bold },
  h2Large: { fontSize: 32, lineHeight: 39 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  club: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 236, maxWidth: '100%', backgroundColor: D.carte, borderWidth: 1, borderColor: D.trait, borderRadius: 14, padding: 12 },
  clubSigle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  clubSigleTxt: { fontSize: 12, ...F.bold },
  clubNom: { color: '#fff', fontSize: 13.5, ...F.semi },
  clubDiv: { color: D.doux, fontSize: 11.5, marginTop: 1, ...F.regular },
  onglets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  onglet: { height: 40, paddingHorizontal: 18, borderRadius: 20, borderWidth: 1, borderColor: D.trait, backgroundColor: D.carte, justifyContent: 'center' },
  ongletActif: { backgroundColor: C.blue, borderColor: C.blue },
  ongletTxt: { color: D.doux, fontSize: 14, ...F.semi },
  metier: { gap: 20, backgroundColor: D.carte, borderWidth: 1, borderColor: D.trait, borderRadius: 20, padding: 18 },
  metierTitre: { color: '#fff', fontSize: 22, ...F.bold },
  puce: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  coche: { color: C.dGreen, fontSize: 14, lineHeight: 22, ...F.bold },
  puceTxt: { flex: 1, color: '#dbe3ff', fontSize: 14.5, lineHeight: 22, ...F.regular },
  cadreLarge: { aspectRatio: 2424 / 1704, padding: 0 },
  cadreMobile: { height: 500, justifyContent: 'center' },
  captureMobile: { width: 220, height: 220 * 1736 / 828 },
  vitrine: { borderRadius: 18, backgroundColor: D.carte, borderWidth: 1, borderColor: D.trait, padding: 14, alignItems: 'center', overflow: 'hidden' },
  categorie: { color: D.bleu, fontSize: 12, letterSpacing: 1.4, ...F.bold },
  outilTitre: { color: '#fff', fontSize: 24, lineHeight: 30, ...F.bold },
  outilTexte: { color: D.doux, fontSize: 15, lineHeight: 24, ...F.regular },
  formule: { flexGrow: 1, borderWidth: 1, borderColor: D.trait, borderRadius: 18, padding: 22, backgroundColor: D.carte },
  formuleForte: { borderColor: D.bleu, borderWidth: 2 },
  badge: { position: 'absolute', top: -12, right: 18, backgroundColor: D.bleu, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeTxt: { color: '#fff', fontSize: 11.5, ...F.bold },
  formuleNom: { color: '#9db5ff', fontSize: 14, letterSpacing: 0.4, ...F.bold },
  prix: { color: '#fff', fontSize: 28, marginTop: 6, marginBottom: 16, ...F.bold },
  parMois: { color: D.doux, fontSize: 13, ...F.regular },
  note: { color: D.doux, fontSize: 12.5, lineHeight: 19, marginTop: 18, textAlign: 'center', ...F.regular },
  competition: { flexGrow: 1, backgroundColor: D.carte, borderWidth: 1, borderColor: D.trait, borderRadius: 16, padding: 18, gap: 6 },
  disponible: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  disponibleTxt: { color: C.dGreen, fontSize: 12, ...F.semi },
  competitionNom: { color: '#fff', fontSize: 17, ...F.bold },
  competitionDetail: { color: D.doux, fontSize: 13, ...F.regular },
  final: { borderRadius: 26, overflow: 'hidden', paddingVertical: 48, paddingHorizontal: 22, alignItems: 'center' },
  compteurs: { flexDirection: 'row', gap: 36, marginTop: 24, marginBottom: 4 },
  compteur: { color: '#fff', fontSize: 30, ...F.bold },
  compteurNom: { color: '#c3d2ff', fontSize: 13, ...F.medium },
  mentions: { color: '#c3d2ff', fontSize: 12.5, textAlign: 'center', marginTop: 18, ...F.regular },
  pied: { backgroundColor: '#ffffff', paddingTop: 56, paddingBottom: 28, overflow: 'hidden' },
  drapeau: { position: 'absolute', left: 0, right: 0, top: 0, height: 4, flexDirection: 'row' },
  filigrane: { position: 'absolute', left: 0, right: 0, bottom: -16, textAlign: 'center', color: 'rgba(11,31,77,.045)', fontSize: 64, letterSpacing: -2, ...F.bold },
  piedHaut: { gap: 36 },
  colonnes: { flexDirection: 'row', flexWrap: 'wrap', gap: 28 },
  piedTexte: { color: C.ink2, fontSize: 14, lineHeight: 22, maxWidth: 380, ...F.regular },
  statut: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: C.green50, borderWidth: 1, borderColor: 'rgba(18,128,92,.25)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  statutTxt: { color: C.green, fontSize: 12, ...F.semi },
  etiquettes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  etiquette: { borderWidth: 1, borderColor: C.line2, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: C.bg },
  etiquetteTxt: { color: C.ink2, fontSize: 11.5, ...F.medium },
  colonneTitre: { color: C.ink, fontSize: 12, letterSpacing: 1.4, marginBottom: 2, textTransform: 'uppercase', ...F.bold },
  colonneLigne: { color: C.muted, fontSize: 14, ...F.regular },
  colonneLigneActive: { color: C.blue },
  adresse: { gap: 14, marginTop: 44, padding: 18, borderRadius: 16, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  adresseTitre: { color: C.ink, fontSize: 14.5, ...F.semi },
  adresseTxt: { color: C.muted, fontSize: 13, lineHeight: 19, ...F.regular },
  adresseBouton: { alignSelf: 'flex-start', height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: C.red, justifyContent: 'center' },
  adresseBoutonTxt: { color: '#fff', fontSize: 13.5, ...F.semi },
  bas: { gap: 14, marginTop: 26, paddingTop: 20, borderTopWidth: 1, borderTopColor: C.line },
  basTxt: { color: C.muted, fontSize: 12.5, ...F.regular },
  haut: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  hautTxt: { color: C.ink, fontSize: 16, ...F.bold },
});
