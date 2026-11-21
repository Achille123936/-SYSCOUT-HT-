import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { api } from '../api';
import { useDirect } from '../live';
import { C, F } from '../theme';
import { ACTIONS, nombre } from '../constantes';
import { Colonnes, Ecran, Etat, Card, Badge, Button, Alert, Segmented, Rangee, useChargement, useFormulaire } from '../components/ui';

const NOM_ACTION = Object.fromEntries(ACTIONS.map(([cle, nom]) => [cle, nom]));
const km = (metres) => (metres == null ? '—' : `${(metres / 1000).toFixed(1).replace('.', ',')} km`);
const LIGNES = [
  ['tirs', 'Tirs'], ['tirs_cadres', 'Tirs cadrés'], ['xg', 'xG'], ['passes', 'Passes'], ['passes_reussies_pct', 'Passes réussies', '%'],
  ['duels_gagnes_pct', 'Duels gagnés', '%'], ['centres', 'Centres'], ['dribbles_reussis', 'Dribbles réussis'],
  ['recuperations', 'Récupérations'], ['interceptions', 'Interceptions'], ['fautes', 'Fautes'], ['cartons', 'Cartons'],
];
const VUES = [['jeu', 'Jeu'], ['defense', 'Défense'], ['physique', 'Physique']];
const COLONNES = {
  jeu: [['minutes_jouees', 'Min'], ['buts', 'Buts'], ['tirs', 'Tirs'], ['xg', 'xG'], ['passes', 'Passes'], ['passes_reussies_pct', '% réus.']],
  defense: [['duels', 'Duels'], ['duels_gagnes_pct', '% gag.'], ['recuperations', 'Récup.'], ['interceptions', 'Interc.'], ['fautes', 'Fautes'], ['cartons', 'Cart.']],
  physique: [['distance', 'Dist.'], ['sprint', 'Haute int.'], ['sprints', 'Sprints'], ['vmax', 'V. max']],
};

function valeur(joueur, cle) {
  const p = joueur.physique;
  if (cle === 'distance') return km(p?.distance_m);
  if (cle === 'sprint') return p?.distance_sprint_m == null ? '—' : `${p.distance_sprint_m} m`;
  if (cle === 'sprints') return nombre(p?.sprints);
  if (cle === 'vmax') return p?.vitesse_max_kmh == null ? '—' : `${String(p.vitesse_max_kmh).replace('.', ',')}`;
  return nombre(joueur[cle]);
}

