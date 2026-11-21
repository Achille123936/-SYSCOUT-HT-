import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import { GROUPES, dateHeureFR } from '../constantes';
import { Ecran, Etat, Card, Info, Segmented, Button, Badge, Alert, Ligne, Avatar, confirmer, useChargement, s } from '../components/ui';

// Carte de la fiche joueur : profil de jeu et joueurs au profil statistique le plus proche
export function JoueursSimilaires({ joueur, navigation }) {
  const { donnees, erreur } = useChargement(() => api.get('/ia/similaires/', { joueur: joueur.id }), [joueur.id]);
  if (erreur || !donnees) return null;
  return (
    <Card title="Joueurs similaires" badge={donnees.profil ? <Badge text={donnees.profil} tone="b" /> : null}>
      {!donnees.eligible ? <Text style={st.aide}>{donnees.detail}</Text> : (
        <>
          <Text style={st.aide}>Les profils statistiques les plus proches parmi les {donnees.compares} joueurs du même type de poste. Touchez un joueur pour le comparer.</Text>
          {donnees.similaires.map((v) => (
            <Ligne key={v.joueur} titre={v.joueur_nom} sousTitre={`${v.club_nom} · ${v.poste} · ${v.age} ans`}
              gauche={<Avatar nom={v.joueur_nom} taille={36} />}
              droite={<View style={{ alignItems: 'flex-end' }}><Text style={st.score}>{Math.round(v.similarite)} %</Text><Text style={st.scoreL}>proche</Text></View>}
              onPress={() => navigation.navigate('Comparaison', { a: joueur.id, b: v.joueur })} />
          ))}
        </>
      )}
      <View style={{ height: 6 }} />
    </Card>
  );
}

// Apprentissage automatique : profils de jeu par poste et modèle de buts attendus (xG)
export default function IAScreen({ navigation }) {
  const { a } = useAuth();
  const [groupe, setGroupe] = useState('ATTAQUANT');
  const [message, setMessage] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const profils = useChargement(() => api.get('/ia/profils/', { groupe }), [groupe]);
  const modele = useChargement(() => api.get('/ia/xg/'));
  const m = modele.donnees;

  const entrainer = async () => {
    if (!(await confirmer('Entraîner le modèle xG', 'Le modèle sera recalculé sur les tirs de tous les matchs validés et servira aux prochains codages. Continuer ?'))) return;
    setEnvoi(true);
    setMessage(null);
    try {
      const r = await api.post('/ia/xg/');
      setMessage({ ton: 's', texte: `Modèle entraîné sur ${r.nb_tirs} tirs (${r.nb_buts} buts).` });
      modele.recharger();
    } catch (e) { setMessage({ ton: 'e', texte: e.message }); } finally { setEnvoi(false); }
  };

  return (
    <Ecran titre="Apprentissage" sousTitre="Profils de jeu et modèle xG">
      <Card title="Modèle de buts attendus (xG)" badge={m ? <Badge text={m.entraine ? 'Entraîné' : 'Par défaut'} tone={m.entraine ? 'g' : 'n'} /> : null}>
        {message ? <Alert tone={message.ton} text={message.texte} /> : null}
        <Text style={st.aide}>Régression logistique : elle apprend, à partir de la distance et de l'angle des tirs codés, la probabilité qu'un tir finisse en but.</Text>
        {m && m.entraine ? (
          <>
            <Info libelle="Entraîné le" valeur={dateHeureFR(m.date_entrainement)} />
            <Info libelle="Tirs utilisés" valeur={`${m.nb_tirs} dont ${m.nb_buts} buts`} />
            <Info libelle="Gain sur le taux de but moyen" valeur={`${String(m.gain_pct).replace('.', ',')} %`} />
            {m.exemples.map((e) => <Info key={e.tir} libelle={`xG · ${e.tir}`} valeur={String(e.xg).replace('.', ',')} />)}
          </>
        ) : m ? <Text style={st.aide}>{m.detail}</Text> : null}
        {a('ADMIN', 'ANALYSTE') ? <Button title={m?.entraine ? 'Réentraîner le modèle' : 'Entraîner le modèle'} style={{ marginVertical: 12 }} onPress={entrainer} loading={envoi} /> : <View style={{ height: 10 }} />}
      </Card>

      <Text style={st.titre}>Profils de jeu</Text>
      <Text style={[st.aide, { marginBottom: 10 }]}>Regroupement automatique (k-moyennes) des joueurs ayant joué au moins 450 minutes. Chaque profil porte le nom de ses deux points forts.</Text>
      <Segmented options={GROUPES} value={groupe} onChange={setGroupe} />
      <Etat enCours={profils.enCours} erreur={profils.erreur} donnees={profils.donnees}
        vide={profils.donnees && !profils.donnees.profils.length ? 'Pas assez de joueurs pour ce poste.' : null} />
      {(profils.donnees?.profils || []).map((profil) => (
        <Card key={profil.nom + profil.joueurs[0]?.joueur} title={profil.nom} badge={<Badge text={`${profil.joueurs.length} joueur(s)`} tone="b" />}>
          {profil.joueurs.map((j) => (
            <Ligne key={j.joueur} titre={j.joueur_nom} sousTitre={`${j.club_nom} · ${j.poste}`}
              droite={j.indice_performance != null ? <Badge text={String(Math.round(j.indice_performance))} tone="b" /> : null}
              onPress={() => navigation.navigate('JoueurDetail', { id: j.joueur })} style={{ borderWidth: 0, padding: 4, marginBottom: 4 }} />
          ))}
          <View style={{ height: 6 }} />
        </Card>
      ))}
    </Ecran>
  );
}

const st = StyleSheet.create({
  aide: { fontSize: 12.5, lineHeight: 18, color: C.muted, marginBottom: 8, ...F.regular },
  titre: { fontSize: 15, color: C.ink, marginBottom: 4, marginTop: 4, ...F.bold },
  score: { fontSize: 17, color: C.blue, ...F.bold },
  scoreL: { fontSize: 10, color: C.muted, ...F.regular },
});
