import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import { TON_ETAT, dateHeureFR } from '../constantes';
import { Ecran, Etat, Select, Badge, Button, BoutonEntete, Cellule, useChargement, useListeColonnes } from '../components/ui';

const ETATS = [['PLANIFIE', 'Planifié'], ['VIDEO_IMPORTEE', 'Vidéo importée'], ['EN_CODAGE', 'En codage'], ['STATS_PUBLIEES', 'Statistiques publiées'], ['ANNULE', 'Annulé']];

export function CarteMatch({ match, onPress }) {
  return (
    <Pressable onPress={onPress} style={st.carte}>
      <View style={st.haut}>
        <Text style={st.meta} numberOfLines={1}>J{match.journee} · {match.competition_nom} · {dateHeureFR(match.date_match)}</Text>
        <Badge text={match.etat_libelle} tone={TON_ETAT[match.etat]} />
      </View>
      <View style={st.score}>
        <Text style={[st.equipe, { textAlign: 'right' }]} numberOfLines={1}>{match.domicile_nom}</Text>
        <Text style={st.buts}>{match.score_domicile} – {match.score_exterieur}</Text>
        <Text style={st.equipe} numberOfLines={1}>{match.exterieur_nom}</Text>
      </View>
      {match.verrouille_par_nom ? <Text style={st.verrou}>● Verrouillé par {match.verrouille_par_nom}</Text> : null}
    </Pressable>
  );
}

// Liste des matchs, filtrée par compétition et par état
export default function MatchsScreen({ navigation }) {
  const { a } = useAuth();
  const [competition, setCompetition] = useState(null);
  const [etatMatch, setEtatMatch] = useState(null);
  const [pages, setPages] = useState(1);
  const colonnes = useListeColonnes();
  const competitions = useChargement(() => api.tout('/competitions/'));
  const { donnees, ...etat } = useChargement(
    () => api.get('/matchs/', { competition, etat: etatMatch, page_size: 20 * pages }), [competition, etatMatch, pages]);

  return (
    <Ecran titre="Matchs" sousTitre={donnees ? `${donnees.count} match(s)` : null} defilant={false}
      droite={a('ADMIN', 'ANALYSTE') ? <BoutonEntete titre="+ Nouveau" onPress={() => navigation.navigate('MatchForm')} /> : null}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Select placeholder="Toutes les compétitions" value={competition} onChange={(v) => { setCompetition(v); setPages(1); }} style={{ flex: 1.3 }}
          options={(competitions.donnees || []).map((c) => [c.id, `${c.nom} · ${c.saison_libelle}`])} />
        <Select placeholder="Tous les états" options={ETATS} value={etatMatch} onChange={(v) => { setEtatMatch(v); setPages(1); }} style={{ flex: 1 }} />
      </View>
      <Etat {...etat} donnees={donnees} vide={donnees && !donnees.results.length ? 'Aucun match.' : null} />
      <FlatList
        {...colonnes}
        data={donnees?.results || []}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ paddingBottom: 14 }}
        renderItem={({ item }) => <Cellule><CarteMatch match={item} onPress={() => navigation.navigate('MatchDetail', { id: item.id })} /></Cellule>}
        ListFooterComponent={donnees?.next ? <Button title="Afficher plus de matchs" kind="secondary" onPress={() => setPages(pages + 1)} /> : null}
      />
    </Ecran>
  );
}

const st = StyleSheet.create({
  carte: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 8 },
  haut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  meta: { flex: 1, fontSize: 11.5, color: C.muted, ...F.regular },
  score: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 2 },
  equipe: { flex: 1, fontSize: 14, color: C.ink, ...F.semi },
  buts: { fontSize: 18, color: C.navy, ...F.bold },
  verrou: { fontSize: 11.5, color: C.amber, marginTop: 6, ...F.medium },
});
