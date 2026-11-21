import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, FlatList, ActivityIndicator } from 'react-native';
import { api } from '../api';
import { C } from '../theme';
import { Field, Ligne, Avatar, Badge, Button, s } from './ui';

// Recherche d'un joueur par son nom (comparaison, rapport, shortlist)
export default function SelecteurJoueur({ visible, titre = 'Choisir un joueur', filtres, exclure, onChoisir, onFermer }) {
  const [q, setQ] = useState('');
  const [joueurs, setJoueurs] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    if (!visible) return undefined;
    let actif = true;
    const attente = setTimeout(async () => {
      try {
        const r = await api.get('/joueurs/', { q, page_size: 30, ...filtres });
        if (actif) { setJoueurs(r.results.filter((j) => ![].concat(exclure ?? []).includes(j.id))); setErreur(null); }
      } catch (e) {
        if (actif) setErreur(e.message);
      }
    }, 250);
    return () => { actif = false; clearTimeout(attente); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, q, JSON.stringify(filtres), JSON.stringify(exclure)]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <Pressable style={s.voile} onPress={onFermer}>
        <Pressable style={[s.feuille, { height: '80%' }]} onPress={() => {}}>
          <Text style={s.feuilleTitre}>{titre}</Text>
          <Field placeholder="Nom du joueur…" value={q} onChangeText={setQ} />
          {erreur ? <Text style={[s.vide, { color: C.red }]}>{erreur}</Text> : null}
          {!joueurs && !erreur ? <ActivityIndicator color={C.blue} /> : null}
          <FlatList
            data={joueurs || []}
            keyExtractor={(j) => String(j.id)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={joueurs ? <Text style={s.vide}>Aucun joueur trouvé.</Text> : null}
            renderItem={({ item: j }) => (
              <Ligne
                titre={j.nom_complet}
                sousTitre={`${j.club_nom} · ${j.poste} · ${j.age} ans`}
                gauche={<Avatar nom={j.nom_complet} taille={36} />}
                droite={j.indice_performance != null ? <Badge text={String(Math.round(j.indice_performance))} tone="b" /> : null}
                onPress={() => { onChoisir(j); setQ(''); }}
              />
            )}
          />
          <Button title="Annuler" kind="secondary" style={{ marginTop: 8, height: 42 }} onPress={onFermer} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
