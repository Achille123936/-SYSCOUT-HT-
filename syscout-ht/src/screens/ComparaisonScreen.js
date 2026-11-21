import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { api, exporterPdf } from '../api';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import { dateFR } from '../constantes';
import { Colonnes, Ecran, Etat, Card, Button, Badge, Alert, Avatar, Rangee, useChargement } from '../components/ui';
import Radar from '../components/Radar';
import SelecteurJoueur from '../components/SelecteurJoueur';
import { AjoutShortlist, TableauStats } from './JoueurDetailScreen';

const COULEURS = [C.blue, C.red, C.green, C.amber, '#7c3aed'];

function Player({ fiche, col, onPress }) {
  const j = fiche.joueur;
  const indice = fiche.statistique?.indice_performance;
  return (
    <Pressable onPress={onPress} style={[st.player, { borderLeftColor: col }]}>
      <Avatar nom={j.nom_complet} couleur={col} />
      <View style={{ flex: 1 }}>
        <Text style={st.pName}>{j.nom_complet}</Text>
        <Text style={st.pClub}>{j.club_nom} · {j.poste} · {j.age} ans</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[st.idx, { color: col }]}>{indice != null ? Math.round(indice) : '—'}</Text>
        <Text style={st.idxL}>indice /100</Text>
      </View>
    </Pressable>
  );
}

// CU09 — Consulter le radar et comparer de deux à cinq joueurs (SRS §12.2)
export default function ComparaisonScreen({ navigation, route }) {
  const { a: idA, b: idB, autres = [] } = route.params;
  const ids = [idA, idB, ...autres];
  const { a: role } = useAuth();
  const [selecteur, setSelecteur] = useState(null); // null, 'ajout' ou le rang du joueur à remplacer
  const [shortlist, setShortlist] = useState(null);
  const [message, setMessage] = useState(null);
  const { donnees, ...etat } = useChargement(() => api.get('/joueurs/comparer/', { ids: ids.join(',') }), [ids.join(',')]);
  const changer = (rang, id) => {
    const suite = [...ids];
    if (id == null) suite.splice(rang, 1); else suite[rang] = id;
    navigation.setParams({ a: suite[0], b: suite[1], autres: suite.slice(2) });
  };
  const exporter = async () => {
    try { await exporterPdf({ type: 'comparaison', id: idA, autre: ids.slice(1) }); } catch (e) { setMessage(e.message); }
  };
  const fiches = donnees?.joueurs || [];
  const rapport = fiches.map((f) => f.dernier_rapport).find(Boolean);
  const memeGroupe = fiches.every((f) => f.joueur.groupe_poste === fiches[0].joueur.groupe_poste);

  return (
    <Ecran titre="Comparaison" sousTitre={donnees ? `Saison ${donnees.saison.libelle} · minimum 450 minutes` : null}>
      <Etat {...etat} donnees={donnees} />
      {fiches.length >= 2 ? (
        <>
          <Alert tone="e" text={message} />
          {fiches.map((f, i) => (
            <Player key={f.joueur.id} fiche={f} col={COULEURS[i]}
              onPress={() => (i === 0 ? navigation.navigate('JoueurDetail', { id: idA }) : setSelecteur(i))} />
          ))}
          {donnees.avertissements.map((t) => <Alert key={t} tone="w" text={t} />)}
          {!memeGroupe ? <Alert tone="i" text="Ces joueurs n'occupent pas le même type de poste : chaque centile est calculé parmi les joueurs de son propre poste." /> : null}

          <Colonnes>
          <Card title="Radar des centiles">
            <Radar series={fiches.map((f, i) => ({ nom: f.joueur.nom_complet, couleur: COULEURS[i], centiles: f.statistique?.centiles }))} />
          </Card>

          <Card title="Statistiques de la saison">
            <TableauStats colonnes={fiches.map((f, i) => ({ nom: f.joueur.nom, couleur: COULEURS[i], statistique: f.statistique }))} />
          </Card>

          {rapport ? (
            <Card title="Dernier rapport" badge={<Badge text="Validé" tone="g" />}>
              <Text style={st.rep}>
                <Text style={{ color: C.ink, ...F.semi }}>{rapport.joueur_nom} · {rapport.note}/10 · {rapport.recommandation_libelle}{'\n'}</Text>
                {rapport.forces} {rapport.faiblesses}{'\n'}
                <Text style={{ color: C.muted }}>{rapport.scout_nom}, {dateFR(rapport.date_rapport)}</Text>
              </Text>
            </Card>
          ) : null}

          </Colonnes>

          <Rangee style={{ marginBottom: 10 }}>
            {ids.length < 5 ? <Button title="+ Joueur" kind="secondary" style={{ flex: 1 }} onPress={() => setSelecteur('ajout')} /> : null}
            {ids.length > 2 ? <Button title="Retirer le dernier" kind="secondary" style={{ flex: 1 }} onPress={() => changer(ids.length - 1, null)} /> : null}
          </Rangee>
          <Rangee style={{ marginBottom: 10 }}>
            {role('ADMIN', 'SCOUT', 'DIRECTEUR', 'CLIENT') ? <Button title="+ Shortlist" kind="secondary" style={{ flex: 1 }} onPress={() => setShortlist(fiches[1].joueur)} /> : null}
            <Button title="Exporter en PDF" style={{ flex: 1.3 }} onPress={exporter} />
          </Rangee>
          <SelecteurJoueur visible={selecteur !== null} titre={selecteur === 'ajout' ? 'Ajouter un joueur' : 'Remplacer ce joueur'}
            exclure={ids} onFermer={() => setSelecteur(null)}
            onChoisir={(autre) => { const rang = selecteur === 'ajout' ? ids.length : selecteur; setSelecteur(null); changer(rang, autre.id); }} />
          {shortlist ? <AjoutShortlist joueur={shortlist} visible onFermer={() => setShortlist(null)} /> : null}
        </>
      ) : null}
    </Ecran>
  );
}

const st = StyleSheet.create({
  player: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, borderLeftWidth: 4, padding: 12, marginBottom: 10 },
  pName: { fontSize: 15, color: C.ink, ...F.bold },
  pClub: { fontSize: 12, color: C.muted, ...F.regular },
  idx: { fontSize: 24, ...F.bold },
  idxL: { fontSize: 10.5, color: C.muted, ...F.regular },
  rep: { fontSize: 13, lineHeight: 19, color: C.ink2, marginBottom: 10, ...F.regular },
});
