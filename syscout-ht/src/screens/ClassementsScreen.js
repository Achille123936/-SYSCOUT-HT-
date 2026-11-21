import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { api } from '../api';
import { C, F } from '../theme';
import { GROUPES, TRIS_CLASSEMENT, libelle, nombre } from '../constantes';
import { Ecran, Etat, Select, Segmented, Ligne, useChargement, Cellule, useListeColonnes } from '../components/ui';

// Classements par poste (RG5 : seuls les joueurs ayant joué au moins 450 minutes y figurent)
export default function ClassementsScreen({ navigation }) {
  const [groupe, setGroupe] = useState('ATTAQUANT');
  const [tri, setTri] = useState('indice_performance');
  const colonnes = useListeColonnes();
  const { donnees, ...etat } = useChargement(() => api.get('/statistiques/', { groupe, tri, page_size: 100 }), [groupe, tri]);
  const lignes = donnees?.results || [];
  const saison = lignes[0]?.saison_libelle;

  return (
    <Ecran titre="Statistiques" sousTitre={`Classements par poste${saison ? ` · ${saison}` : ''} · minimum 450 minutes`} defilant={false}>
      <Segmented options={GROUPES} value={groupe} onChange={setGroupe} />
      <Select label="Classer par" options={TRIS_CLASSEMENT} value={tri} onChange={setTri} required />
      <Etat {...etat} donnees={donnees} vide={donnees && !lignes.length ? 'Aucun joueur de ce poste n\'a encore joué 450 minutes cette saison.' : null} />
      <FlatList
        {...colonnes}
        data={lignes}
        keyExtractor={(l) => String(l.id)}
        contentContainerStyle={{ paddingBottom: 14 }}
        renderItem={({ item: l, index }) => (
          <Cellule>
            <Ligne
              titre={l.joueur_nom}
              sousTitre={`${l.club_nom} · ${l.poste} · ${l.age} ans · ${l.minutes_jouees} min`}
              gauche={<Text style={st.rang}>{index + 1}</Text>}
              droite={(
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.valeur}>{nombre(l[tri])}</Text>
                  <Text style={st.unite}>{tri === 'indice_performance' ? 'indice' : libelle(TRIS_CLASSEMENT, tri).toLowerCase()}</Text>
                </View>
              )}
              onPress={() => navigation.navigate('JoueurDetail', { id: l.joueur })}
            />
          </Cellule>
        )}
      />
    </Ecran>
  );
}

const st = StyleSheet.create({
  rang: { width: 26, textAlign: 'center', fontSize: 15, color: C.muted, ...F.bold },
  valeur: { fontSize: 18, color: C.blue, ...F.bold },
  unite: { fontSize: 10, color: C.muted, maxWidth: 90, textAlign: 'right', ...F.regular },
});
