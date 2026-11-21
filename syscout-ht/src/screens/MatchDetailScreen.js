import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { api, exporterPdf } from '../api';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import { TON_ETAT, dateHeureFR } from '../constantes';
import CartePasses from '../components/CartePasses';
import { Colonnes, Ecran, Etat, Card, Info, Badge, Button, Alert, BoutonEntete, Ligne, confirmer, useChargement, s } from '../components/ui';
import { qualite, TON_CAMERA } from './CamerasScreens';

// FR-031 : caméras du stade reliées au match ; leur flux lisible devient la vidéo du match
function CamerasDuMatch({ match, surChangement }) {
  const [message, setMessage] = useState(null);
  const [envoi, setEnvoi] = useState(null);
  const { donnees, recharger } = useChargement(async () => {
    const [enregistrements, cameras] = await Promise.all([
      api.get('/enregistrements/', { match: match.id }), api.tout('/cameras/', { active: 1 })]);
    return { enregistrements, cameras };
  }, [match.id]);
  if (!donnees) return null;
  const meme = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
  const enCours = donnees.enregistrements.filter((e) => !e.fin);
  const libres = donnees.cameras.filter((c) => !c.match_en_cours && (!match.stade || meme(c.stade, match.stade)));
  const agir = async (cle, appel) => {
    setEnvoi(cle);
    setMessage(null);
    try { await appel(); surChangement(); } catch (e) { setMessage(e.message); }
    recharger();
    setEnvoi(null);
  };

  return (
    <Card title="Caméras du stade" badge={enCours.length ? <Badge text={`● ${enCours.length} connectée(s)`} tone="g" /> : null}>
      <Alert tone="e" text={message} />
      {enCours.map((e) => (
        <Ligne key={e.id} titre={e.camera_nom} sousTitre={`Connectée depuis ${dateHeureFR(e.debut)}`}
          droite={<Button title="Arrêter" kind="secondary" style={{ height: 34 }} loading={envoi === `e${e.id}`}
            onPress={() => agir(`e${e.id}`, () => api.post(`/enregistrements/${e.id}/arreter/`))} />} />
      ))}
      {libres.map((c) => (
        <Ligne key={c.id} titre={c.nom} sousTitre={`${c.etat_libelle} · ${qualite(c)}`}
          gauche={<Badge text="●" tone={TON_CAMERA[c.etat]} />}
          droite={<Button title="Connecter" style={{ height: 34 }} loading={envoi === `c${c.id}`}
            onPress={() => agir(`c${c.id}`, () => api.post('/enregistrements/', { match: match.id, camera: c.id }))} />} />
      ))}
      {!enCours.length && !libres.length
        ? <Text style={s.ligneS}>{match.stade ? `Aucune caméra disponible au stade « ${match.stade} ».` : 'Aucune caméra disponible.'}</Text> : null}
    </Card>
  );
}

// statistiques par équipe, calculées à partir des événements codés
function bilan(evenements, club) {
  const de = (type, reussi) => evenements.filter((e) => e.club === club && e.type_action === type && (reussi === undefined || e.resultat === reussi)).length;
  const passes = de('PASSE');
  const duels = de('DUEL');
  return {
    Buts: de('BUT'),
    Tirs: de('TIR') + de('BUT'),
    xG: evenements.filter((e) => e.club === club).reduce((somme, e) => somme + (e.valeur_xg || 0), 0).toFixed(2).replace('.', ','),
    Passes: passes,
    'Passes réussies': passes ? `${Math.round((100 * de('PASSE', true)) / passes)} %` : '—',
    'Duels gagnés': duels ? `${Math.round((100 * de('DUEL', true)) / duels)} %` : '—',
    Récupérations: de('RECUPERATION'),
    Interceptions: de('INTERCEPTION'),
    Fautes: de('FAUTE'),
  };
}

