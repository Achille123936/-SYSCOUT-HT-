import React, { useState } from 'react';
import { Text } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { dateFR } from '../constantes';
import { Ecran, Etat, Card, Field, Button, Alert, Ligne, Rangee, Avatar, Badge, confirmer, useChargement, s } from '../components/ui';
import SelecteurJoueur from '../components/SelecteurJoueur';

// CU10 — Gérer ses shortlists (listes de joueurs suivis en vue d'un recrutement)
export function ShortlistsScreen({ navigation }) {
  const [nom, setNom] = useState('');
  const [message, setMessage] = useState(null);
  const { donnees, recharger, ...etat } = useChargement(() => api.tout('/shortlists/'));
  const creer = async () => {
    if (!nom.trim()) { setMessage('Donnez un nom à la shortlist.'); return; }
    try {
      const liste = await api.post('/shortlists/', { nom: nom.trim() });
      setNom('');
      setMessage(null);
      navigation.navigate('ShortlistDetail', { id: liste.id });
    } catch (e) { setMessage(e.message); }
  };
  return (
    <Ecran titre="Shortlists" sousTitre="Listes de joueurs suivis">
      <Card title="Nouvelle shortlist">
        <Alert tone="e" text={message} />
        <Rangee style={{ alignItems: 'flex-end' }}>
          <Field label="Nom" required placeholder="ex. Attaquants U21" value={nom} onChangeText={setNom} style={{ flex: 1 }} onSubmitEditing={creer} />
          <Button title="Créer" style={{ height: 44, marginBottom: 12 }} onPress={creer} />
        </Rangee>
      </Card>
      <Etat {...etat} recharger={recharger} donnees={donnees} vide={donnees && !donnees.length ? 'Aucune shortlist pour le moment.' : null} />
      {(donnees || []).map((liste) => (
        <Ligne key={liste.id} titre={liste.nom}
          sousTitre={`${liste.nb_joueurs} joueur(s) · ${liste.proprietaire_nom} · ${dateFR(liste.date_creation)}`}
          onPress={() => navigation.navigate('ShortlistDetail', { id: liste.id })} />
      ))}
    </Ecran>
  );
}

export function ShortlistDetailScreen({ navigation, route }) {
  const { id } = route.params;
  const { utilisateur } = useAuth();
  const [selecteur, setSelecteur] = useState(false);
  const [message, setMessage] = useState(null);
  const { donnees: liste, recharger, ...etat } = useChargement(() => api.get(`/shortlists/${id}/`), [id]);
  const mienne = liste && liste.proprietaire === utilisateur.id;

  const modifier = async (chemin, joueur) => {
    try {
      await api.post(`/shortlists/${id}/${chemin}/`, { joueur: joueur.id });
      setMessage(null);
      recharger();
    } catch (e) { setMessage(e.message); }
  };
  const retirer = async (joueur) => {
    if (await confirmer('Retirer', `Voulez-vous vraiment retirer ${joueur.nom_complet} de cette shortlist ?`)) modifier('retirer', joueur);
  };
  const supprimer = async () => {
    if (!(await confirmer('Supprimer', 'Voulez-vous vraiment supprimer cette shortlist ?'))) return;
    try { await api.delete(`/shortlists/${id}/`); navigation.goBack(); } catch (e) { setMessage(e.message); }
  };

  return (
    <Ecran titre={liste ? liste.nom : 'Shortlist'} sousTitre={liste ? `${liste.nb_joueurs} joueur(s) · ${liste.proprietaire_nom}` : null}>
      <Etat {...etat} recharger={recharger} donnees={liste} />
      {liste ? (
        <>
          <Alert tone="e" text={message} />
          <Button title="+ Ajouter un joueur" style={{ marginBottom: 12 }} onPress={() => setSelecteur(true)} />
          {!liste.joueurs_detail.length ? <Text style={s.vide}>Cette shortlist est vide.</Text> : null}
          {liste.joueurs_detail.map((j) => (
            <Ligne key={j.id} titre={j.nom_complet} sousTitre={`${j.club_nom} · ${j.poste} · ${j.age} ans`}
              gauche={<Avatar nom={j.nom_complet} />}
              droite={(
                <Rangee style={{ alignItems: 'center' }}>
                  {j.indice_performance != null ? <Badge text={String(Math.round(j.indice_performance))} tone="b" /> : null}
                  <Text onPress={() => retirer(j)} style={[s.optionTxt, { color: '#d21034', paddingHorizontal: 6 }]} accessibilityLabel={`Retirer ${j.nom_complet}`}>✕</Text>
                </Rangee>
              )}
              onPress={() => navigation.navigate('JoueurDetail', { id: j.id })} />
          ))}
          {liste.joueurs_detail.length === 2 ? (
            <Button title="Comparer ces deux joueurs" kind="secondary" style={{ marginTop: 4 }}
              onPress={() => navigation.navigate('Comparaison', { a: liste.joueurs_detail[0].id, b: liste.joueurs_detail[1].id, autres: liste.joueurs_detail.slice(2, 5).map((x) => x.id) })} />
          ) : null}
          {mienne ? <Button title="Supprimer la shortlist" kind="danger" style={{ marginTop: 10 }} onPress={supprimer} /> : null}
          <SelecteurJoueur visible={selecteur} titre="Ajouter à la shortlist" onFermer={() => setSelecteur(false)}
            onChoisir={(joueur) => { setSelecteur(false); modifier('ajouter', joueur); }} />
        </>
      ) : null}
    </Ecran>
  );
}
