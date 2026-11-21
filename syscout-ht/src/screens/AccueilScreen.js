import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import MatchsEnDirect from '../components/MatchsEnDirect';
import { Ecran, Etat, Alert, Card, Info, Field, Ligne, Avatar, Badge, Colonnes, useChargement, useLarge } from '../components/ui';
import { dateFR } from '../constantes';

// Recherche globale : un nom de joueur ou de club, et on ouvre sa fiche
function Recherche({ navigation }) {
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState(null);
  useEffect(() => {
    if (q.trim().length < 2) { setResultats(null); return undefined; }
    let actif = true;
    const attente = setTimeout(async () => {
      try {
        const [joueurs, clubs] = await Promise.all([
          api.get('/joueurs/', { q, page_size: 5 }), api.get('/equipes/'),
        ]);
        const mots = q.trim().toLowerCase();
        if (actif) setResultats({ joueurs: joueurs.results, clubs: clubs.clubs.filter((c) => c.nom.toLowerCase().includes(mots)).slice(0, 3) });
      } catch (e) {
        if (actif) setResultats({ joueurs: [], clubs: [] });
      }
    }, 250);
    return () => { actif = false; clearTimeout(attente); };
  }, [q]);

  return (
    <View>
      <Field placeholder="Rechercher un joueur ou une équipe…" value={q} onChangeText={setQ} />
      {resultats ? (
        <View style={{ marginBottom: 8 }}>
          {resultats.clubs.map((c) => (
            <Ligne key={`c${c.id}`} titre={c.nom} sousTitre={`Équipe · ${c.division}`} gauche={<Avatar nom={c.sigle || c.nom} taille={36} couleur={C.red} />}
              onPress={() => navigation.navigate('Equipe', { id: c.id })} />
          ))}
          {resultats.joueurs.map((j) => (
            <Ligne key={`j${j.id}`} titre={j.nom_complet} sousTitre={`${j.club_nom} · ${j.poste} · ${j.age} ans`} gauche={<Avatar nom={j.nom_complet} taille={36} photo={j.photo} />}
              droite={j.indice_performance != null ? <Badge text={String(Math.round(j.indice_performance))} tone="b" /> : null}
              onPress={() => navigation.navigate('JoueurDetail', { id: j.id })} />
          ))}
          {!resultats.clubs.length && !resultats.joueurs.length ? <Text style={st.vide}>Aucun joueur ni équipe à ce nom.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

// Accueil adapté au rôle (SEL 2.1) : recherche, chiffres clés, derniers résultats et meilleurs joueurs
export default function AccueilScreen({ navigation }) {
  const { utilisateur, a } = useAuth();
  const { donnees, ...etat } = useChargement(() => api.get('/tableau-de-bord/'));
  const abonnement = utilisateur.abonnement;
  const large = useLarge();
  const sportif = a('ADMIN', 'ANALYSTE', 'SCOUT', 'DIRECTEUR') || (a('CLIENT') && !!abonnement);
  const voirDirect = sportif || a('CLUB_ADMIN', 'COACH');

  return (
    <Ecran titre={`Bonjour ${utilisateur.prenom}`} sousTitre={`${utilisateur.role_libelle}${donnees?.saison ? ` · saison ${donnees.saison.libelle}` : ''}`}>
      {sportif ? <Recherche navigation={navigation} /> : null}
      <Etat {...etat} donnees={donnees} />
      {donnees ? (
        <>
          {donnees.alertes.map((alerte) => <Alert key={alerte} text={alerte} />)}
          <View style={st.grille}>
            {donnees.cartes.map((carte) => (
              <Pressable key={carte.libelle} style={[st.carte, large && { flexBasis: '22%', padding: 20 }]} disabled={!carte.ecran} onPress={() => navigation.navigate(carte.ecran)}>
                <Text style={st.valeur}>{carte.valeur}</Text>
                <Text style={st.libelle}>{carte.libelle}</Text>
              </Pressable>
            ))}
          </View>

          <Card title="Matchs en direct">
            <MatchsEnDirect texteVide="Aucun match en direct pour le moment." surOuvrir={voirDirect ? (m) => navigation.navigate('Direct', { id: m.id }) : undefined} />
          </Card>

          <Colonnes>
            {donnees.resultats.length ? (
              <Card title="Derniers résultats">
                {donnees.resultats.map((m) => (
                  <Pressable key={m.id} style={st.rang} onPress={() => navigation.navigate('MatchDetail', { id: m.id })}>
                    <Text style={[st.equipe, { textAlign: 'right' }]} numberOfLines={1}>{m.domicile}</Text>
                    <Text style={st.score}>{m.score}</Text>
                    <Text style={st.equipe} numberOfLines={1}>{m.exterieur}</Text>
                  </Pressable>
                ))}
                <Text style={st.lien} onPress={() => navigation.navigate('Matchs')}>Tous les matchs ›</Text>
              </Card>
            ) : null}
            {donnees.meilleurs.length ? (
              <Card title="Meilleurs joueurs de la saison">
                {donnees.meilleurs.map((j, i) => (
                  <Pressable key={j.joueur} style={st.rang} onPress={() => navigation.navigate('JoueurDetail', { id: j.joueur })}>
                    <Text style={st.place}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={st.nom} numberOfLines={1}>{j.nom}</Text>
                      <Text style={st.sous} numberOfLines={1}>{j.club} · {j.poste}</Text>
                    </View>
                    <Text style={st.indice}>{Math.round(j.indice)}</Text>
                  </Pressable>
                ))}
                <Text style={st.lien} onPress={() => navigation.navigate('Classements')}>Tous les classements ›</Text>
              </Card>
            ) : null}
          </Colonnes>

          {utilisateur.role === 'CLIENT' && abonnement ? (
            <Card title={`Abonnement de ${utilisateur.club_nom}`}>
              <Info libelle="Formule" valeur={abonnement.formule} />
              <Info libelle="Divisions incluses" valeur={abonnement.divisions.join(', ')} />
              <Info libelle="Rapports de scouting" valeur={abonnement.rapports ? 'Inclus' : 'Non inclus'} />
              <Info libelle="Échéance" valeur={dateFR(abonnement.date_echeance)} />
            </Card>
          ) : null}
        </>
      ) : null}
    </Ecran>
  );
}

const st = StyleSheet.create({
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  carte: { flexGrow: 1, flexBasis: '45%', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14 },
  valeur: { fontSize: 26, color: C.navy, ...F.bold },
  libelle: { fontSize: 12.5, color: C.muted, marginTop: 2, ...F.medium },
  rang: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f0f1f3' },
  equipe: { flex: 1, fontSize: 13, color: C.ink, ...F.medium },
  score: { fontSize: 14, color: C.navy, minWidth: 44, textAlign: 'center', ...F.bold },
  place: { width: 20, fontSize: 14, color: C.muted, textAlign: 'center', ...F.bold },
  nom: { fontSize: 13.5, color: C.ink, ...F.semi },
  sous: { fontSize: 11.5, color: C.muted, ...F.regular },
  indice: { fontSize: 18, color: C.blue, ...F.bold },
  lien: { fontSize: 13, color: C.blue, paddingVertical: 12, ...F.semi },
  vide: { color: C.muted, fontSize: 13, paddingVertical: 8, ...F.regular },
});
