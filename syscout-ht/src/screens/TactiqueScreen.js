import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, Line, Text as SvgText } from 'react-native-svg';
import { api } from '../api';
import { C, F } from '../theme';
import { nombre } from '../constantes';
import { Lignes } from '../components/CarteTerrain';
import { Colonnes, Ecran, Etat, Card, Info, Segmented, Badge, Alert, useChargement } from '../components/ui';

const L = 105, H = 68; // terrain en mètres ; chaque équipe est montrée attaquant vers la droite
const PERIODES = [['match', 'Match'], ['1', '1re mi-temps'], ['2', '2e mi-temps']];
const BORNES = { match: {}, 1: { fin: 45 }, 2: { debut: 46 } };
const VUES = [['activite', "Zones d'activité"], ['positions', 'Positions moyennes'], ['progressives', 'Passes progressives']];
const m = (v) => (v == null ? '—' : `${String(v).replace('.', ',')} m`);

function Terrain({ equipe, vue, couleur }) {
  const { colonnes, rangs, cases } = equipe.carte_activite;
  const maximum = Math.max(1, ...cases);
  return (
    <View style={st.terrain}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${L} ${H}`}>
        <Rect width={L} height={H} fill="#f7f9fc" />
        {vue === 'activite' ? cases.map((n, i) => (n ? (
          <Rect key={i} x={(i % colonnes) * (L / colonnes)} y={Math.floor(i / colonnes) * (H / rangs)} width={L / colonnes} height={H / rangs}
            fill={couleur} fillOpacity={0.08 + 0.72 * (n / maximum)} />
        ) : null)) : null}
        <Lignes />
        {vue === 'positions' ? equipe.positions_moyennes.filter((p) => p.est_titulaire).map((p) => (
          <React.Fragment key={p.joueur}>
            <Circle cx={(p.x / 100) * L} cy={(p.y / 100) * H} r={3.1} fill={couleur} fillOpacity={p.fiable ? 0.95 : 0.4}
              stroke="#ffffff" strokeWidth={0.5} strokeDasharray={p.fiable ? undefined : '1 0.8'} />
            <SvgText x={(p.x / 100) * L} y={(p.y / 100) * H + 1.2} fontSize={3.2} fill="#ffffff" textAnchor="middle" fontWeight="bold">
              {p.numero_maillot ?? p.poste}
            </SvgText>
          </React.Fragment>
        )) : null}
        {vue === 'progressives' ? equipe.passes_progressives.detail.map((p, i) => (
          <React.Fragment key={i}>
            <Line x1={(p.depart[0] / 100) * L} y1={(p.depart[1] / 100) * H} x2={(p.arrivee[0] / 100) * L} y2={(p.arrivee[1] / 100) * H}
              stroke={couleur} strokeWidth={0.6} strokeOpacity={0.8} />
            <Circle cx={(p.arrivee[0] / 100) * L} cy={(p.arrivee[1] / 100) * H} r={0.9} fill={couleur} />
          </React.Fragment>
        )) : null}
      </Svg>
    </View>
  );
}

// MOD-08 — Analyse tactique d'un match (SRS HAITI SCOUT AI §11), avec les définitions et les limites des données
export default function TactiqueScreen({ route }) {
  const { id } = route.params;
  const [cote, setCote] = useState('domicile');
  const [periode, setPeriode] = useState('match');
  const [vue, setVue] = useState('activite');
  const { donnees, recharger, ...etat } = useChargement(async () => {
    const [match, tactique] = await Promise.all([api.get(`/matchs/${id}/`), api.get(`/matchs/${id}/tactique/`, BORNES[periode])]);
    return { match, tactique };
  }, [id, periode]);
  const mt = donnees?.match;
  const t = donnees?.tactique;
  const e = t?.equipes[cote];
  const autre = t?.equipes[cote === 'domicile' ? 'exterieur' : 'domicile'];
  const couleur = cote === 'domicile' ? C.blue : C.red;
  const noms = mt ? { domicile: mt.domicile_sigle || mt.domicile_nom, exterieur: mt.exterieur_sigle || mt.exterieur_nom } : {};
  const nomJoueur = (joueur) => e?.positions_moyennes.find((p) => p.joueur === joueur)?.nom;

  return (
    <Ecran titre="Analyse tactique" sousTitre={mt ? `J${mt.journee} · ${mt.domicile_nom} – ${mt.exterieur_nom}` : null}>
      <Etat {...etat} recharger={recharger} donnees={donnees} />
      {e ? (
        <>
          <Segmented options={[['domicile', mt.domicile_nom], ['exterieur', mt.exterieur_nom]]} value={cote} onChange={setCote} />
          <Segmented options={PERIODES} value={periode} onChange={setPeriode} />
          {e.avertissements.map((texte) => <Alert key={texte} tone="w" text={texte} />)}
          <Colonnes>
            <Card title="Sur le terrain" badge={<Badge text={`${e.actions} actions`} tone={cote === 'domicile' ? 'b' : 'r'} />}>
              <Segmented options={VUES} value={vue} onChange={setVue} />
              <Terrain equipe={e} vue={vue} couleur={couleur} />
              <Text style={st.legende}>
                Sens de l'attaque →{' '}
                {vue === 'activite' ? '· plus la case est foncée, plus l\'équipe y agit (actions avec ballon seulement).'
                  : vue === 'positions' ? '· position moyenne des actions de chaque titulaire ; cercle pâle et pointillé = moins de 5 actions, position peu sûre.'
                    : `· ${e.passes_progressives.nombre} passe(s) progressive(s) sur ${e.passes_progressives.passes_classables} passe(s) réussie(s) avec un point d'arrivée codé.`}
              </Text>
            </Card>

            <Card title="Organisation">
              <Info libelle="Formation déclarée" valeur={e.formation.declaree || '—'} />
              <Info libelle="Formation observée" valeur={e.formation.observee ? `${e.formation.observee.schema} (approximative)` : 'Données insuffisantes'} />
              {e.formation.observee ? (
                <Text style={st.lignes}>
                  {e.formation.observee.lignes.map((ligne, i) => `Ligne ${i + 1} : ${ligne.map(nomJoueur).filter(Boolean).join(', ')}`).join('\n')}
                </Text>
              ) : null}
              <Info libelle="Largeur occupée" valeur={m(e.bloc?.largeur_m)} />
              <Info libelle="Longueur occupée" valeur={m(e.bloc?.longueur_m)} />
              <Info libelle="Hauteur de la ligne arrière" valeur={m(e.bloc?.hauteur_defense_m)} />
              <View style={{ height: 8 }} />
            </Card>

            <Card title="Pressing et transitions">
              <View style={st.entete}>
                <Text style={[st.th, { flex: 2, textAlign: 'left' }]}>INDICATEUR</Text>
                <Text style={[st.th, { color: couleur }]}>{noms[cote]}</Text>
                <Text style={st.th}>{noms[cote === 'domicile' ? 'exterieur' : 'domicile']}</Text>
              </View>
              {[
                ['PPDA (bas = pressing haut)', (x) => nombre(x.pressing.ppda)],
                ['Passes progressives', (x) => x.passes_progressives.nombre],
                ['Récupérations', (x) => x.transitions.recuperations],
                ['Récupérations hautes', (x) => x.transitions.recuperations_hautes],
                ['Récupérations suivies d\'un tir', (x) => x.transitions.suivies_d_un_tir],
              ].map(([libelle, valeur]) => (
                <View key={libelle} style={st.rang}>
                  <Text style={[st.td, { flex: 2, textAlign: 'left' }]}>{libelle}</Text>
                  <Text style={[st.td, F.bold, { color: couleur }]}>{valeur(e)}</Text>
                  <Text style={st.td}>{valeur(autre)}</Text>
                </View>
              ))}
              <View style={{ height: 8 }} />
            </Card>

            <Card title="Définitions et limites">
              <Text style={st.definition}>Source : {t.source}. Aucune donnée de suivi continu des joueurs n'est utilisée ; une proposition de l'IA non vérifiée n'y entre jamais.</Text>
              {[['Zones d\'activité', 'carte_activite'], ['Position moyenne', 'position_moyenne'], ['Formation', 'formation'], ['Bloc', 'bloc'],
                ['Passes progressives', 'passes_progressives'], ['Pressing', 'pressing'], ['Transitions', 'transitions']].map(([titre, cle]) => (
                <Text key={cle} style={st.definition}><Text style={F.semi}>{titre} · </Text>{t.definitions[cle]}</Text>
              ))}
              <View style={{ height: 6 }} />
            </Card>
          </Colonnes>
        </>
      ) : null}
    </Ecran>
  );
}

const st = StyleSheet.create({
  terrain: { width: '100%', aspectRatio: L / H, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  legende: { fontSize: 11.5, lineHeight: 16, color: C.muted, marginTop: 8, marginBottom: 12, ...F.regular },
  lignes: { fontSize: 12, lineHeight: 17, color: C.ink2, marginBottom: 8, ...F.regular },
  entete: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  th: { flex: 1, fontSize: 10, color: C.muted, textAlign: 'right', ...F.semi },
  rang: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f1f3' },
  td: { flex: 1, fontSize: 13, color: C.ink, textAlign: 'right', ...F.regular },
  definition: { fontSize: 12, lineHeight: 17, color: C.ink2, marginBottom: 8, ...F.regular },
});
