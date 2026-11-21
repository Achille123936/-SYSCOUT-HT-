import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { api } from '../api';
import { C, F } from '../theme';
import { ACTIONS, chrono } from '../constantes';
import { Ecran, Etat, Card, Alert, Badge, Select, Segmented, Button, Rangee, Field, confirmer, useChargement, useLarge } from '../components/ui';
import { useAuth } from '../auth';
import { CoucheDessin, OUTILS, useUniteVitesse } from '../components/Telestration';

const NOM_FORME = Object.fromEntries(OUTILS);
const NOM_ACTION = Object.fromEntries(ACTIONS.map(([cle, nom]) => [cle, nom]));
const COULEUR = Object.fromEntries(ACTIONS.map(([cle, , , couleur]) => [cle, couleur]));
const AVANT = 5; // un clip commence 5 secondes avant l'action…
const APRES = 5; // …et se termine 5 secondes après

// Relecture d'un match : vidéo, dessins de l'analyste (télestration) et clips des actions codées.
// Les clips se filtrent par type d'action, équipe et joueur, puis se lisent un par un ou à la suite (playlist).
export default function RelectureScreen({ route }) {
  const { id } = route.params;
  const video = useRef(null);
  const chargee = useRef(false);
  const [temps, setTemps] = useState(0);
  const [duree, setDuree] = useState(null);
  const [lecture, setLecture] = useState(false);
  const [lisible, setLisible] = useState(true);
  const [type, setType] = useState(null);
  const [equipe, setEquipe] = useState(null);
  const [joueur, setJoueur] = useState(null);
  const [resultat, setResultat] = useState(null);
  const [clip, setClip] = useState(null); // { index, fin, suite } : clip en cours de lecture
  const [affiches, setAffiches] = useState(30);
  const large = useLarge();
  const { utilisateur } = useAuth();
  const [angle, setAngle] = useState(1);
  const [unite, setUnite] = useUniteVitesse();
  const [playlist, setPlaylist] = useState(null);
  const [nomPlaylist, setNomPlaylist] = useState('');
  const [message, setMessage] = useState(null);
  const reprise = useRef(null);
  const playlists = useChargement(() => api.get('/playlists/', { match: id }), [id]);
  const { donnees, ...etat } = useChargement(async () => {
    const [match, annotations, evenements] = await Promise.all([
      api.get(`/matchs/${id}/`), api.get('/annotations/', { match: id }), api.get('/evenements/', { match: id }),
    ]);
    return { match, annotations, evenements };
  }, [id]);
  const m = donnees?.match;
  const annotations = donnees?.annotations || [];
  const total = lisible && duree ? duree : (m?.duree || 90) * 60;

  useEffect(() => {
    if (!m?.video_lecture) return undefined;
    const delai = setTimeout(() => { if (!chargee.current) { setLisible(false); setLecture(false); } }, 10000);
    return () => clearTimeout(delai);
  }, [m?.video_lecture]);

  // si la vidéo ne peut pas être lue, un chronomètre fait défiler les dessins et les clips
  useEffect(() => {
    if (!lecture || lisible) return undefined;
    const pas = setInterval(() => setTemps((t) => Math.min(t + 1, total)), 1000);
    return () => clearInterval(pas);
  }, [lecture, lisible, total]);

  const aller = (secondes) => {
    const cible = Math.max(0, Math.min(secondes, total));
    setTemps(cible);
    if (lisible && video.current) video.current.setPositionAsync(cible * 1000).catch(() => {});
  };

  const clips = useMemo(() => (donnees?.evenements || []).filter((e) => (!type || e.type_action === type)
    && (!equipe || e.club === equipe) && (!joueur || e.joueur === joueur) && (resultat === null || e.resultat === resultat)),
  [donnees, type, equipe, joueur, resultat]);

  const lireClip = (index, suite) => {
    const e = clips[index];
    if (!e) { setClip(null); setLecture(false); return; }
    aller(e.temps_video - AVANT);
    setClip({ index, fin: Math.min(e.temps_video + APRES, total), suite });
    setLecture(true);
  };
  // fin d'un clip : on s'arrête, ou on enchaîne sur le suivant quand la playlist est lue à la suite
  useEffect(() => {
    if (!clip || !lecture || temps < clip.fin) return;
    if (clip.suite && clip.index + 1 < clips.length) lireClip(clip.index + 1, true);
    else { setLecture(false); setClip(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temps, clip, lecture]);
  useEffect(() => { setClip(null); setAffiches(30); }, [type, equipe, joueur, resultat]);

  // playlists enregistrées : un nom et les critères qui choisissent les clips
  const ouvrirPlaylist = (identifiant) => {
    setPlaylist(identifiant);
    const choisie = (playlists.donnees || []).find((x) => x.id === identifiant);
    if (!choisie) return;
    setType(choisie.filtres.type ?? null);
    setEquipe(choisie.filtres.equipe ?? null);
    setJoueur(choisie.filtres.joueur ?? null);
    setResultat(choisie.filtres.resultat ?? null);
  };
  const enregistrerPlaylist = async () => {
    if (!nomPlaylist.trim()) { setMessage('Donnez un nom à la playlist.'); return; }
    const filtres = {};
    if (type) filtres.type = type;
    if (equipe) filtres.equipe = equipe;
    if (joueur) filtres.joueur = joueur;
    if (resultat !== null) filtres.resultat = resultat;
    try {
      const creee = await api.post('/playlists/', { match: id, nom: nomPlaylist.trim(), filtres });
      setNomPlaylist('');
      setMessage(null);
      await playlists.recharger();
      setPlaylist(creee.id);
    } catch (e) { setMessage(e.message); }
  };
  const supprimerPlaylist = async () => {
    if (!(await confirmer('Supprimer', 'Voulez-vous vraiment supprimer cette playlist ?'))) return;
    try { await api.delete(`/playlists/${playlist}/`); setPlaylist(null); playlists.recharger(); } catch (e) { setMessage(e.message); }
  };
  const choisie = (playlists.donnees || []).find((x) => x.id === playlist);
  // second angle de caméra : la lecture reprend au même instant sur l'autre vidéo
  const changerAngle = (n) => { reprise.current = temps; chargee.current = false; setAngle(n); };
  const source = m ? (angle === 2 && m.video_url_2 ? m.video_url_2 : m.video_lecture) : null;

  const visibles = annotations.filter((a) => temps >= a.temps_video && temps < a.temps_video + a.duree);
  const joueurs = m ? m.compositions.filter((c) => !equipe || c.club === equipe).map((c) => [c.joueur, `${c.joueur_nom} · ${c.poste}`]) : [];
  const enCours = clip ? clips[clip.index] : null;

  return (
    <Ecran titre={m ? `${m.domicile_sigle || m.domicile_nom} – ${m.exterieur_sigle || m.exterieur_nom}` : 'Relecture'}
      sousTitre={m ? `J${m.journee} · vidéo, clips et dessins` : null}>
      <Etat {...etat} donnees={donnees} />
      {m ? (
        <>
          {!lisible ? <Alert tone="i" text="La vidéo ne peut pas être lue sur cet appareil : les clips et les dessins défilent avec le chronomètre." /> : null}
          {/* écran large : la vidéo à gauche, les playlists, clips et dessins à droite */}
          <View style={large ? st.deux : null}>
          <View style={large ? st.gauche : null}>
          <View style={st.cadre}>
            {lisible ? (
              <Video key={angle} ref={video} source={{ uri: source }} style={{ width: '100%', height: '100%' }} resizeMode={ResizeMode.CONTAIN}
                shouldPlay={lecture} progressUpdateIntervalMillis={250}
                onError={() => { setLisible(false); setLecture(false); }}
                onPlaybackStatusUpdate={(s) => {
                  if (!s.isLoaded) {
                    if (s.error) { setLisible(false); setLecture(false); }
                    return;
                  }
                  if (!s.durationMillis) return;
                  if (reprise.current !== null) { // changement d'angle : on se replace au même instant
                    const cible = reprise.current;
                    reprise.current = null;
                    chargee.current = true;
                    video.current?.setPositionAsync(cible * 1000).catch(() => {});
                    return;
                  }
                  chargee.current = true;
                  setTemps(s.positionMillis / 1000);
                  setDuree(s.durationMillis / 1000);
                  if (s.didJustFinish) setLecture(false);
                }} />
            ) : null}
            <CoucheDessin annotations={visibles} actif={false} unite={unite} />
            {enCours ? (
              <View style={st.bandeau} pointerEvents="none">
                <Text style={st.bandeauTxt}>Clip {clip.index + 1}/{clips.length} · {enCours.minute}' {NOM_ACTION[enCours.type_action]} · {enCours.joueur_nom}</Text>
              </View>
            ) : null}
          </View>
          <View style={st.commandes}>
            {[['−5s', () => aller(temps - 5)], [lecture ? '❚❚' : '▶', () => setLecture(!lecture)], ['+5s', () => aller(temps + 5)]].map(([symbole, faire], i) => (
              <Pressable key={symbole} onPress={faire} style={[st.bouton, i === 1 && { backgroundColor: C.blue }]} accessibilityLabel={i === 1 ? (lecture ? 'Pause' : 'Lecture') : symbole}>
                <Text style={[st.boutonTxt, i === 1 && { color: '#fff' }]}>{symbole}</Text>
              </Pressable>
            ))}
            <Text style={st.temps}>{chrono(temps)} <Text style={{ color: C.muted, ...F.regular }}>/ {chrono(total)}</Text></Text>
          </View>

          {m.video_url_2 ? <Segmented options={[[1, 'Caméra 1'], [2, 'Caméra 2']]} value={angle} onChange={changerAngle} /> : null}

          </View>
          <View style={large ? st.droite : null}>
          <Card title="Playlists" badge={<Badge text={String((playlists.donnees || []).length)} tone="b" />}>
            <Alert tone="e" text={message} />
            <Select label="Playlist enregistrée" placeholder="Aucune" value={playlist} onChange={ouvrirPlaylist}
              options={(playlists.donnees || []).map((x) => [x.id, `${x.nom} · ${x.auteur_nom}`])} vide="Aucune playlist enregistrée pour ce match." />
            <Rangee style={{ alignItems: 'flex-end' }}>
              <Field label="Enregistrer les critères ci-dessous sous le nom" placeholder="ex. Tirs ratés de l'équipe" value={nomPlaylist} onChangeText={setNomPlaylist} style={{ flex: 1 }} />
              <Button title="Enregistrer" style={{ height: 44, marginBottom: 12 }} onPress={enregistrerPlaylist} />
            </Rangee>
            {choisie && choisie.auteur === utilisateur.id ? <Button title="Supprimer cette playlist" kind="secondary" style={{ height: 40, marginBottom: 12 }} onPress={supprimerPlaylist} /> : null}
          </Card>

          <Card title="Clips des actions" badge={<Badge text={`${clips.length} clip(s)`} tone="b" />}>
            <Rangee>
              <Select label="Action" placeholder="Toutes" value={type} onChange={setType} style={{ flex: 1 }}
                options={ACTIONS.map(([cle, nom]) => [cle, nom])} />
              <Select label="Équipe" placeholder="Les deux" value={equipe} onChange={(v) => { setEquipe(v); setJoueur(null); }} style={{ flex: 1 }}
                options={[[m.club_domicile, m.domicile_nom], [m.club_exterieur, m.exterieur_nom]]} />
            </Rangee>
            <Select label="Joueur" placeholder="Tous" value={joueur} onChange={setJoueur} options={joueurs} />
            <Segmented options={[[null, 'Tous'], [true, 'Réussis'], [false, 'Ratés']]} value={resultat} onChange={setResultat} />
            <Rangee style={{ marginBottom: 10 }}>
              <Button title={clip?.suite ? 'Arrêter la playlist' : `▶ Lire les ${clips.length} clips à la suite`} style={{ flex: 1, height: 44 }}
                kind={clip?.suite ? 'secondary' : 'primary'} disabled={!clips.length}
                onPress={() => { if (clip?.suite) { setClip(null); setLecture(false); } else lireClip(0, true); }} />
            </Rangee>
            {!clips.length ? <Text style={st.vide}>Aucune action codée ne correspond à ces critères.</Text> : null}
            {clips.slice(0, affiches).map((e, index) => (
              <Pressable key={e.id} style={[st.ligne, clip?.index === index && st.active]} onPress={() => lireClip(index, false)}>
                <Text style={st.quand}>{e.minute}'</Text>
                <View style={[st.pastille, { backgroundColor: COULEUR[e.type_action] }]} />
                <Text style={st.quoi} numberOfLines={1}><Text style={F.semi}>{NOM_ACTION[e.type_action]}</Text> · {e.joueur_nom}</Text>
                <Text style={[st.qui, { color: e.resultat ? C.green : C.red }]}>{e.resultat ? 'Réussi' : 'Raté'}</Text>
                <Text style={st.jouer}>▶</Text>
              </Pressable>
            ))}
            {clips.length > affiches ? <Button title={`Afficher plus (${clips.length - affiches} restants)`} kind="secondary" style={{ height: 40, marginTop: 8 }} onPress={() => setAffiches(affiches + 30)} /> : null}
            <View style={{ height: 10 }} />
          </Card>

          <Card title="Dessins de l'analyste" badge={<Badge text={String(annotations.length)} tone="b" />}>
            {!annotations.length ? <Text style={st.vide}>Aucun dessin sur cette vidéo pour le moment.</Text> : null}
            {annotations.some((a) => a.forme === 'JOUEUR' && a.mesures?.length) ? (
              <Segmented label="Vitesses des étiquettes joueur" options={[['kmh', 'km/h'], ['mph', 'mph']]} value={unite} onChange={setUnite} />
            ) : null}
            {annotations.map((a) => (
              <Pressable key={a.id} style={st.ligne} onPress={() => { setClip(null); setLecture(false); aller(a.temps_video); }}>
                <Text style={st.quand}>{chrono(a.temps_video)}</Text>
                <View style={[st.pastille, { backgroundColor: a.couleur }]} />
                <Text style={st.quoi} numberOfLines={1}>{NOM_FORME[a.forme]}{a.texte ? ` · « ${a.texte} »` : ''}</Text>
                <Text style={st.qui} numberOfLines={1}>{a.auteur_nom} · {a.duree} s</Text>
              </Pressable>
            ))}
            <View style={{ height: 8 }} />
          </Card>
          </View>
          </View>
        </>
      ) : null}
    </Ecran>
  );
}

const st = StyleSheet.create({
  deux: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  gauche: { flex: 1.5 },
  droite: { flex: 1, minWidth: 340 },
  cadre: { aspectRatio: 16 / 9, width: '100%', maxWidth: 900, alignSelf: 'center', borderRadius: 12, overflow: 'hidden', backgroundColor: '#0b1020', marginBottom: 10 },
  bandeau: { position: 'absolute', left: 10, bottom: 10, backgroundColor: 'rgba(11,16,32,.82)', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  bandeauTxt: { color: '#fff', fontSize: 12, ...F.semi },
  commandes: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  bouton: { width: 52, height: 40, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  boutonTxt: { fontSize: 13, color: C.ink2, ...F.semi },
  temps: { fontSize: 15, color: C.ink, marginLeft: 6, ...F.bold },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#f0f1f3' },
  active: { backgroundColor: C.blue50, borderRadius: 8 },
  quand: { width: 46, fontSize: 13, color: C.blue, ...F.bold },
  pastille: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: C.line2 },
  quoi: { flex: 1, fontSize: 13.5, color: C.ink, ...F.medium },
  qui: { fontSize: 11.5, color: C.muted, maxWidth: 130, ...F.regular },
  jouer: { fontSize: 12, color: C.blue },
  vide: { color: C.muted, fontSize: 13, paddingVertical: 12, ...F.regular },
});