// Match en direct : le serveur pousse le tableau à chaque action codée (WebSocket)
export function DirectScreen({ navigation, route }) {
  const { id } = route.params;
  const [equipe, setEquipe] = useState('domicile');
  const [vue, setVue] = useState('jeu');
  const { donnees: d, recharger, connexion, ...etat } = useDirect(id);

  const m = d?.match;
  const p = d?.possession;
  const club = m ? m[equipe].id : null;
  const joueurs = (d?.joueurs || []).filter((j) => j.club === club && (j.minutes_jouees > 0 || j.est_titulaire));
  const physique = d && (d.equipes.domicile.distance_m != null || d.equipes.exterieur.distance_m != null);

  return (
    <Ecran titre={m ? `${m.domicile.sigle || m.domicile.nom} – ${m.exterieur.sigle || m.exterieur.nom}` : 'Direct'}
      sousTitre={m ? `J${m.journee} · ${m.etat_libelle}` : null}
      droite={d ? <Badge text={d.en_direct ? '● En direct' : 'Hors direct'} tone={d.en_direct ? 'r' : 'n'} /> : null}>
      <Etat {...etat} recharger={recharger} donnees={d} />
      {d ? (
        <>
          <View style={st.tableau}>
            <Text style={[st.equipe, { textAlign: 'right' }]}>{m.domicile.nom}</Text>
            <View style={{ alignItems: 'center' }}>
              <Text style={st.score}>{d.score[0]} – {d.score[1]}</Text>
              <Text style={st.minute}>{d.minute}' · {d.nb_evenements} actions</Text>
            </View>
            <Text style={st.equipe}>{m.exterieur.nom}</Text>
          </View>
          {!d.en_direct && m.etat !== 'STATS_PUBLIEES' ? <Alert tone="i" text="Aucun analyste ne code ce match en ce moment : les chiffres sont ceux du dernier codage." /> : null}
          {d.sources && (d.sources.ia_confirmes || d.sources.ia_corriges || d.propositions.en_attente) ? (
            <Text style={st.sources}>
              Source des chiffres : {d.sources.analyste} action(s) saisie(s) par l'analyste, {d.sources.ia_confirmes} proposée(s) par l'IA et confirmée(s), {d.sources.ia_corriges} corrigée(s).
              {d.propositions.en_attente ? ` ${d.propositions.en_attente} proposition(s) de l'IA en attente de vérification ne sont pas comptées.` : ''}
            </Text>
          ) : null}
          {d.en_direct && connexion === 'releve' ? <Alert tone="w" text="Liaison en temps réel interrompue : le tableau est relu toutes les 5 secondes en attendant qu'elle revienne." /> : null}

          <Colonnes>
          <Card title="Possession du ballon" badge={p.methode ? <Badge text={p.methode === 'chronometre' ? 'Chronométrée' : 'Estimée par les passes'} tone={p.methode === 'chronometre' ? 'g' : 'a'} /> : null}>
            {p.domicile == null ? <Text style={st.vide}>Pas encore de donnée de possession.</Text> : (
              <>
                <View style={st.possession}>
                  <Text style={[st.pct, { color: C.blue }]}>{nombre(p.domicile)} %</Text>
                  <Text style={[st.pct, { color: C.red }]}>{nombre(p.exterieur)} %</Text>
                </View>
                <View style={st.barre}>
                  <View style={{ flex: Math.max(p.domicile, 1), backgroundColor: C.blue }} />
                  <View style={{ flex: Math.max(p.exterieur, 1), backgroundColor: C.red }} />
                </View>
                {p.en_cours ? <Text style={st.enCours}>● Ballon : {p.en_cours === m.domicile.id ? m.domicile.nom : m.exterieur.nom}</Text> : <View style={{ height: 10 }} />}
              </>
            )}
          </Card>

          <Card title="Statistiques du match">
            {[...LIGNES, ...(physique ? [['distance_m', 'Distance parcourue', 'km'], ['sprints', 'Sprints'], ['vitesse_max_kmh', 'Vitesse max (km/h)']] : [])].map(([cle, nom, unite]) => {
              const affiche = (v) => (unite === 'km' ? km(v) : nombre(v, unite === '%' ? '%' : ''));
              return (
                <View key={cle} style={st.ligne}>
                  <Text style={[st.val, { color: C.blue }]}>{affiche(d.equipes.domicile[cle])}</Text>
                  <Text style={st.cle}>{nom}</Text>
                  <Text style={[st.val, { color: C.red, textAlign: 'right' }]}>{affiche(d.equipes.exterieur[cle])}</Text>
                </View>
              );
            })}
            <View style={{ height: 8 }} />
          </Card>

          <Card title="Statistiques individuelles">
            <Segmented options={[['domicile', m.domicile.sigle || 'Domicile'], ['exterieur', m.exterieur.sigle || 'Extérieur']]} value={equipe} onChange={setEquipe} />
            <Segmented options={VUES} value={vue} onChange={setVue} />
            <View style={st.entete}>
              <Text style={[st.th, st.nom]}>JOUEUR</Text>
              {COLONNES[vue].map(([cle, nom]) => <Text key={cle} style={st.th}>{nom.toUpperCase()}</Text>)}
            </View>
            {joueurs.map((j) => (
              <Pressable key={j.joueur} style={st.rang} onPress={() => navigation.navigate('JoueurDetail', { id: j.joueur })}>
                <Text style={[st.td, st.nom]} numberOfLines={1}>{j.nom} <Text style={{ color: C.muted }}>{j.poste}</Text></Text>
                {COLONNES[vue].map(([cle]) => <Text key={cle} style={st.td}>{valeur(j, cle)}</Text>)}
              </Pressable>
            ))}
            {vue === 'physique' && !physique ? <Text style={st.vide}>Aucune donnée physique saisie pour ce match (capteurs GPS ou saisie manuelle).</Text> : null}
            <View style={{ height: 8 }} />
          </Card>

          <Card title="Dernières actions">
            {!d.derniers.length ? <Text style={st.vide}>Aucune action codée pour l'instant.</Text> : null}
            {d.derniers.map((e) => (
              <View key={e.id} style={st.rang}>
                <Text style={[st.td, { flex: 0, width: 34, textAlign: 'left', color: C.muted }]}>{e.minute}'</Text>
                <View style={[st.point, { backgroundColor: e.club === m.domicile.id ? C.blue : C.red }]} />
                <Text style={[st.td, st.nom]} numberOfLines={1}>
                  <Text style={F.semi}>{NOM_ACTION[e.type_action]}</Text> · {e.joueur_nom}
                  {e.source === 'AI' ? <Text style={{ color: C.muted }}>{e.statut_validation === 'CORRECTED' ? ' · IA corrigée' : ' · IA confirmée'}</Text> : null}
                </Text>
                <Text style={[st.td, { color: e.resultat ? C.green : C.red }]}>{e.resultat ? 'Réussi' : 'Raté'}</Text>
              </View>
            ))}
            <View style={{ height: 8 }} />
          </Card>
          </Colonnes>
        </>
      ) : null}
    </Ecran>
  );
}

// Saisie des données physiques individuelles d'un match (relevé des capteurs GPS ou saisie manuelle)
export function PhysiqueScreen({ navigation, route }) {
  const { id } = route.params;
  const f = useFormulaire({});
  const [equipe, setEquipe] = useState(0);
  const [source, setSource] = useState('GPS');
  const { donnees: m, ...etat } = useChargement(async () => {
    const [match, mesures] = await Promise.all([api.get(`/matchs/${id}/`), api.get(`/matchs/${id}/physique/`)]);
    const lignes = {};
    mesures.forEach((x) => {
      lignes[x.joueur] = {
        distance: x.distance_m == null ? '' : String(x.distance_m), sprint: x.distance_sprint_m == null ? '' : String(x.distance_sprint_m),
        sprints: x.sprints == null ? '' : String(x.sprints), vmax: x.vitesse_max_kmh == null ? '' : String(x.vitesse_max_kmh).replace('.', ','),
      };
    });
    f.setValeurs(lignes);
    if (mesures[0]) setSource(mesures[0].source);
    return match;
  }, [id]);

  const changer = (joueur, champ) => (texte) => f.setValeurs((v) => ({ ...v, [joueur]: { ...v[joueur], [champ]: texte.replace(/[^\d,.]/g, '') } }));
  const enregistrer = () => f.soumettre(async () => {
    const entier = (t) => (t ? Math.round(Number(String(t).replace(',', '.'))) : null);
    const donnees = m.compositions.filter((c) => f.valeurs[c.joueur]).map((c) => {
      const l = f.valeurs[c.joueur];
      return {
        joueur: c.joueur, distance_m: entier(l.distance), distance_sprint_m: entier(l.sprint), sprints: entier(l.sprints),
        vitesse_max_kmh: l.vmax ? Number(String(l.vmax).replace(',', '.')) : null, source,
      };
    });
    await api.put(`/matchs/${id}/physique/`, { donnees });
    navigation.goBack();
  });

  const clubs = m ? [[m.club_domicile, m.domicile_nom], [m.club_exterieur, m.exterieur_nom]] : [];
  const lignes = m ? m.compositions.filter((c) => c.club === clubs[equipe][0] && (c.est_titulaire || c.minutes_jouees > 0)) : [];
  const CHAMPS = [['distance', 'Distance (m)'], ['sprint', 'Haute int. (m)'], ['sprints', 'Sprints'], ['vmax', 'V. max (km/h)']];

  return (
    <Ecran titre="Données physiques" sousTitre={m ? `J${m.journee} · ${m.domicile_nom} – ${m.exterieur_nom}` : null}>
      <Etat {...etat} donnees={m} />
      {m ? (
        <>
          <Alert tone="i" text="Ces données viennent des capteurs GPS portés par les joueurs, ou d'un relevé manuel : la vidéo ne permet pas de les mesurer." />
          <Alert tone="e" text={f.message} />
          <Button title="Utiliser ce téléphone comme capteur GPS" kind="success" style={{ marginBottom: 12 }}
            onPress={() => navigation.navigate('Capteur', { id })} />
          <Segmented label="Source" options={[['GPS', 'Capteur GPS'], ['MANUEL', 'Saisie manuelle'], ['VIDEO', 'Suivi vidéo']]} value={source} onChange={setSource} />
          <Segmented options={clubs.map(([, nom], i) => [i, nom])} value={equipe} onChange={setEquipe} />
          {lignes.map((c) => (
            <Card key={c.joueur} title={`${c.joueur_nom} · ${c.poste}`} badge={<Badge text={`${c.minutes_jouees}'`} />}>
              <Rangee style={{ marginBottom: 12 }}>
                {CHAMPS.map(([champ, nom]) => (
                  <View key={champ} style={{ flex: 1 }}>
                    <Text style={st.petit}>{nom}</Text>
                    <TextInput style={st.saisie} keyboardType="decimal-pad" value={f.valeurs[c.joueur]?.[champ] || ''} onChangeText={changer(c.joueur, champ)}
                      accessibilityLabel={`${nom} de ${c.joueur_nom}`} />
                  </View>
                ))}
              </Rangee>
            </Card>
          ))}
          <Rangee style={{ marginBottom: 10 }}>
            <Button title="Annuler" kind="secondary" style={{ flex: 1 }} onPress={navigation.goBack} />
            <Button title="Enregistrer" style={{ flex: 2 }} onPress={enregistrer} loading={f.envoi} />
          </Rangee>
        </>
      ) : null}
    </Ecran>
  );
}

const st = StyleSheet.create({
  tableau: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.navy, borderRadius: 14, padding: 16, marginBottom: 12 },
  equipe: { flex: 1, color: '#fff', fontSize: 14.5, ...F.semi },
  score: { color: '#fff', fontSize: 30, ...F.bold },
  minute: { color: '#9fb0dd', fontSize: 11.5, ...F.regular },
  sources: { color: C.muted, fontSize: 12, lineHeight: 17, marginBottom: 12, ...F.regular },
  possession: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  pct: { fontSize: 22, ...F.bold },
  barre: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: C.line },
  enCours: { fontSize: 12, color: C.ink2, marginTop: 8, marginBottom: 10, ...F.medium },
  ligne: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f1f3' },
  val: { width: 76, fontSize: 14, ...F.bold },
  cle: { flex: 1, textAlign: 'center', fontSize: 12.5, color: C.muted, ...F.regular },
  entete: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  th: { flex: 1, fontSize: 9.5, color: C.muted, textAlign: 'right', ...F.semi },
  rang: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f1f3' },
  td: { flex: 1, fontSize: 12.5, color: C.ink, textAlign: 'right', ...F.regular },
  nom: { flex: 2.6, textAlign: 'left' },
  point: { width: 8, height: 8, borderRadius: 4 },
  vide: { color: C.muted, fontSize: 13, paddingVertical: 10, ...F.regular },
  petit: { fontSize: 10.5, color: C.ink2, marginBottom: 4, ...F.semi },
  saisie: { height: 40, borderWidth: 1, borderColor: C.line2, borderRadius: 8, paddingHorizontal: 8, fontSize: 13.5, color: C.ink, backgroundColor: '#fff', minWidth: 0 },
});
