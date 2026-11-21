import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api, envoyer, pieceJointe } from '../api';
import { C, F } from '../theme';
import { dateHeureFR, dateHeureISO } from '../constantes';
import { Ecran, Card, Field, Select, Button, Badge, Check, Alert, Rangee, useFormulaire } from '../components/ui';

const VIDE = {
  competition: null, journee: '1', date: '', stade: '', club_domicile: null, club_exterieur: null,
  score_domicile: '0', score_exterieur: '0', duree: '90', video_url: '', video_url_2: '',
};
const SUIVANT = { undefined: 'T', T: 'R', R: undefined }; // absent -> titulaire -> remplaçant -> absent

// CU06 — Enregistrer un match : rencontre, compositions et vidéo
export default function MatchScreen({ navigation, route }) {
  const id = route.params?.id;
  const f = useFormulaire(VIDE);
  const v = f.valeurs;
  const [competitions, setCompetitions] = useState([]);
  const [effectifs, setEffectifs] = useState({});
  const [compos, setCompos] = useState({}); // { idJoueur: { statut: 'T' | 'R', minute: '' } }
  const [equipe, setEquipe] = useState(0);
  const [video, setVideo] = useState(null);
  const [progression, setProgression] = useState(null);
  const [etatMatch, setEtatMatch] = useState('PLANIFIE');
  const [videoActuelle, setVideoActuelle] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setCompetitions(await api.tout('/competitions/'));
        if (!id) return;
        const m = await api.get(`/matchs/${id}/`);
        setEtatMatch(m.etat);
        setVideoActuelle(m.video_lecture);
        f.setValeurs({
          competition: m.competition, journee: String(m.journee), date: dateHeureFR(m.date_match), stade: m.stade,
          club_domicile: m.club_domicile, club_exterieur: m.club_exterieur, score_domicile: String(m.score_domicile),
          score_exterieur: String(m.score_exterieur), duree: String(m.duree), video_url: m.video_url || '', video_url_2: m.video_url_2 || '',
        });
        const lignes = {};
        m.compositions.forEach((c) => {
          const minute = c.est_titulaire ? c.minute_sortie : c.minute_entree;
          lignes[c.joueur] = {
            statut: c.est_titulaire ? 'T' : 'R', minute: minute == null ? '' : String(minute),
            numero: c.numero_maillot == null ? '' : String(c.numero_maillot),
          };
        });
        setCompos(lignes);
      } catch (e) { f.setMessage(e.message); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // l'effectif de chaque équipe est chargé dès qu'elle est choisie
  useEffect(() => {
    [v.club_domicile, v.club_exterieur].filter((club) => club && !effectifs[club]).forEach(async (club) => {
      try {
        const joueurs = await api.tout('/joueurs/', { club, tri: 'nom' });
        setEffectifs((e) => ({ ...e, [club]: joueurs }));
      } catch (e) { f.setMessage(e.message); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.club_domicile, v.club_exterieur]);

  const competition = competitions.find((c) => c.id === v.competition);
  const clubs = (competition?.clubs_detail || []).map((c) => [c.id, c.nom]);
  const nomClub = (club) => (clubs.find(([cle]) => cle === club) || [null, 'Équipe'])[1];
  const clubCourant = equipe === 0 ? v.club_domicile : v.club_exterieur;
  const joueurs = effectifs[clubCourant] || [];
  const titulaires = (club) => (effectifs[club] || []).filter((j) => compos[j.id]?.statut === 'T').length;

  const choisirClub = (champ) => (club) => {
    f.changer(champ)(club);
    const stade = (competition?.clubs_detail || []).find((c) => c.id === club);
    if (champ === 'club_domicile' && stade && !v.stade) f.changer('stade')(`${stade.stade}${stade.stade ? ', ' : ''}${stade.ville}`);
  };
  const basculer = (joueur) => setCompos((c) => {
    const suivant = SUIVANT[c[joueur.id]?.statut];
    const copie = { ...c };
    if (suivant) copie[joueur.id] = { numero: c[joueur.id]?.numero || '', statut: suivant, minute: '' };
    else delete copie[joueur.id];
    return copie;
  });
  const minute = (joueur) => (valeur) => setCompos((c) => ({ ...c, [joueur.id]: { ...c[joueur.id], minute: valeur.replace(/\D/g, '') } }));

  const numero = (joueur) => (valeur) => setCompos((c) => ({ ...c, [joueur.id]: { ...c[joueur.id], numero: valeur.replace(/\D/g, '') } }));

  const choisirVideo = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: false });
    if (!r.canceled) setVideo(r.assets[0]);
  };

  const enregistrer = () => f.soumettre(async () => {
    const erreurs = {};
    const date = dateHeureISO(v.date);
    if (!v.competition) erreurs.competition = 'Champ obligatoire';
    if (!date) erreurs.date = 'Date invalide (JJ/MM/AAAA HH:MM)';
    if (!v.club_domicile) erreurs.club_domicile = 'Champ obligatoire';
    if (!v.club_exterieur) erreurs.club_exterieur = 'Champ obligatoire';
    if (Object.keys(erreurs).length) {
      f.setErreurs(erreurs);
      f.setMessage('Complétez les champs signalés en rouge.');
      return;
    }
    const donnees = {
      competition: v.competition, journee: Number(v.journee) || 1, date_match: date, stade: v.stade,
      club_domicile: v.club_domicile, club_exterieur: v.club_exterieur, score_domicile: Number(v.score_domicile) || 0,
      score_exterieur: Number(v.score_exterieur) || 0, duree: Number(v.duree) || 90, video_url: video ? '' : v.video_url.trim(), video_url_2: (v.video_url_2 || '').trim(),
    };
    const lignes = [];
    [v.club_domicile, v.club_exterieur].forEach((club) => (effectifs[club] || []).forEach((j) => {
      const ligne = compos[j.id];
      if (!ligne) return;
      const m = ligne.minute === '' ? null : Number(ligne.minute);
      lignes.push({
        joueur: j.id, club, est_titulaire: ligne.statut === 'T', numero_maillot: ligne.numero ? Number(ligne.numero) : null,
        minute_entree: ligne.statut === 'R' ? m : null, minute_sortie: ligne.statut === 'T' ? m : null,
      });
    }));
    if (lignes.length) donnees.compositions = lignes;
    const match = id ? await api.patch(`/matchs/${id}/`, donnees) : await api.post('/matchs/', donnees);
    if (video) { // CU06 étapes 7-8 : envoi de la vidéo vers le NAS
      const formulaire = new FormData();
      formulaire.append('video', pieceJointe(video));
      setProgression(0);
      try {
        await envoyer(`/matchs/${match.id}/importer-video/`, formulaire, setProgression);
      } catch (e) {
        // le match est enregistré ; seule la vidéo reste à renvoyer
        navigation.replace('MatchForm', { id: match.id });
        throw e;
      }
    }
    if (id) navigation.goBack();
    else navigation.replace('MatchDetail', { id: match.id });
  });

  return (
    <Ecran titre={id ? 'Modifier le match' : 'Nouveau match'} sousTitre="Rencontre, compositions et vidéo"
      droite={<Badge text={{ PLANIFIE: 'Planifié', VIDEO_IMPORTEE: 'Vidéo importée', EN_CODAGE: 'En codage' }[etatMatch] || etatMatch} tone="n" />}>
      <Alert tone="e" text={f.message} />
      <Card>
        <Select label="Compétition" required value={v.competition} onChange={f.changer('competition')}
          options={competitions.map((c) => [c.id, `${c.nom} · ${c.saison_libelle}`])}
          state={f.erreurs.competition ? 'error' : undefined} hint={f.erreurs.competition} />
        <Rangee>
          <Field label="Journée" keyboardType="number-pad" {...f.lier('journee')} style={{ flex: 1 }} />
          <Field label="Date" required placeholder="JJ/MM/AAAA HH:MM" {...f.lier('date')} style={{ flex: 2 }} />
        </Rangee>
        <Select label="Équipe à domicile" required options={clubs} value={v.club_domicile} onChange={choisirClub('club_domicile')}
          vide="Choisissez d'abord la compétition." state={f.erreurs.club_domicile ? 'error' : undefined} hint={f.erreurs.club_domicile} />
        <Select label="Équipe visiteuse" required options={clubs.filter(([club]) => club !== v.club_domicile)} value={v.club_exterieur}
          onChange={choisirClub('club_exterieur')} vide="Choisissez d'abord la compétition."
          state={f.erreurs.club_exterieur ? 'error' : undefined} hint={f.erreurs.club_exterieur} />
        <Text style={st.label}>Score</Text>
        <View style={st.score}>
          <Text style={[st.teamName, { textAlign: 'right' }]} numberOfLines={2}>{nomClub(v.club_domicile)}</Text>
          <TextInput style={st.goal} keyboardType="number-pad" maxLength={2} value={v.score_domicile} onChangeText={f.changer('score_domicile')} accessibilityLabel="Score domicile" />
          <Text style={st.dash}>–</Text>
          <TextInput style={st.goal} keyboardType="number-pad" maxLength={2} value={v.score_exterieur} onChangeText={f.changer('score_exterieur')} accessibilityLabel="Score visiteur" />
          <Text style={st.teamName} numberOfLines={2}>{nomClub(v.club_exterieur)}</Text>
        </View>
        <Rangee>
          <Field label="Stade" {...f.lier('stade')} style={{ flex: 2 }} />
          <Field label="Durée (min)" keyboardType="number-pad" {...f.lier('duree')} style={{ flex: 1 }} />
        </Rangee>

        <Text style={st.label}>Vidéo du match</Text>
        <View style={st.upload}>
          <Text style={st.file} numberOfLines={1}>
            {video ? `${video.name}${video.size ? ` · ${(video.size / 1e9).toFixed(2).replace('.', ',')} Go` : ''}`
              : videoActuelle ? 'Vidéo déjà importée' : 'Aucune vidéo'}
          </Text>
          {progression !== null ? (
            <>
              <View style={st.bar}><View style={[st.fill, { width: `${progression}%` }]} /></View>
              <Text style={st.hint}>Envoi vers le NAS : {progression} %</Text>
            </>
          ) : null}
          {['PLANIFIE', 'VIDEO_IMPORTEE'].includes(etatMatch) ? (
            <Rangee style={{ marginTop: 10 }}>
              <Button title="Choisir un fichier" kind="secondary" style={{ flex: 1, height: 40 }} onPress={choisirVideo} />
              {video ? <Button title="Retirer" kind="secondary" style={{ height: 40 }} onPress={() => setVideo(null)} /> : null}
            </Rangee>
          ) : <Text style={st.hint}>Le codage a commencé : la vidéo ne peut plus être remplacée.</Text>}
        </View>
        {!video && ['PLANIFIE', 'VIDEO_IMPORTEE'].includes(etatMatch)
          ? <Field label="ou adresse d'une vidéo déjà sur le NAS" placeholder="https://…" autoCapitalize="none" {...f.lier('video_url')} /> : null}
        <Field label="Second angle de caméra (adresse de la vidéo)" placeholder="https://…" autoCapitalize="none" {...f.lier('video_url_2')} />
      </Card>

      <Card title="Compositions" badge={<Badge text={`${titulaires(clubCourant)} / 11 titulaires`} tone={titulaires(clubCourant) === 11 ? 'g' : 'a'} />}>
        <Alert tone="e" text={f.erreurs.compositions} />
        <View style={st.tabs}>
          {[v.club_domicile, v.club_exterieur].map((club, i) => (
            <Pressable key={i} onPress={() => setEquipe(i)} style={[st.tabBtn, equipe === i && st.tabOn]}>
              <Text style={[st.tabTxt, equipe === i && { color: C.blue, ...F.semi }]} numberOfLines={1}>{nomClub(club)} ({titulaires(club)})</Text>
            </Pressable>
          ))}
        </View>
        {!clubCourant ? <Text style={st.hint}>Choisissez les deux équipes pour cocher leurs joueurs.</Text> : null}
        {clubCourant && !joueurs.length ? <Text style={st.hint}>Aucun joueur enregistré pour ce club.</Text> : null}
        {joueurs.map((j) => {
          const ligne = compos[j.id];
          return (
            <View key={j.id} style={st.player}>
              {ligne ? (
                <TextInput style={[st.minute, { width: 40 }]} keyboardType="number-pad" maxLength={2} value={ligne.numero || ''} onChangeText={numero(j)}
                  placeholder="N°" placeholderTextColor="#9ca3af" accessibilityLabel={`Numéro de maillot de ${j.nom_complet}`} />
              ) : <View style={{ width: 40 }} />}
              <Pressable style={st.choix} onPress={() => basculer(j)} accessibilityRole="checkbox" accessibilityState={{ checked: !!ligne }}>
                <Check on={!!ligne} />
                <Text style={st.pname} numberOfLines={1}>{j.nom_complet}</Text>
                <Badge text={j.poste} tone="n" />
                {ligne ? <Badge text={ligne.statut === 'T' ? 'Titulaire' : 'Remplaçant'} tone={ligne.statut === 'T' ? 'b' : 'n'} /> : <Text style={st.absent}>—</Text>}
              </Pressable>
              {ligne ? (
                <TextInput style={st.minute} keyboardType="number-pad" maxLength={3} value={ligne.minute} onChangeText={minute(j)}
                  placeholder={ligne.statut === 'T' ? 'sortie' : 'entrée'} placeholderTextColor="#9ca3af"
                  accessibilityLabel={`Minute ${ligne.statut === 'T' ? 'de sortie' : "d'entrée"} de ${j.nom_complet}`} />
              ) : <View style={{ width: 52 }} />}
            </View>
          );
        })}
        <Text style={[st.hint, { marginVertical: 10 }]}>
          Touchez un joueur : titulaire, puis remplaçant, puis absent. Saisissez le numéro de maillot, la minute de sortie d'un titulaire remplacé et la minute d'entrée d'un remplaçant.
          Seuls les joueurs cochés pourront recevoir des événements codés (RG3).
        </Text>
      </Card>
      <Rangee style={{ marginBottom: 10 }}>
        <Button title="Annuler" kind="secondary" style={{ flex: 1 }} onPress={navigation.goBack} />
        <Button title="Enregistrer le match" style={{ flex: 2 }} onPress={enregistrer} loading={f.envoi} />
      </Rangee>
    </Ecran>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 12, color: C.ink2, marginBottom: 6, ...F.semi },
  score: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.line2, borderRadius: 12, padding: 12, marginBottom: 12 },
  teamName: { flex: 1, fontSize: 12.5, color: C.ink, ...F.semi },
  goal: { width: 44, height: 46, borderRadius: 10, borderWidth: 1, borderColor: C.line2, textAlign: 'center', fontSize: 22, color: C.ink, ...F.bold },
  dash: { fontSize: 18, color: C.muted },
  upload: { borderWidth: 1, borderColor: C.line2, borderRadius: 10, padding: 12, marginBottom: 12 },
  file: { fontSize: 13, color: C.ink, ...F.medium },
  bar: { height: 6, backgroundColor: C.line, borderRadius: 4, marginTop: 9, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: C.blue },
  hint: { fontSize: 11.5, lineHeight: 16, color: C.muted, marginTop: 6, ...F.regular },
  tabs: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 10, padding: 3, marginBottom: 8 },
  tabBtn: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: 6 },
  tabOn: { backgroundColor: '#fff' },
  tabTxt: { fontSize: 12.5, color: C.muted, ...F.medium },
  player: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f0f1f3', gap: 8 },
  choix: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pname: { flex: 1, fontSize: 13.5, color: C.ink, ...F.medium },
  absent: { color: '#9ca3af', width: 60, textAlign: 'center' },
  minute: { width: 52, height: 34, borderRadius: 8, borderWidth: 1, borderColor: C.line2, textAlign: 'center', fontSize: 12.5, color: C.ink, backgroundColor: '#fff' },
});
