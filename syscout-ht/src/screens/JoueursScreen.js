import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import { DIVISIONS, PIEDS, POSTES } from '../constantes';
import { Ecran, Etat, Field, Select, Ligne, Avatar, Badge, Button, BoutonEntete, Rangee, useChargement, Cellule, useListeColonnes } from '../components/ui';

const VIDE = { q: '', poste: null, pied_fort: null, division: null, age_min: '', age_max: '', indice_min: '' };

// CU10 — Rechercher des joueurs : poste, âge, pied, division, indice minimal ; liste triée par indice
export default function JoueursScreen({ navigation }) {
  const { a } = useAuth();
  const [filtres, setFiltres] = useState(VIDE);
  const [avance, setAvance] = useState(false);
  const [pages, setPages] = useState(1);
  const colonnes = useListeColonnes();
  const changer = (champ) => (valeur) => { setFiltres((f) => ({ ...f, [champ]: valeur })); setPages(1); };
  const { donnees, ...etat } = useChargement(
    () => api.get('/joueurs/', { ...filtres, page_size: 30 * pages }),
    [JSON.stringify(filtres), pages],
  );
  const actifs = Object.entries(filtres).filter(([k, v]) => k !== 'q' && v).length;

  return (
    <Ecran titre="Joueurs" sousTitre={donnees ? `${donnees.count} joueur(s) · triés par indice` : 'Recherche multicritère'} defilant={false}
      droite={a('ADMIN', 'ANALYSTE', 'SCOUT', 'CLUB_ADMIN') ? <BoutonEntete titre="+ Nouveau" onPress={() => navigation.navigate('JoueurForm')} /> : null}>
      <Rangee>
        <Field placeholder="Rechercher un joueur…" value={filtres.q} onChangeText={changer('q')} style={{ flex: 1 }} />
        <Pressable style={[st.filtre, (avance || actifs > 0) && st.filtreOn]} onPress={() => setAvance(!avance)}>
          <Text style={[st.filtreTxt, (avance || actifs > 0) && { color: C.blue }]}>Critères{actifs ? ` (${actifs})` : ''}</Text>
        </Pressable>
      </Rangee>
      {avance ? (
        <View style={st.panneau}>
          <Rangee>
            <Select label="Poste" options={POSTES} value={filtres.poste} onChange={changer('poste')} placeholder="Tous" style={{ flex: 1 }} />
            <Select label="Pied fort" options={PIEDS} value={filtres.pied_fort} onChange={changer('pied_fort')} placeholder="Tous" style={{ flex: 1 }} />
          </Rangee>
          <Rangee>
            <Select label="Division" options={DIVISIONS} value={filtres.division} onChange={changer('division')} placeholder="Toutes" style={{ flex: 1.4 }} />
            <Field label="Âge min." keyboardType="number-pad" value={filtres.age_min} onChangeText={changer('age_min')} style={{ flex: 1 }} />
            <Field label="Âge max." keyboardType="number-pad" value={filtres.age_max} onChangeText={changer('age_max')} style={{ flex: 1 }} />
          </Rangee>
          <Rangee style={{ alignItems: 'flex-end' }}>
            <Field label="Indice minimal (0 à 100)" keyboardType="number-pad" value={filtres.indice_min} onChangeText={changer('indice_min')} style={{ flex: 1 }} />
            <Button title="Effacer" kind="secondary" style={{ height: 44, marginBottom: 12 }} onPress={() => { setFiltres(VIDE); setPages(1); }} />
          </Rangee>
        </View>
      ) : null}
      <Etat {...etat} donnees={donnees} vide={donnees && !donnees.results.length ? 'Aucun joueur ne correspond à ces critères.' : null} />
      <FlatList
        {...colonnes}
        data={donnees?.results || []}
        keyExtractor={(j) => String(j.id)}
        contentContainerStyle={{ paddingBottom: 14 }}
        renderItem={({ item: j }) => (
          <Cellule>
            <Ligne
              titre={j.nom_complet}
              sousTitre={`${j.club_nom} · ${j.poste} · ${j.age} ans${j.est_mineur ? ' · mineur' : ''}`}
              gauche={<Avatar nom={j.nom_complet} photo={j.photo} />}
              droite={j.indice_performance != null
                ? <View style={{ alignItems: 'center' }}><Text style={st.indice}>{Math.round(j.indice_performance)}</Text><Text style={st.indiceL}>indice</Text></View>
                : <Badge text="—" />}
              onPress={() => navigation.navigate('JoueurDetail', { id: j.id })}
            />
          </Cellule>
        )}
        ListFooterComponent={donnees?.next ? <Button title="Afficher plus de joueurs" kind="secondary" onPress={() => setPages(pages + 1)} /> : null}
      />
    </Ecran>
  );
}

const st = StyleSheet.create({
  filtre: { height: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.line2, backgroundColor: '#fff', justifyContent: 'center' },
  filtreOn: { borderColor: C.blue, backgroundColor: C.blue50 },
  filtreTxt: { fontSize: 13, color: C.ink2, ...F.semi },
  panneau: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, paddingBottom: 0, marginBottom: 12 },
  indice: { fontSize: 19, color: C.blue, ...F.bold },
  indiceL: { fontSize: 10, color: C.muted, ...F.regular },
});
