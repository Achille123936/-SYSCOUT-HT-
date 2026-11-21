import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { api } from '../api';
import { C, F } from '../theme';
import { dateFR, nombre } from '../constantes';
import { Ecran, Etat, Card, Select, Badge, useChargement } from '../components/ui';

const TON = { V: C.green, N: C.amber, D: C.red };

// Classement des équipes d'une compétition (Competition.afficherClassement() du SEL)
export function ChampionnatScreen({ navigation }) {
  const [competition, setCompetition] = useState(null);
  const liste = useChargement(() => api.tout('/competitions/'));
  // par défaut : la compétition qui réunit le plus de clubs (le championnat principal)
  const principale = [...(liste.donnees || [])].sort((x, y) => y.clubs.length - x.clubs.length)[0];
  const choisie = competition || principale?.id || null;
  const { donnees: d, ...etat } = useChargement(() => (choisie ? api.get(`/competitions/${choisie}/classement/`) : null), [choisie]);

  return (
    <Ecran titre="Championnat" sousTitre={d ? `${d.competition} · ${d.saison} · ${d.matchs_joues} match(s) validé(s)` : 'Classement des équipes'}>
      <Select label="Compétition" required value={choisie} onChange={setCompetition}
        options={(liste.donnees || []).map((c) => [c.id, `${c.nom} · ${c.saison_libelle}`])} />
      <Etat {...etat} erreur={etat.erreur || liste.erreur} donnees={d} />
      {d ? (
        <Card>
          <View style={st.entete}>
            <Text style={[st.th, { flex: 0, width: 22, textAlign: 'left' }]}>#</Text>
            <Text style={[st.th, st.nom]}>ÉQUIPE</Text>
            {['J', 'V', 'N', 'D', 'BP', 'BC', 'DIFF', 'PTS'].map((c) => <Text key={c} style={st.th}>{c}</Text>)}
          </View>
          {d.classement.map((l) => (
            <Pressable key={l.club} style={st.rang} onPress={() => navigation.navigate('Equipe', { id: l.club })}>
              <Text style={[st.td, { flex: 0, width: 22, textAlign: 'left', color: C.muted, ...F.bold }]}>{l.rang}</Text>
              <View style={st.nom}>
                <Text style={st.equipe} numberOfLines={1}>{l.nom}</Text>
                <View style={st.forme}>{l.forme.map((issue, i) => <View key={i} style={[st.point, { backgroundColor: TON[issue] }]} />)}</View>
              </View>
              {[l.joues, l.victoires, l.nuls, l.defaites, l.buts_pour, l.buts_contre, l.difference > 0 ? `+${l.difference}` : l.difference].map((v, i) => <Text key={i} style={st.td}>{v}</Text>)}
              <Text style={[st.td, { color: C.navy, ...F.bold }]}>{l.points}</Text>
            </Pressable>
          ))}
          <Text style={st.legende}>3 points par victoire, 1 par nul. À égalité : différence de buts, puis buts marqués. Les points sous le nom montrent les 5 derniers matchs.</Text>
        </Card>
      ) : null}
    </Ecran>
  );
}

// Fiche joueur : ses matchs de la saison, un par ligne
export function JournalMatchs({ joueur, navigation }) {
  const { donnees } = useChargement(() => api.get(`/joueurs/${joueur}/matchs/`), [joueur]);
  if (!donnees || !donnees.matchs.length) return null;
  return (
    <Card title="Match par match" badge={<Badge text={`${donnees.matchs.length} match(s)`} tone="b" />}>
      <View style={st.entete}>
        <Text style={[st.th, st.nom]}>MATCH</Text>
        {['MIN', 'BUTS', 'TIRS', 'XG', 'PASSES', '% RÉUS.'].map((c) => <Text key={c} style={st.th}>{c}</Text>)}
      </View>
      {donnees.matchs.map((m) => (
        <Pressable key={m.match} style={st.rang} onPress={() => navigation.navigate('MatchDetail', { id: m.match })}>
          <View style={st.nom}>
            <Text style={st.equipe} numberOfLines={1}>J{m.journee} · {m.domicile ? 'contre' : 'chez'} {m.adversaire}</Text>
            <Text style={st.sous}>{m.score} · {dateFR(m.date_match)}{m.est_titulaire ? '' : ' · remplaçant'}</Text>
          </View>
          <Text style={st.td}>{m.minutes_jouees}</Text>
          <Text style={[st.td, m.buts ? { color: C.red, ...F.bold } : null]}>{m.buts}</Text>
          <Text style={st.td}>{m.tirs}</Text>
          <Text style={st.td}>{nombre(m.xg)}</Text>
          <Text style={st.td}>{m.passes}</Text>
          <Text style={st.td}>{m.passes_reussies_pct == null ? '—' : m.passes_reussies_pct}</Text>
        </Pressable>
      ))}
      <View style={{ height: 8 }} />
    </Card>
  );
}

const st = StyleSheet.create({
  entete: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  th: { flex: 1, fontSize: 9.5, color: C.muted, textAlign: 'right', ...F.semi },
  rang: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f0f1f3' },
  td: { flex: 1, fontSize: 12.5, color: C.ink, textAlign: 'right', ...F.regular },
  nom: { flex: 4, textAlign: 'left' },
  equipe: { fontSize: 13.5, color: C.ink, ...F.semi },
  sous: { fontSize: 11, color: C.muted, marginTop: 1, ...F.regular },
  forme: { flexDirection: 'row', gap: 3, marginTop: 3 },
  point: { width: 7, height: 7, borderRadius: 4 },
  legende: { fontSize: 11.5, lineHeight: 16, color: C.muted, marginVertical: 10, ...F.regular },
});
