import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { api, exporterPdf } from '../api';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import { LIGNES_STATS, PIEDS, dateFR, libelle, nombre } from '../constantes';
import { Colonnes, Ecran, Etat, Card, Info, Badge, Button, Avatar, Alert, Ligne, Field, Rangee, BoutonEntete, informer, useChargement, s } from '../components/ui';
import Radar from '../components/Radar';
import SelecteurJoueur from '../components/SelecteurJoueur';
import { JoueursSimilaires } from './IAScreen';
import CarteTerrain from '../components/CarteTerrain';
import { JournalMatchs } from './ChampionnatScreen';

// Choix (ou création) de la shortlist qui reçoit le joueur — CU10 étapes 3 et 4
export function AjoutShortlist({ joueur, visible, onFermer }) {
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState(null);
  const { donnees, recharger } = useChargement(() => (visible ? api.tout('/shortlists/') : null), [visible]);
  const ajouter = async (liste) => {
    try {
      await api.post(`/shortlists/${liste.id}/ajouter/`, { joueur: joueur.id });
      onFermer();
      informer('Shortlist mise à jour', `${joueur.nom_complet} a été ajouté à « ${liste.nom} ».`);
    } catch (e) { setErreur(e.message); }
  };
  const creer = async () => {
    if (!nom.trim()) return;
    try {
      await ajouter(await api.post('/shortlists/', { nom: nom.trim() }));
      setNom('');
      recharger();
    } catch (e) { setErreur(e.message); }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <Pressable style={s.voile} onPress={onFermer}>
        <Pressable style={s.feuille} onPress={() => {}}>
          <Text style={s.feuilleTitre}>Ajouter à la shortlist</Text>
          <Alert tone="e" text={erreur} />
          {(donnees || []).map((liste) => (
            <Ligne key={liste.id} titre={liste.nom} sousTitre={`${liste.nb_joueurs} joueur(s)`} onPress={() => ajouter(liste)} />
          ))}
          <Rangee style={{ alignItems: 'flex-end', marginTop: 6 }}>
            <Field label="Nouvelle shortlist" placeholder="Nom de la liste" value={nom} onChangeText={setNom} style={{ flex: 1 }} />
            <Button title="Créer" style={{ height: 44, marginBottom: 12 }} onPress={creer} />
          </Rangee>
          <Button title="Annuler" kind="secondary" style={{ height: 42 }} onPress={onFermer} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function TableauStats({ colonnes }) {
  // colonnes = [{ nom, couleur, statistique }]
  return (
    <View>
      <View style={st.thead}>
        <Text style={[st.th, { flex: 1.6 }]}>INDICATEUR</Text>
        {colonnes.map((c) => <Text key={c.nom} style={[st.th, { color: c.couleur }]} numberOfLines={1}>{c.nom.toUpperCase()}</Text>)}
      </View>
      {LIGNES_STATS.map(([cle, nom, unite]) => (
        <View key={cle} style={st.tr}>
          <Text style={[st.td, { flex: 1.6, color: C.muted }]}>{nom}</Text>
          {colonnes.map((c) => (
            <Text key={c.nom} style={[st.td, { color: c.couleur, ...F.semi }]}>{c.statistique ? nombre(c.statistique[cle], unite) : '—'}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// Compte « Joueur » (SRS HAITI SCOUT AI §4) : sa propre fiche, et elle seule
export function MaFicheScreen({ navigation }) {
  const { utilisateur } = useAuth();
  if (!utilisateur?.joueur) {
    return (
      <Ecran titre="Ma fiche">
        <Alert tone="w" text="Votre compte n'est relié à aucune fiche de joueur : contactez l'administrateur de votre club." />
      </Ecran>
    );
  }
  return <JoueurDetailScreen navigation={navigation} route={{ params: { id: utilisateur.joueur } }} />;
}

// Fiche d'un joueur : identité, radar (CU09), statistiques, historique des clubs, dernier rapport
export default function JoueurDetailScreen({ navigation, route }) {
  const { id } = route.params;
  const { a, utilisateur } = useAuth();
  const [comparer, setComparer] = useState(false);
  const [shortlist, setShortlist] = useState(false);
  const [message, setMessage] = useState(null);
  const { donnees, ...etat } = useChargement(() => api.get(`/joueurs/${id}/radar/`), [id]);
  const j = donnees?.joueur;
  const stat = donnees?.statistique;
  const exporter = async () => {
    try { await exporterPdf({ type: 'joueur', id }); } catch (e) { setMessage(e.message); }
  };

  return (
    <Ecran titre={j ? j.nom_complet : 'Fiche joueur'} sousTitre={j ? `${j.club_nom} · ${j.club_division}` : null}
      droite={j && (a('ADMIN', 'ANALYSTE') || (a('CLUB_ADMIN') && j.club_actuel === utilisateur.club)) ? <BoutonEntete titre="Modifier" onPress={() => navigation.navigate('JoueurForm', { id })} /> : null}>
      <Etat {...etat} donnees={donnees} />
      {j ? (
        <>
          <Alert tone="e" text={message} />
          <View style={[s.ligne, { borderLeftWidth: 4, borderLeftColor: C.blue }]}>
            <Avatar nom={j.nom_complet} taille={52} photo={j.photo} />
            <View style={{ flex: 1 }}>
              <Text style={st.nom}>{j.nom_complet}</Text>
              <Text style={st.sous}>{j.poste_libelle} · {j.age} ans · pied {libelle(PIEDS, j.pied_fort).toLowerCase()}</Text>
              {j.est_mineur ? <Badge text="Mineur · données protégées (RG12)" tone="a" style={{ marginTop: 5 }} /> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={st.indice}>{stat?.indice_performance != null ? Math.round(stat.indice_performance) : '—'}</Text>
              <Text style={st.indiceL}>indice /100</Text>
            </View>
          </View>

          <Rangee style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            {!a('JOUEUR') ? <Button title="Comparer" kind="secondary" style={st.action} onPress={() => setComparer(true)} /> : null}
            {a('ADMIN', 'SCOUT', 'DIRECTEUR', 'CLIENT', 'CLUB_ADMIN', 'COACH') ? <Button title="+ Shortlist" kind="secondary" style={st.action} onPress={() => setShortlist(true)} /> : null}
            <Button title="Exporter en PDF" style={st.action} onPress={exporter} />
          </Rangee>
          {a('SCOUT') ? <Button title="Nouveau rapport de scouting" kind="success" style={{ marginBottom: 12 }} onPress={() => navigation.navigate('RapportForm', { joueur: j })} /> : null}

          <Colonnes>
          <Card title={`Radar des centiles · ${donnees.saison.libelle}`}>
            <Radar series={[{ nom: j.nom_complet, couleur: C.blue, centiles: stat?.centiles }]} />
          </Card>

          <Card title="Statistiques de la saison" badge={stat && !stat.eligible ? <Badge text="< 450 min" tone="a" /> : null}>
            {stat ? <TableauStats colonnes={[{ nom: 'Valeur', couleur: C.blue, statistique: stat }]} />
              : <Text style={s.vide}>Aucune statistique publiée pour cette saison.</Text>}
          </Card>

          {donnees.physique ? (
            <Card title="Données physiques" badge={<Badge text={`${donnees.physique.matchs_mesures} match(s) mesuré(s)`} tone="b" />}>
              <Info libelle="Distance /90" valeur={donnees.physique.distance_m_p90 != null ? `${(donnees.physique.distance_m_p90 / 1000).toFixed(1).replace('.', ',')} km` : null} />
              <Info libelle="Distance à haute intensité /90" valeur={donnees.physique.distance_sprint_m_p90 != null ? `${Math.round(donnees.physique.distance_sprint_m_p90)} m` : null} />
              <Info libelle="Sprints /90" valeur={nombre(donnees.physique.sprints_p90)} />
              <Info libelle="Vitesse maximale" valeur={donnees.physique.vitesse_max_kmh != null ? `${String(donnees.physique.vitesse_max_kmh).replace('.', ',')} km/h` : null} />
              <View style={{ height: 8 }} />
            </Card>
          ) : null}

          <JoueursSimilaires joueur={j} navigation={navigation} />

          <CarteTerrain joueur={j.id} />
          <JournalMatchs joueur={j.id} navigation={navigation} />

          <Card title="Identité">
            <Info libelle="Date de naissance" valeur={dateFR(j.date_naissance)} />
            <Info libelle="Nationalité" valeur={j.nationalite} />
            <Info libelle="Taille" valeur={j.taille ? `${j.taille} cm` : null} />
            <Info libelle="Poids" valeur={j.poids ? `${j.poids} kg` : null} />
            {!j.est_mineur && j.telephone ? <Info libelle="Téléphone" valeur={j.telephone} /> : null}
            {!j.est_mineur && j.adresse ? <Info libelle="Adresse" valeur={j.adresse} /> : null}
            {j.nom_tuteur ? <Info libelle="Tuteur légal" valeur={`${j.nom_tuteur}${j.lien_tuteur ? ` (${j.lien_tuteur})` : ''}`} /> : null}
          </Card>

          <Card title="Historique des clubs">
            {donnees.historique.map((h) => (
              <Info key={h.id} libelle={`${dateFR(h.date_debut)} → ${h.date_fin ? dateFR(h.date_fin) : "aujourd'hui"}`} valeur={`${h.club_nom} · ${h.type_contrat_libelle}`} />
            ))}
          </Card>

          {donnees.dernier_rapport ? (
            <Card title="Dernier rapport de scouting" badge={<Badge text="Validé" tone="g" />}>
              <Pressable onPress={() => navigation.navigate('RapportDetail', { id: donnees.dernier_rapport.id })}>
                <Text style={st.rapport}>
                  <Text style={{ color: C.ink, ...F.semi }}>Note {donnees.dernier_rapport.note}/10 · {donnees.dernier_rapport.recommandation_libelle}{'\n'}</Text>
                  {donnees.dernier_rapport.forces}{'\n'}
                  <Text style={{ color: C.muted }}>{donnees.dernier_rapport.scout_nom}, {dateFR(donnees.dernier_rapport.date_rapport)}</Text>
                </Text>
              </Pressable>
            </Card>
          ) : null}

          </Colonnes>

          <SelecteurJoueur visible={comparer} titre={`Comparer ${j.nom_complet} avec…`} exclure={j.id}
            onFermer={() => setComparer(false)}
            onChoisir={(autre) => { setComparer(false); navigation.navigate('Comparaison', { a: j.id, b: autre.id }); }} />
          <AjoutShortlist joueur={j} visible={shortlist} onFermer={() => setShortlist(false)} />
        </>
      ) : null}
    </Ecran>
  );
}

const st = StyleSheet.create({
  nom: { fontSize: 16, color: C.ink, ...F.bold },
  sous: { fontSize: 12.5, color: C.muted, marginTop: 2, ...F.regular },
  indice: { fontSize: 26, color: C.blue, ...F.bold },
  indiceL: { fontSize: 10.5, color: C.muted, ...F.regular },
  action: { flexGrow: 1, flexBasis: 100, height: 44, paddingHorizontal: 10 },
  thead: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  th: { flex: 1, fontSize: 10.5, letterSpacing: 0.5, color: C.muted, ...F.semi },
  tr: { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f0f1f3' },
  td: { flex: 1, fontSize: 13, color: C.ink, ...F.regular },
  rapport: { fontSize: 13, lineHeight: 19, color: C.ink2, marginBottom: 10, ...F.regular },
});