// Fiche d'un match : état, compositions, statistiques par équipe et accès au codage (CU06 à CU08)
export default function MatchDetailScreen({ navigation, route }) {
  const { id } = route.params;
  const { a } = useAuth();
  const [message, setMessage] = useState(null);
  const { donnees, recharger, ...etat } = useChargement(async () => {
    const match = await api.get(`/matchs/${id}/`);
    const evenements = match.nb_evenements ? await api.get('/evenements/', { match: id }) : [];
    return { match, evenements };
  }, [id]);
  const m = donnees?.match;
  const analyste = a('ADMIN', 'ANALYSTE');

  const action = async (chemin, titre, question) => {
    if (question && !(await confirmer(titre, question))) return;
    setMessage(null);
    try {
      await api.post(`/matchs/${id}/${chemin}/`);
      if (chemin === 'corriger') navigation.navigate('Codage', { id });
      else recharger();
    } catch (e) { setMessage(e.message); }
  };

  const dom = m && bilan(donnees.evenements, m.club_domicile);
  const ext = m && bilan(donnees.evenements, m.club_exterieur);

  return (
    <Ecran titre={m ? `${m.domicile_sigle || m.domicile_nom} – ${m.exterieur_sigle || m.exterieur_nom}` : 'Match'}
      sousTitre={m ? `J${m.journee} · ${m.competition_nom}` : null}
      droite={m && analyste && ['PLANIFIE', 'VIDEO_IMPORTEE', 'EN_CODAGE'].includes(m.etat)
        ? <BoutonEntete titre="Modifier" onPress={() => navigation.navigate('MatchForm', { id })} /> : null}>
      <Etat {...etat} recharger={recharger} donnees={donnees} />
      {m ? (
        <>
          <Alert tone="e" text={message} />
          <View style={st.tableau}>
            <Text style={[st.equipe, { textAlign: 'right' }]}>{m.domicile_nom}</Text>
            <Text style={st.score}>{m.score_domicile} – {m.score_exterieur}</Text>
            <Text style={st.equipe}>{m.exterieur_nom}</Text>
          </View>
          <Card>
            <Info libelle="État" valeur={<Badge text={m.etat_libelle} tone={TON_ETAT[m.etat]} />} />
            <Info libelle="Date" valeur={dateHeureFR(m.date_match)} />
            <Info libelle="Stade" valeur={m.stade} />
            <Info libelle="Durée" valeur={`${m.duree} minutes`} />
            <Info libelle="Vidéo" valeur={m.video_lecture ? 'Importée' : 'Aucune'} />
            <Info libelle="Événements codés" valeur={m.nb_evenements} />
            {m.verrouille_par_nom ? <Info libelle="Verrou" valeur={`Codage en cours par ${m.verrouille_par_nom}`} /> : null}
          </Card>
          {analyste && ['PLANIFIE', 'VIDEO_IMPORTEE', 'EN_CODAGE'].includes(m.etat) ? <CamerasDuMatch match={m} surChangement={recharger} /> : null}

          {m.etat !== 'PLANIFIE' && m.etat !== 'ANNULE' ? (
            <Button title={m.verrouille_par_nom ? '● Suivre le match en direct' : 'Statistiques détaillées du match'} style={{ marginBottom: 12 }}
              onPress={() => navigation.navigate('Direct', { id })} />
          ) : null}
          {analyste && m.etat !== 'PLANIFIE' && m.etat !== 'ANNULE' ? (
            <Button title="Pistes de l'IA" kind="secondary" style={{ marginBottom: 12 }}
              onPress={() => navigation.navigate('PistesIA', { id })} />
          ) : null}
          {m.nb_evenements ? (
            <Button title="Analyse tactique" kind="secondary" style={{ marginBottom: 12 }}
              onPress={() => navigation.navigate('Tactique', { id })} />
          ) : null}
          {analyste && m.compositions.length && m.etat !== 'ANNULE' ? (
            <Button title="Données physiques des joueurs" kind="secondary" style={{ marginBottom: 12 }}
              onPress={() => navigation.navigate('Physique', { id })} />
          ) : null}
          {donnees.evenements.length ? (
            <Button title="Rapport de match (PDF)" kind="secondary" style={{ marginBottom: 12 }}
              onPress={async () => { try { await exporterPdf({ type: 'match', id }); } catch (e) { setMessage(e.message); } }} />
          ) : null}
          {m.video_lecture ? (
            <Button title="Revoir la vidéo : clips et dessins" kind="secondary" style={{ marginBottom: 12 }}
              onPress={() => navigation.navigate('Relecture', { id })} />
          ) : null}
          {analyste && m.etat === 'PLANIFIE' ? (
            <>
              <Alert tone="i" text="Importez la vidéo du match (bouton Modifier) ou connectez une caméra du stade pour pouvoir commencer le codage." />
              <Button title="Annuler le match" kind="secondary" style={{ marginBottom: 12 }}
                onPress={() => action('annuler', 'Annuler le match', 'Voulez-vous vraiment annuler ce match ?')} />
            </>
          ) : null}
          {analyste && ['VIDEO_IMPORTEE', 'EN_CODAGE'].includes(m.etat) ? (
            <Button title={m.etat === 'EN_CODAGE' ? 'Reprendre le codage' : 'Ouvrir le codage vidéo'} style={{ marginBottom: 12 }}
              onPress={() => navigation.navigate('Codage', { id })} />
          ) : null}
          {analyste && m.etat === 'STATS_PUBLIEES' ? (
            <Button title="Corriger le codage" kind="secondary" style={{ marginBottom: 12 }}
              onPress={() => action('corriger', 'Corriger le codage', 'Le match reviendra « En codage » et ses statistiques seront retirées de la saison jusqu\'à la nouvelle validation. Continuer ?')} />
          ) : null}

          <CartePasses evenements={donnees.evenements} equipes={[[m.club_domicile, m.domicile_nom], [m.club_exterieur, m.exterieur_nom]]} />

          <Colonnes>
          {donnees.evenements.length ? (
            <Card title="Statistiques par équipe" badge={m.etat === 'STATS_PUBLIEES' ? <Badge text="Publiées" tone="g" /> : <Badge text="Provisoires" tone="a" />}>
              {Object.keys(dom).map((cle) => (
                <View key={cle} style={st.ligne}>
                  <Text style={[st.valeur, { color: C.blue }]}>{dom[cle]}</Text>
                  <Text style={st.cle}>{cle}</Text>
                  <Text style={[st.valeur, { color: C.red, textAlign: 'right' }]}>{ext[cle]}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {[[m.club_domicile, m.domicile_nom], [m.club_exterieur, m.exterieur_nom]].map(([club, nom]) => {
            const lignes = m.compositions.filter((c) => c.club === club);
            return (
              <Card key={club} title={`Composition · ${nom}`} badge={<Badge text={`${lignes.filter((c) => c.est_titulaire).length} titulaires`} tone="g" />}>
                {lignes.length ? lignes.map((c) => (
                  <View key={c.id} style={st.joueur}>
                    <Text style={st.num}>{c.numero_maillot ?? '–'}</Text>
                    <Text style={st.nom} numberOfLines={1} onPress={() => navigation.navigate('JoueurDetail', { id: c.joueur })}>{c.joueur_nom}</Text>
                    <Badge text={c.poste} />
                    <Badge text={c.est_titulaire ? 'Titulaire' : 'Remplaçant'} tone={c.est_titulaire ? 'b' : 'n'} />
                    <Text style={st.minutes}>{c.minutes_jouees}'</Text>
                  </View>
                )) : <Text style={st.vide}>Composition non saisie.</Text>}
                <View style={{ height: 8 }} />
              </Card>
            );
          })}
          </Colonnes>
        </>
      ) : null}
    </Ecran>
  );
}

const st = StyleSheet.create({
  tableau: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.navy, borderRadius: 14, padding: 16, marginBottom: 12 },
  equipe: { flex: 1, color: '#fff', fontSize: 14.5, ...F.semi },
  score: { color: '#fff', fontSize: 26, ...F.bold },
  ligne: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f1f3' },
  valeur: { width: 70, fontSize: 14, ...F.bold },
  cle: { flex: 1, textAlign: 'center', fontSize: 12.5, color: C.muted, ...F.regular },
  joueur: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f1f3' },
  num: { width: 22, fontSize: 13, color: C.muted, ...F.regular },
  nom: { flex: 1, fontSize: 13.5, color: C.ink, ...F.medium },
  minutes: { width: 34, textAlign: 'right', fontSize: 12.5, color: C.muted, ...F.regular },
  vide: { color: C.muted, fontSize: 13, paddingVertical: 10, ...F.regular },
});
