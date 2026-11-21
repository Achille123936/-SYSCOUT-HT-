import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform, TextInput, useWindowDimensions } from 'react-native';
import Svg, { Rect, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Video, ResizeMode } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, nouvelleCle } from '../api';
import { useDirect } from '../live';
import { C, F } from '../theme';
import { ACTIONS, PARTIES_CORPS, chrono } from '../constantes';
import { confirmer, informer } from '../components/ui';
import { BarreDessin, CoucheDessin, COULEURS, MESUREES, useUniteVitesse } from '../components/Telestration';

const COULEUR = Object.fromEntries(ACTIONS.map(([cle, , , couleur]) => [cle, couleur]));
const NOM = Object.fromEntries(ACTIONS.map(([cle, nom]) => [cle, nom]));
const position = (e) => {
  const n = e.nativeEvent;
  return [typeof n.locationX === 'number' ? n.locationX : n.offsetX, typeof n.locationY === 'number' ? n.locationY : n.offsetY];
};
const court = (nom) => { const mots = nom.split(' '); return mots.length > 1 ? `${mots[0][0]}. ${mots.slice(1).join(' ')}` : nom; };
const trier = (liste) => liste.sort((a, b) => a.temps_video - b.temps_video || a.id - b.id);
const meme = (a, b) => a.corps.cle_idempotence === b.corps.cle_idempotence;

// CU07 — Coder les événements d'un match · CU08 — Valider le codage (thème sombre, SEL 3.5)
export default function CodageScreen({ navigation, route }) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const large = useWindowDimensions().width >= 900;
  const video = useRef(null);
  const [match, setMatch] = useState(null);
  const [evenements, setEvenements] = useState([]);
  const [message, setMessage] = useState(null);
  const [incoherences, setIncoherences] = useState([]);
  const [videoLisible, setVideoLisible] = useState(true);
  const [dureeVideo, setDureeVideo] = useState(null);
  const videoChargee = useRef(false);
  const reprise = useRef(0);
  const [temps, setTemps] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [vitesse, setVitesse] = useState(1);
  const [decalage, setDecalage] = useState(0); // écart entre le temps de la vidéo et la minute du match
  const [zone, setZone] = useState({ x: 50, y: 50 });
  const [terrain, setTerrain] = useState({ w: 1, h: 1 });
  const [piste, setPiste] = useState(1);
  const [action, setAction] = useState('PASSE');
  const [equipe, setEquipe] = useState(0);
  const [joueur, setJoueur] = useState(null);
  const [reussi, setReussi] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [sauvegarde, setSauvegarde] = useState(Date.now());
  const [, setTic] = useState(0);
  const [annotations, setAnnotations] = useState([]);
  const [dessin, setDessin] = useState(false);
  const [outil, setOutil] = useState('FLECHE');
  const [couleur, setCouleur] = useState(COULEURS[0]);
  const [dureeDessin, setDureeDessin] = useState(5);
  const [possession, setPossession] = useState(null);
  // panneau de codage personnalisé : chaque analyste masque les types d'action dont il ne se sert pas
  const [masques, setMasques] = useState([]);
  const [reglage, setReglage] = useState(false);
  // AC-012 : sans réseau, l'événement reste sur l'appareil (avec sa clé d'idempotence) et part au retour du réseau
  const [attente, setAttenteEtat] = useState([]);
  const attenteRef = useRef([]);
  const envoiAttente = useRef(false);
  const setAttente = useCallback((maj) => {
    const suivant = typeof maj === 'function' ? maj(attenteRef.current) : maj;
    attenteRef.current = suivant;
    setAttenteEtat(suivant);
    AsyncStorage.setItem(`syscout.codage.attente.${id}`, JSON.stringify(suivant)).catch(() => {});
  }, [id]);
  useEffect(() => {
    AsyncStorage.getItem(`syscout.codage.attente.${id}`).then((v) => {
      // un événement refusé lors d'une session précédente est retenté à la réouverture
      const gardes = v ? JSON.parse(v).map(({ erreur, ...a }) => a) : [];
      if (gardes.length) setAttente((courante) => [...gardes, ...courante.filter((a) => !gardes.some((g) => meme(a, g)))]);
    }).catch(() => {});
  }, [id, setAttente]);
  useEffect(() => {
    AsyncStorage.getItem('syscout.actions.masquees').then((v) => v && setMasques(JSON.parse(v))).catch(() => {});
  }, []);
  const basculerAction = (cle) => setMasques((liste) => {
    const suivant = liste.includes(cle) ? liste.filter((c) => c !== cle) : [...liste, cle];
    if (suivant.length >= ACTIONS.length) return liste; // il reste toujours au moins un bouton
    AsyncStorage.setItem('syscout.actions.masquees', JSON.stringify(suivant)).catch(() => {});
    return suivant;
  });
  const [reference, setReference] = useState('TERRAIN');
  const [coins, setCoins] = useState([]);
  const [resultatSuivi, setResultatSuivi] = useState(null);
  const tempsRef = useRef(0);
  tempsRef.current = temps;
  const [texteDessin, setTexteDessin] = useState('');
  const [calibrage, setCalibrage] = useState(false); // l'analyste a demandé à calibrer l'image pour mesurer en mètres
  const [unite, setUnite] = useUniteVitesse();
  // passe ou centre : un second toucher sur le terrain donne le point d'arrivée (carte des passes)
  const [arrivee, setArrivee] = useState(null);
  const [cible, setCible] = useState('DEPART');
  const avecArrivee = action === 'PASSE' || action === 'CENTRE';
  // tir ou but : pied droit, pied gauche ou tête (facultatif)
  const [partie, setPartie] = useState('');
  const avecPartie = action === 'TIR' || action === 'BUT';

  // CU07 étape 2 : le système verrouille le match pour cet analyste et affiche vidéo, ligne de temps et joueurs
  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const m = await api.post(`/matchs/${id}/ouvrir-codage/`);
        const evts = await api.get('/evenements/', { match: id });
        if (!actif) return;
        setMatch(m);
        setEvenements(evts);
        api.get(`/matchs/${id}/direct/`).then((d) => actif && setPossession(d.possession)).catch(() => {});
        api.get('/annotations/', { match: id }).then((liste) => actif && setAnnotations(liste)).catch(() => {});
        if (evts.length) { // reprise là où le codage s'est arrêté
          const dernier = evts[evts.length - 1];
          setTemps(dernier.temps_video);
          reprise.current = dernier.temps_video;
          setDecalage(dernier.minute - Math.floor(dernier.temps_video / 60));
        }
      } catch (e) {
        if (actif) setMessage(e.message);
      }
    })();
    // CU07 étape 8 : en quittant l'écran, le verrou est libéré et le match reste « En codage »
    return () => { actif = false; api.post(`/matchs/${id}/fermer-codage/`).catch(() => {}); };
  }, [id]);

  // toutes les 30 secondes : le verrou est prolongé et la sauvegarde confirmée (EF 7.3)
  useEffect(() => {
    if (!match) return undefined;
    const battement = setInterval(async () => {
      try { await api.post(`/matchs/${id}/ouvrir-codage/`); setSauvegarde(Date.now()); } catch (e) { setMessage(e.message); }
    }, 30000);
    const horloge = setInterval(() => setTic((t) => t + 1), 5000);
    return () => { clearInterval(battement); clearInterval(horloge); };
  }, [id, match]);

  const urlVideo = match?.video_lecture;
  useEffect(() => {
    if (!urlVideo) return undefined;
    const delai = setTimeout(() => { if (!videoChargee.current) { setVideoLisible(false); setLecture(false); } }, 10000);
    return () => clearTimeout(delai);
  }, [urlVideo]);
  const avecVideo = !!urlVideo && videoLisible;
  const dureeTotale = avecVideo && dureeVideo ? dureeVideo : (match?.duree || 90) * 60;

  // sans vidéo lisible, un chronomètre tient lieu de lecteur
  useEffect(() => {
    if (!lecture || avecVideo) return undefined;
    const pas = setInterval(() => setTemps((t) => Math.min(t + vitesse, dureeTotale)), 1000);
    return () => clearInterval(pas);
  }, [lecture, avecVideo, vitesse, dureeTotale]);

  const aller = useCallback((secondes) => {
    const cible = Math.max(0, Math.min(secondes, dureeTotale));
    setTemps(cible);
    if (avecVideo && video.current) video.current.setPositionAsync(cible * 1000).catch(() => {});
  }, [avecVideo, dureeTotale]);

  const minute = match ? Math.max(0, Math.min(Math.floor(temps / 60) + decalage, match.duree)) : 0;
  const clubs = match ? [match.club_domicile, match.club_exterieur] : [];
  const compositions = match ? match.compositions.filter((c) => c.club === clubs[equipe]) : [];

  // envoie dans l'ordre les événements gardés sur l'appareil ; s'arrête à la première coupure réseau
  const synchroniser = useCallback(async () => {
    if (envoiAttente.current || !attenteRef.current.length) return;
    envoiAttente.current = true;
    try {
      for (const item of attenteRef.current.filter((a) => !a.erreur)) {
        try {
          const evt = await api.post('/evenements/', item.corps); // déjà reçu : le serveur rend l'événement existant
          setAttente((liste) => liste.filter((a) => !meme(a, item)));
          setEvenements((liste) => trier([...liste.filter((e) => e.id !== evt.id), { ...evt, club: item.club }]));
          setSauvegarde(Date.now());
        } catch (e) {
          if (e.statut === 0) break;
          // refusé (verrou perdu, joueur retiré…) : reste affiché avec la raison, l'analyste le supprime ou rouvre le codage
          setAttente((liste) => liste.map((a) => (meme(a, item) ? { ...a, erreur: e.message } : a)));
        }
      }
    } finally {
      envoiAttente.current = false;
    }
  }, [setAttente]);

  useEffect(() => {
    if (!match || !attente.length) return undefined;
    synchroniser();
    const relance = setInterval(synchroniser, 10000);
    return () => clearInterval(relance);
  }, [match, attente.length, synchroniser]);

  const ajouter = useCallback(async () => {
    if (!match || envoi) return;
    if (!joueur) { setMessage('Choisissez le joueur avant d\'ajouter l\'événement.'); return; }
    setEnvoi(true);
    setMessage(null);
    const corps = {
      match: id, joueur, type_action: action, minute, temps_video: Math.floor(temps),
      zone_x: zone.x, zone_y: zone.y, resultat: reussi, cle_idempotence: nouvelleCle(),
      ...(avecArrivee && arrivee ? { fin_x: arrivee.x, fin_y: arrivee.y } : {}),
      ...(avecPartie && partie ? { partie_corps: partie } : {}),
    };
    const reinitialiser = () => { setArrivee(null); setCible('DEPART'); setPartie(''); setIncoherences([]); };
    try {
      const evt = await api.post('/evenements/', corps);
      setEvenements((liste) => trier([...liste, { ...evt, club: clubs[equipe] }]));
      reinitialiser();
      setSauvegarde(Date.now());
      synchroniser(); // le réseau répond : les événements en attente peuvent partir
    } catch (e) {
      if (e.statut === 0) {
        const nom = match.compositions.find((c) => c.joueur === joueur)?.joueur_nom || '';
        setAttente((liste) => [...liste, { corps, club: clubs[equipe], joueur_nom: nom }]);
        reinitialiser();
        setMessage("Pas de connexion : l'événement est gardé sur cet appareil et sera envoyé dès le retour du réseau.");
      } else {
        setMessage(e.message);
      }
    } finally {
      setEnvoi(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, envoi, joueur, action, minute, temps, zone, arrivee, partie, reussi, equipe, id, synchroniser, setAttente]);

  // Télestration : un dessin apparaît à la seconde où il a été tracé et reste affiché quelques secondes
  const dessinsVisibles = annotations.filter((a) => temps >= a.temps_video && temps < a.temps_video + a.duree);
  // Suivi d'un joueur sur la vidéo : le trajet tracé au doigt est converti en mètres par le serveur
  const suivre = async (trace) => {
    if (!joueur) { setMessage('Choisissez le joueur à suivre avant de tracer son trajet.'); return; }
    try {
      setMessage(null);
      setResultatSuivi({ ...(await api.post(`/matchs/${id}/suivi/`, { joueur, reference, coins, points: trace.points, couleur: trace.couleur })), joueur });
      setAnnotations(await api.get('/annotations/', { match: id }));
      setSauvegarde(Date.now());
    } catch (e) { setMessage(e.message); }
  };
  const reperes = coins.map(([x, y], i) => ({ id: `coin${i}`, forme: 'CERCLE', couleur: '#ffffff', points: [[x, y], [x + 1.2, y]] }));
  // le suivi exige le calibrage ; les formes mesurées (distance, liaison, triangle) ne le demandent que pour afficher des mètres
  const avecCalibrage = outil === 'SUIVI' || MESUREES.includes(outil);
  const outilActif = (outil === 'SUIVI' || (MESUREES.includes(outil) && calibrage)) && coins.length < 4 ? 'CALIBRAGE' : outil;

  const dessiner = async (forme) => {
    if (forme.forme === 'SUIVI') { suivre(forme); return; }
    if (forme.forme === 'TEXTE' && !forme.texte) { setMessage("Saisissez d'abord le texte à poser sur la vidéo."); return; }
    if (forme.forme === 'JOUEUR' && !forme.texte) { setMessage("Choisissez d'abord le joueur à étiqueter dans le panneau « 2 · JOUEUR »."); return; }
    // image calibrée : le serveur calcule les mètres de chaque segment ; étiquette : vitesse du dernier suivi de ce joueur
    let complement = {};
    if (MESUREES.includes(forme.forme) && coins.length === 4) complement = { coins, reference };
    else if (forme.forme === 'JOUEUR' && resultatSuivi?.joueur === joueur) complement = { vitesse: Math.min(45, resultatSuivi.sequence.vitesse_max_kmh) };
    try {
      setMessage(null);
      const cree = await api.post('/annotations/', { match: id, temps_video: Math.floor(temps), duree: dureeDessin, ...forme, ...complement });
      setAnnotations((liste) => [...liste, cree]);
      setSauvegarde(Date.now());
    } catch (e) { setMessage(e.message); }
  };
  const effacerDessin = async () => {
    const dernier = dessinsVisibles[dessinsVisibles.length - 1];
    try {
      await api.delete(`/annotations/${dernier.id}/`);
      setAnnotations((liste) => liste.filter((a) => a.id !== dernier.id));
    } catch (e) { setMessage(e.message); }
  };

  // SRS §10 — propositions de l'IA : l'analyste les vérifie sur la vidéo, puis confirme, corrige ou rejette
  const [propositions, setPropositions] = useState([]);
  const [choisie, setChoisie] = useState(null);
  const [commentaire, setCommentaire] = useState('');
  // le direct (WebSocket) signale l'arrivée de nouvelles propositions : la liste est alors relue
  const enAttenteIA = useDirect(id).donnees?.propositions?.en_attente;
  const chargerPropositions = useCallback(() => (
    api.get('/propositions-ia/', { match: id, statut: 'PENDING,UNVERIFIED' }).then(setPropositions).catch(() => {})
  ), [id]);
  useEffect(() => { if (match) chargerPropositions(); }, [!!match, enAttenteIA, chargerPropositions]); // eslint-disable-line react-hooks/exhaustive-deps

  const choisir = (p) => {
    if (choisie?.id === p.id) { setChoisie(null); return; }
    setChoisie(p);
    setCommentaire('');
    // la vidéo se place sur l'action et le formulaire reprend ce que l'IA propose
    aller(p.temps_video);
    setDecalage(p.minute - Math.floor(p.temps_video / 60));
    setAction(p.type_action);
    if (p.club) setEquipe(p.club === match.club_exterieur ? 1 : 0);
    setJoueur(p.joueur);
    setZone({ x: p.zone_x, y: p.zone_y });
    setArrivee(p.fin_x != null ? { x: p.fin_x, y: p.fin_y } : null);
    setReussi(p.resultat);
    setPartie(p.partie_corps || '');
  };

  const decider = async (decision) => {
    if (!choisie) return;
    // « corriger » envoie le formulaire tel que l'analyste l'a modifié
    const corrections = decision !== 'corriger' ? {} : {
      joueur, type_action: action, minute, temps_video: Math.floor(temps), zone_x: zone.x, zone_y: zone.y, resultat: reussi,
      fin_x: avecArrivee && arrivee ? arrivee.x : null, fin_y: avecArrivee && arrivee ? arrivee.y : null,
      partie_corps: avecPartie ? partie : '',
    };
    try {
      await api.post(`/propositions-ia/${choisie.id}/valider/`, { decision, commentaire: commentaire.trim(), ...corrections });
      setPropositions((liste) => liste.filter((p) => p.id !== choisie.id));
      setChoisie(null);
      setCommentaire('');
      setMessage(null);
      if (decision !== 'rejeter') setEvenements(trier(await api.get('/evenements/', { match: id })));
      setSauvegarde(Date.now());
    } catch (e) { setMessage(e.message); }
  };

  // FR-043 : si la caméra qui filme le match est déjà calibrée, l'image l'est aussi ici (mesures en mètres, suivi)
  const [cameraEnCours, setCameraEnCours] = useState(null);
  useEffect(() => {
    if (!match) return;
    api.get('/enregistrements/', { match: id }).then((liste) => {
      const enCours = liste.find((e) => !e.fin) || null;
      setCameraEnCours(enCours);
      if (enCours?.camera_calibrage) { setReference(enCours.camera_calibrage.reference); setCoins(enCours.camera_calibrage.coins); }
    }).catch(() => {});
  }, [!!match]); // eslint-disable-line react-hooks/exhaustive-deps
  const calibrageNouveau = cameraEnCours && coins.length === 4
    && JSON.stringify({ reference, coins }) !== JSON.stringify(cameraEnCours.camera_calibrage);
  const enregistrerCalibrage = async () => {
    try {
      const camera = await api.post(`/cameras/${cameraEnCours.camera}/calibrer/`, { reference, coins });
      setCameraEnCours((e) => ({ ...e, camera_calibrage: camera.calibrage }));
      setCoins(camera.calibrage.coins);
      setMessage(null);
    } catch (e) { setMessage(e.message); }
  };

  // Possession : l'analyste indique qui a le ballon, le serveur chronomètre chaque période
  const ballon = async (club) => {
    try {
      setPossession(await api.post(`/matchs/${id}/possession/`, { club, temps_video: Math.floor(temps) }));
      setSauvegarde(Date.now());
    } catch (e) { setMessage(e.message); }
  };

  const supprimer = async (evt) => {
    if (evt.enAttente) { // jamais arrivé au serveur : il suffit de l'oublier
      setAttente((liste) => liste.filter((a) => a.corps.cle_idempotence !== evt.id));
      return;
    }
    try {
      await api.delete(`/evenements/${evt.id}/`);
      setEvenements((liste) => liste.filter((e) => e.id !== evt.id));
      setSauvegarde(Date.now());
    } catch (e) { setMessage(e.message); }
  };

  // CU08 : contrôle de cohérence, puis calcul des statistiques, centiles et indices
  const valider = async () => {
    if (attente.length) {
      setMessage(`${attente.length} événement(s) ne sont pas encore arrivés au serveur : attendez le retour du réseau ou supprimez-les avant de valider.`);
      return;
    }
    if (!(await confirmer('Valider le codage', 'Les statistiques du match seront calculées et publiées. Confirmer la validation ?'))) return;
    setEnvoi(true);
    setMessage(null);
    try {
      const r = await api.post(`/matchs/${id}/valider/`);
      informer('Statistiques publiées', `${r.joueurs_calcules} joueurs recalculés en ${String(r.duree_calcul).replace('.', ',')} s. Les centiles et indices de la saison sont à jour.`);
      navigation.goBack();
    } catch (e) {
      setIncoherences(e.donnees?.erreurs || []);
      setMessage(e.donnees?.erreurs ? 'Le codage est incohérent : corrigez les points ci-dessous avant de valider.' : e.message);
      setEnvoi(false);
    }
  };

  // raccourcis clavier (SEL 3.6.9) : une touche par type d'action, Entrée ajoute, Espace lance ou arrête la lecture
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const touche = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      const trouve = ACTIONS.find(([, , lettre]) => lettre === e.key.toUpperCase());
      if (trouve) setAction(trouve[0]);
      else if (e.key === 'Enter') { e.preventDefault(); ajouter(); } else if (e.key === ' ') { e.preventDefault(); setLecture((l) => !l); }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [ajouter]);

  if (!match) {
    return (
      <View style={[st.root, { justifyContent: 'center', padding: 24 }]}>
        {message ? (
          <>
            <Text style={st.erreur}>{message}</Text>
            <Pressable style={[st.ctrl, { width: 'auto', alignSelf: 'center', paddingHorizontal: 18, marginTop: 14 }]} onPress={navigation.goBack}>
              <Text style={st.ctrlTxt}>Retour</Text>
            </Pressable>
          </>
        ) : <ActivityIndicator color="#fff" />}
      </View>
    );
  }

  const depuis = Math.round((Date.now() - sauvegarde) / 1000);
  // les événements gardés sur l'appareil s'affichent avec les autres, marqués « en attente »
  const affiches = [...evenements, ...attente.map((a) => ({
    ...a.corps, id: a.corps.cle_idempotence, club: a.club, joueur_nom: a.joueur_nom, enAttente: true, erreur: a.erreur,
  }))];
  const joueurChoisi = match.compositions.find((c) => c.joueur === joueur);
  // étiquette posée sur la vidéo : numéro de maillot et nom de famille
  const etiquette = joueurChoisi
    ? `${joueurChoisi.numero_maillot ?? ''} ${(joueurChoisi.joueur_nom.split(' ').slice(1).join(' ') || joueurChoisi.joueur_nom).toUpperCase()}`.trim().slice(0, 60)
    : '';

  const zoneLecteur = (
    <View style={{ gap: 10 }}>
      {avecVideo ? (
        <View style={st.video}>
          <Video ref={video} source={{ uri: urlVideo }} style={{ width: '100%', height: '100%' }} resizeMode={ResizeMode.CONTAIN}
            shouldPlay={lecture} rate={vitesse} progressUpdateIntervalMillis={500}
            onError={() => { setVideoLisible(false); setLecture(false); }}
            onPlaybackStatusUpdate={(etat) => {
              if (!etat.isLoaded) {
                if (etat.error) { setVideoLisible(false); setLecture(false); }
                return;
              }
              if (!etat.durationMillis) return;
              if (!videoChargee.current) {
                videoChargee.current = true;
                if (reprise.current > 0 && reprise.current * 1000 < etat.durationMillis) {
                  video.current?.setPositionAsync(reprise.current * 1000).catch(() => {});
                  return;
                }
                // vidéo plus courte que le codage déjà fait (extrait) : la minute du match continue où elle en était
                if (reprise.current > 0) setDecalage((d) => d + Math.floor(reprise.current / 60));
              }
              setTemps(etat.positionMillis / 1000);
              if (etat.durationMillis) setDureeVideo(etat.durationMillis / 1000);
              if (etat.didJustFinish) setLecture(false);
            }} />
          <CoucheDessin annotations={dessin && avecCalibrage ? [...dessinsVisibles, ...reperes] : dessinsVisibles} actif={dessin} outil={outilActif} couleur={couleur}
            texte={outil === 'JOUEUR' ? etiquette : texteDessin} unite={unite} surDessin={dessiner} surPoint={(p) => setCoins((c) => (c.length < 4 ? [...c, p] : c))} horloge={() => tempsRef.current} />
          <View style={st.overlay} pointerEvents="none"><Text style={st.overTxt}>{match.domicile_sigle} {match.score_domicile} – {match.score_exterieur} {match.exterieur_sigle}  <Text style={{ color: C.dAmber }}>{chrono(temps)}</Text></Text></View>
        </View>
      ) : urlVideo ? (
        <View style={st.video}>
          <View style={st.illisible}><Text style={st.sansVideoTxt}>La vidéo ne peut pas être lue sur cet appareil : le chronomètre la remplace.</Text></View>
          <CoucheDessin annotations={dessin && avecCalibrage ? [...dessinsVisibles, ...reperes] : dessinsVisibles} actif={dessin} outil={outilActif} couleur={couleur}
            texte={outil === 'JOUEUR' ? etiquette : texteDessin} unite={unite} surDessin={dessiner} surPoint={(p) => setCoins((c) => (c.length < 4 ? [...c, p] : c))} horloge={() => tempsRef.current} />
        </View>
      ) : (
        <View style={st.sansVideo}>
          <Text style={st.sansVideoTxt}>Chronomètre de codage</Text>
        </View>
      )}
      {urlVideo ? (
        <BarreDessin actif={dessin} surBascule={() => { setDessin(!dessin); setLecture(false); }} outil={outil} surOutil={setOutil}
          couleur={couleur} surCouleur={setCouleur} duree={dureeDessin} surDuree={setDureeDessin}
          texte={texteDessin} surTexte={setTexteDessin} unite={unite} surUnite={setUnite}
          suivi={{ reference, surReference: (r) => { setReference(r); setCoins([]); }, coins, resultat: resultatSuivi,
            enCalibrage: outilActif === 'CALIBRAGE', surRecalibrer: () => { setCoins([]); setCalibrage(true); },
            joueur: match.compositions.find((c) => c.joueur === joueur)?.joueur_nom }}
          visibles={dessinsVisibles} surEffacer={effacerDessin} />
      ) : null}

      <View style={st.controls}>
        {[['⏮', () => aller(0)], ['−5s', () => aller(temps - 5)], [lecture ? '❚❚' : '▶', () => setLecture(!lecture)], ['+5s', () => aller(temps + 5)], ['+1m', () => aller(temps + 60)]].map(([symbole, faire], i) => (
          <Pressable key={symbole} onPress={faire} style={[st.ctrl, i === 2 && { backgroundColor: C.dBlue }]} accessibilityLabel={i === 2 ? (lecture ? 'Pause' : 'Lecture') : symbole}>
            <Text style={st.ctrlTxt}>{symbole}</Text>
          </Pressable>
        ))}
        <Text style={st.time}>{chrono(temps)} <Text style={{ color: '#6b7699', ...F.medium }}>/ {chrono(dureeTotale)}</Text></Text>
        <Pressable style={st.track} onLayout={(e) => setPiste(e.nativeEvent.layout.width)} accessibilityLabel="Avancement"
          onPress={(e) => aller((position(e)[0] / piste) * dureeTotale)}>
          <View style={[st.trackFill, { width: `${(100 * temps) / dureeTotale}%` }]} />
        </Pressable>
        <Pressable style={st.speed} onPress={() => setVitesse(vitesse === 1 ? 2 : vitesse === 2 ? 0.5 : 1)}><Text style={st.ctrlTxt}>{String(vitesse).replace('.', ',')}x</Text></Pressable>
      </View>

      <View>
        <Pressable style={st.terrain}
          onLayout={(e) => setTerrain({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          onPress={(e) => {
            const touche = {
              x: Math.round(Math.max(0, Math.min(100, (100 * position(e)[0]) / terrain.w)) * 10) / 10,
              y: Math.round(Math.max(0, Math.min(100, (100 * position(e)[1]) / terrain.h)) * 10) / 10,
            };
            // passe ou centre : le premier toucher place le départ, le suivant l'arrivée
            if (avecArrivee && cible === 'ARRIVEE') setArrivee(touche);
            else { setZone(touche); if (avecArrivee) setCible('ARRIVEE'); }
          }} accessibilityLabel="Terrain : touchez pour placer la zone de l'action">
          <Svg width="100%" height="100%" viewBox="0 0 720 466" preserveAspectRatio="none" pointerEvents="none">
            <Defs><LinearGradient id="g" x1="0" x2="1"><Stop offset="0" stopColor="#1f6b3a" /><Stop offset=".5" stopColor="#25803f" /><Stop offset="1" stopColor="#1f6b3a" /></LinearGradient></Defs>
            <Rect width="720" height="466" fill="url(#g)" />
            {Array.from({ length: 10 }).map((_, i) => <Rect key={i} x={i * 72} width="36" height="466" fill="#fff" opacity="0.035" />)}
            <Rect x="16" y="16" width="688" height="434" stroke="#e8f5ec" strokeOpacity=".7" strokeWidth="2" fill="none" />
            <Line x1="360" y1="16" x2="360" y2="450" stroke="#e8f5ec" strokeOpacity=".7" strokeWidth="2" />
            <Circle cx="360" cy="233" r="58" stroke="#e8f5ec" strokeOpacity=".7" strokeWidth="2" fill="none" />
            <Rect x="16" y="105" width="105" height="256" stroke="#e8f5ec" strokeOpacity=".7" strokeWidth="2" fill="none" />
            <Rect x="599" y="105" width="105" height="256" stroke="#e8f5ec" strokeOpacity=".7" strokeWidth="2" fill="none" />
            {affiches.filter((e) => e.minute === minute).map((e) => (
              <Circle key={e.id} cx={(e.zone_x * 720) / 100} cy={(e.zone_y * 466) / 100} r="6" fill={COULEUR[e.type_action]} stroke="#0b1020" strokeWidth="2" />
            ))}
            {avecArrivee && arrivee ? (
              <>
                <Line x1={(zone.x * 720) / 100} y1={(zone.y * 466) / 100} x2={(arrivee.x * 720) / 100} y2={(arrivee.y * 466) / 100}
                  stroke="#ffffff" strokeWidth="3" strokeDasharray="9 6" />
                <Circle cx={(arrivee.x * 720) / 100} cy={(arrivee.y * 466) / 100} r="9" fill="#ffffff" stroke="#0b1020" strokeWidth="2" />
              </>
            ) : null}
            <Circle cx={(zone.x * 720) / 100} cy={(zone.y * 466) / 100} r="15" stroke="#ffd84d" strokeWidth="3" fill="rgba(255,216,77,.25)" />
          </Svg>
        </Pressable>
        <View style={st.overlay} pointerEvents="none"><Text style={st.overTxt}>Sens de l'attaque du joueur →</Text></View>
        <View style={st.overlayR} pointerEvents="none"><Text style={[st.overTxt, { ...F.regular, color: '#c4cbe0' }]}>{avecArrivee && cible === 'ARRIVEE' ? "Touchez le terrain : point d'arrivée" : 'Touchez le terrain pour placer la zone'}</Text></View>
      </View>
      {avecArrivee ? (
        <View style={{ flexDirection: 'row', gap: 7 }}>
          {[['DEPART', '① Départ'], ['ARRIVEE', arrivee ? '② Arrivée' : '② Arrivée (facultatif)']].map(([cle, nom]) => (
            <Pressable key={cle} onPress={() => setCible(cle)} style={[st.res, cible === cle && st.keyOn]} accessibilityState={{ selected: cible === cle }}>
              <Text style={[st.keyTxt, cible === cle && { color: '#fff', ...F.semi }]} numberOfLines={1}>{nom}</Text>
            </Pressable>
          ))}
          {arrivee ? (
            <Pressable onPress={() => setArrivee(null)} style={[st.res, { flex: 0, paddingHorizontal: 12 }]}>
              <Text style={st.keyTxt}>Effacer l'arrivée</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={st.timeline}>
        {ACTIONS.map(([cle, nom, , couleur]) => {
          const marques = affiches.filter((e) => e.type_action === cle);
          return (
            <View key={cle} style={st.tlRow}>
              <Text style={st.tlLabel} numberOfLines={1}><Text style={{ color: couleur }}>■ </Text>{nom} <Text style={{ color: '#6b7699' }}>{marques.length}</Text></Text>
              <View style={st.tlTrack}>
                {marques.map((e) => <View key={e.id} style={[st.mark, { left: `${Math.min(98.5, (100 * e.minute) / match.duree)}%`, backgroundColor: couleur }]} />)}
                <View style={[st.playhead, { left: `${Math.min(99.5, (100 * minute) / match.duree)}%` }]} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  const panneau = (
    <View style={{ gap: 10 }}>
      {message ? <View style={st.boxErreur}><Text style={st.erreur}>{message}</Text>{incoherences.map((ligne) => <Text key={ligne} style={st.erreur}>• {ligne}</Text>)}</View> : null}
      {propositions.length ? (
        <View style={[st.box, st.boxIA]}>
          <Text style={st.boxT}>PROPOSITIONS DE L'IA · {propositions.length} À VÉRIFIER</Text>
          {propositions.slice(0, 8).map((p) => {
            const confiance = Math.round(p.confiance * 100);
            const identite = p.joueur_nom ? court(p.joueur_nom) : `piste ${p.piste || '?'}${p.numero_maillot ? ` · n°${p.numero_maillot}` : ''} · joueur à identifier`;
            return (
              <Pressable key={p.id} onPress={() => choisir(p)} style={[st.log, choisie?.id === p.id && st.propositionChoisie]}
                accessibilityState={{ selected: choisie?.id === p.id }} accessibilityLabel={`Proposition : ${NOM[p.type_action]}, minute ${p.minute}, confiance ${confiance} %`}>
                <Text style={st.logT}>{p.minute}'</Text>
                <View style={[st.dot, { backgroundColor: COULEUR[p.type_action] }]} />
                <Text style={st.logA} numberOfLines={1}><Text style={F.semi}>{NOM[p.type_action]}</Text> · {identite}</Text>
                <Text style={[st.logR, { color: confiance >= 80 ? C.dGreen : confiance >= 60 ? '#f5b942' : '#ff8a98' }]}>{confiance} %</Text>
              </Pressable>
            );
          })}
          {choisie ? (
            <>
              <Text style={[st.sansVideoTxt, { marginTop: 8 }]}>
                {choisie.statut === 'UNVERIFIED' ? 'Laissée sans vérification à la validation du match. ' : ''}
                Vidéo et formulaire reprennent la proposition : confirmez-la telle quelle, ou modifiez le formulaire puis corrigez.
                {choisie.modele ? ` Modèle : ${choisie.modele}.` : ''}
              </Text>
              <TextInput style={st.commentaire} value={commentaire} onChangeText={setCommentaire} maxLength={300}
                placeholder="Commentaire (facultatif, gardé dans l'historique)" placeholderTextColor="#6b7699" accessibilityLabel="Commentaire" />
              <View style={{ flexDirection: 'row', gap: 7 }}>
                <Pressable style={[st.res, st.resOk]} onPress={() => decider('confirmer')} accessibilityRole="button">
                  <Text style={[st.keyTxt, { color: '#fff', ...F.semi }]}>✓ Confirmer</Text>
                </Pressable>
                <Pressable style={[st.res, st.keyOn]} onPress={() => decider('corriger')} accessibilityRole="button">
                  <Text style={[st.keyTxt, { color: '#fff', ...F.semi }]}>✎ Corriger</Text>
                </Pressable>
                <Pressable style={[st.res, st.resKo]} onPress={() => decider('rejeter')} accessibilityRole="button">
                  <Text style={[st.keyTxt, { color: '#fff', ...F.semi }]}>✕ Rejeter</Text>
                </Pressable>
              </View>
            </>
          ) : <Text style={[st.sansVideoTxt, { marginTop: 8 }]}>Touchez une proposition pour la vérifier sur la vidéo. Tant qu'elle n'est pas confirmée, elle ne compte dans aucune statistique.</Text>}
        </View>
      ) : null}
      {calibrageNouveau ? (
        <View style={st.box}>
          <Text style={st.boxT}>CALIBRAGE DE LA CAMÉRA</Text>
          <Text style={st.sansVideoTxt}>L'image est calibrée : enregistrez ce repère pour la caméra « {cameraEnCours.camera_nom} », il servira à chaque match qu'elle filme (tant qu'elle ne bouge pas).</Text>
          <Pressable style={[st.res, st.keyOn, { marginTop: 8 }]} onPress={enregistrerCalibrage} accessibilityRole="button">
            <Text style={[st.keyTxt, { color: '#fff', ...F.semi }]}>Enregistrer pour la caméra</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={st.box}>
        <Text style={st.boxT}>POSSESSION DU BALLON{possession?.domicile != null ? ` · ${String(possession.domicile).replace('.', ',')} % – ${String(possession.exterieur).replace('.', ',')} %` : ''}</Text>
        <View style={{ flexDirection: 'row', gap: 7 }}>
          {[[match.club_domicile, match.domicile_sigle || 'Domicile'], [null, 'Personne'], [match.club_exterieur, match.exterieur_sigle || 'Extérieur']].map(([club, nom]) => {
            const choisi = (possession?.en_cours ?? null) === club;
            return (
              <Pressable key={nom} onPress={() => ballon(club)} style={[st.res, choisi && st.keyOn]} accessibilityLabel={`Ballon : ${nom}`} accessibilityState={{ selected: choisi }}>
                <Text style={[st.keyTxt, choisi && { color: '#fff', ...F.semi }]} numberOfLines={1}>{nom}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={st.box}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={st.boxT}>1 · TYPE D'ACTION</Text>
          <Text style={[st.boxT, { color: C.dBlue }]} onPress={() => setReglage(!reglage)} accessibilityRole="button">{reglage ? 'TERMINER' : 'PERSONNALISER'}</Text>
        </View>
        {reglage ? <Text style={[st.sansVideoTxt, { marginBottom: 8 }]}>Touchez un bouton pour l'afficher ou le masquer sur cet appareil.</Text> : null}
        <View style={st.grid}>
          {ACTIONS.filter(([cle]) => reglage || !masques.includes(cle)).map(([cle, nom, lettre]) => (
            <Pressable key={cle} onPress={() => (reglage ? basculerAction(cle) : setAction(cle))} accessibilityState={{ selected: action === cle }}
              style={[st.key, !reglage && action === cle && st.keyOn, reglage && masques.includes(cle) && { opacity: 0.35 }]}>
              <Text style={[st.keyTxt, action === cle && { color: '#fff', ...F.semi }]} numberOfLines={1}>{nom}</Text>
              <Text style={st.kbd}>{lettre}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={st.box}>
        <Text style={st.boxT}>2 · JOUEUR</Text>
        <View style={st.equipes}>
          {[match.domicile_nom, match.exterieur_nom].map((nom, i) => (
            <Pressable key={nom} onPress={() => setEquipe(i)} style={[st.equipe, equipe === i && st.equipeOn]}>
              <Text style={[st.keyTxt, equipe === i && { color: '#fff', ...F.semi }]} numberOfLines={1}>{nom}</Text>
            </Pressable>
          ))}
        </View>
        <View style={st.grid}>
          {compositions.map((c) => (
            <Pressable key={c.joueur} onPress={() => setJoueur(c.joueur)} style={[st.puce, joueur === c.joueur && st.keyOn, !c.minutes_jouees && { opacity: 0.45 }]}>
              <Text style={[st.puceTxt, joueur === c.joueur && { color: '#fff', ...F.semi }]} numberOfLines={1}>
                {c.numero_maillot ? <Text style={F.bold}>{c.numero_maillot} </Text> : null}{court(c.joueur_nom)} <Text style={{ color: C.dMuted }}>{c.poste}</Text>
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[st.boxT, { marginTop: 12 }]}>3 · RÉSULTAT</Text>
        <View style={{ flexDirection: 'row', gap: 7 }}>
          <Pressable onPress={() => setReussi(true)} style={[st.res, reussi && st.resOk]}><Text style={[st.keyTxt, reussi && { color: '#fff', ...F.semi }]}>✓ Réussi</Text></Pressable>
          <Pressable onPress={() => setReussi(false)} style={[st.res, !reussi && st.resKo]}><Text style={[st.keyTxt, !reussi && { color: '#fff', ...F.semi }]}>✕ Raté</Text></Pressable>
        </View>

        {avecPartie ? (
          <>
            <Text style={[st.boxT, { marginTop: 12 }]}>PARTIE DU CORPS</Text>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {PARTIES_CORPS.map(([cle, nom]) => (
                <Pressable key={cle} onPress={() => setPartie(partie === cle ? '' : cle)} style={[st.res, partie === cle && st.keyOn]} accessibilityState={{ selected: partie === cle }}>
                  <Text style={[st.keyTxt, partie === cle && { color: '#fff', ...F.semi }]} numberOfLines={1}>{nom}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <View style={st.recap}>
          <Pressable style={st.pasMinute} onPress={() => setDecalage(decalage - 1)} accessibilityLabel="Minute précédente"><Text style={st.ctrlTxt}>−</Text></Pressable>
          <Text style={st.recapTxt}>Minute <Text style={{ color: '#fff', ...F.bold }}>{minute}'</Text></Text>
          <Pressable style={st.pasMinute} onPress={() => setDecalage(decalage + 1)} accessibilityLabel="Minute suivante"><Text style={st.ctrlTxt}>+</Text></Pressable>
          <Text style={[st.recapTxt, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>
            {joueurChoisi ? court(joueurChoisi.joueur_nom) : 'aucun joueur'} · zone {Math.round(zone.x)}/{Math.round(zone.y)}{avecArrivee && arrivee ? ` → ${Math.round(arrivee.x)}/${Math.round(arrivee.y)}` : ''}
          </Text>
        </View>
        <Pressable style={[st.add, envoi && { opacity: 0.6 }]} onPress={ajouter} accessibilityRole="button">
          <Text style={st.addTxt}>Ajouter l'événement{Platform.OS === 'web' ? '  ↵ Entrée' : ''}</Text>
        </Pressable>
      </View>

      <View style={st.box}>
        <Text style={st.boxT}>DERNIERS ÉVÉNEMENTS · {evenements.length}{attente.length ? ` · ${attente.length} EN ATTENTE DU RÉSEAU` : ''}</Text>
        {[...affiches].reverse().slice(0, 12).map((e) => (
          <View key={e.id}>
            <View style={st.log}>
              <Text style={st.logT}>{e.minute}'</Text>
              <View style={[st.dot, { backgroundColor: COULEUR[e.type_action] }]} />
              <Text style={st.logA} numberOfLines={1}>
                <Text style={F.semi}>{NOM[e.type_action]}</Text> · {court(e.joueur_nom)}
                {e.source === 'AI' ? <Text style={{ color: '#f5b942' }}>{e.statut_validation === 'CORRECTED' ? ' · IA corrigée' : ' · IA'}</Text> : null}
              </Text>
              {e.enAttente
                ? <Text style={[st.logR, { color: e.erreur ? '#ff8a98' : '#f5b942' }]}>{e.erreur ? 'Refusé' : 'En attente'}</Text>
                : <Text style={[st.logR, { color: e.resultat ? C.dGreen : '#ff8a98' }]}>{e.resultat ? 'Réussi' : 'Raté'}</Text>}
              <Pressable onPress={() => supprimer(e)} hitSlop={8} accessibilityLabel="Supprimer cet événement"><Text style={st.suppr}>✕</Text></Pressable>
            </View>
            {e.erreur ? <Text style={[st.erreur, { marginLeft: 34, marginBottom: 4 }]}>{e.erreur}</Text> : null}
          </View>
        ))}
        {!affiches.length ? <Text style={st.sansVideoTxt}>Aucun événement codé pour l'instant.</Text> : null}
      </View>
    </View>
  );

  return (
    <View style={st.root}>
      <View style={[st.top, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <Pressable onPress={navigation.goBack} hitSlop={12} accessibilityLabel="Fermer le codage"><Text style={st.back}>‹</Text></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.title} numberOfLines={1}>J{match.journee} · {match.domicile_nom} {match.score_domicile} – {match.score_exterieur} {match.exterieur_nom}</Text>
          <Text style={st.sub}>
            {attente.length ? `${attente.length} en attente du réseau · ` : ''}Sauvegardé {depuis < 5 ? "à l'instant" : `il y a ${depuis} s`} · verrouillé par vous
          </Text>
        </View>
        {large ? <View style={st.lock}><Text style={st.lockTxt}>● En codage · verrouillé</Text></View> : null}
        <Pressable style={[st.validate, envoi && { opacity: 0.6 }]} onPress={envoi ? undefined : valider}><Text style={st.validateTxt}>{large ? 'Valider le codage' : 'Valider'}</Text></Pressable>
      </View>
      {large ? (
        <View style={st.body}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 14 }}>{zoneLecteur}</ScrollView>
          <ScrollView style={st.panel} contentContainerStyle={{ paddingBottom: 14 }}>{panneau}</ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 30 }}>{zoneLecteur}{panneau}</ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.dBg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: C.dCard, borderBottomWidth: 1, borderBottomColor: C.dLine },
  back: { color: '#fff', fontSize: 32, lineHeight: 32, paddingHorizontal: 4 },
  title: { color: '#fff', fontSize: 15, ...F.bold },
  sub: { color: C.dMuted, fontSize: 11.5, marginTop: 1, ...F.regular },
  lock: { backgroundColor: 'rgba(245,165,36,.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  lockTxt: { color: C.dAmber, fontSize: 12, ...F.semi },
  validate: { backgroundColor: C.green, borderRadius: 10, paddingHorizontal: 14, height: 38, justifyContent: 'center' },
  validateTxt: { color: '#fff', fontSize: 13.5, ...F.semi },
  body: { flex: 1, flexDirection: 'row', padding: 14, gap: 14 },
  video: { aspectRatio: 16 / 9, maxHeight: 300, width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  illisible: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: C.dCard },
  sansVideo: { borderRadius: 12, borderWidth: 1, borderColor: C.dLine, backgroundColor: C.dCard, padding: 12 },
  sansVideoTxt: { color: C.dMuted, fontSize: 12.5, ...F.regular },
  terrain: { aspectRatio: 105 / 68, width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#123d22' },
  overlay: { position: 'absolute', left: 10, top: 10, backgroundColor: 'rgba(11,16,32,.8)', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  overlayR: { position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(11,16,32,.8)', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  overTxt: { color: '#fff', fontSize: 11.5, ...F.bold },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  ctrl: { width: 42, height: 36, borderRadius: 8, backgroundColor: '#1a2140', alignItems: 'center', justifyContent: 'center' },
  ctrlTxt: { color: '#fff', fontSize: 12.5, ...F.medium },
  time: { color: '#fff', fontSize: 15, marginHorizontal: 6, ...F.bold },
  track: { flex: 1, minWidth: 80, height: 22, justifyContent: 'center', backgroundColor: 'transparent' },
  trackFill: { height: 6, borderRadius: 4, backgroundColor: C.dBlue, minWidth: 6 },
  speed: { backgroundColor: '#1a2140', borderRadius: 7, paddingHorizontal: 10, height: 34, justifyContent: 'center' },
  timeline: { backgroundColor: C.dCard, borderWidth: 1, borderColor: C.dLine, borderRadius: 12, padding: 12, gap: 4 },
  tlRow: { flexDirection: 'row', alignItems: 'center', height: 22 },
  tlLabel: { width: 122, color: '#c4cbe0', fontSize: 11.5, ...F.regular },
  tlTrack: { flex: 1, height: 20, backgroundColor: C.dField, borderRadius: 6, overflow: 'hidden' },
  mark: { position: 'absolute', top: 4, width: 5, height: 12, borderRadius: 2, opacity: 0.92 },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#ffd84d' },
  panel: { width: 350, flexGrow: 0 },
  box: { backgroundColor: C.dCard, borderWidth: 1, borderColor: C.dLine, borderRadius: 12, padding: 13 },
  boxErreur: { backgroundColor: 'rgba(255,90,110,.12)', borderWidth: 1, borderColor: C.dRed, borderRadius: 12, padding: 12, gap: 4 },
  erreur: { color: '#ffb3bd', fontSize: 13, lineHeight: 18, textAlign: 'left', ...F.medium },
  boxT: { color: C.dMuted, fontSize: 11, letterSpacing: 0.8, marginBottom: 9, ...F.medium },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  key: { flexGrow: 1, flexBasis: '45%', height: 40, borderRadius: 9, borderWidth: 1, borderColor: '#2a3350', backgroundColor: C.dField, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 11 },
  keyOn: { borderColor: C.dBlue, backgroundColor: 'rgba(79,124,255,.25)' },
  keyTxt: { color: '#c4cbe0', fontSize: 13.5, ...F.medium },
  kbd: { color: C.dMuted, fontSize: 10.5, borderWidth: 1, borderColor: '#3a4568', borderRadius: 4, paddingHorizontal: 5, ...F.medium },
  equipes: { flexDirection: 'row', gap: 7, marginBottom: 9 },
  equipe: { flex: 1, height: 36, borderRadius: 9, borderWidth: 1, borderColor: '#2a3350', backgroundColor: C.dField, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  equipeOn: { borderColor: C.dBlue, backgroundColor: 'rgba(79,124,255,.25)' },
  puce: { flexGrow: 1, flexBasis: '45%', height: 36, borderRadius: 9, borderWidth: 1, borderColor: '#2a3350', backgroundColor: C.dField, justifyContent: 'center', paddingHorizontal: 10 },
  puceTxt: { color: '#c4cbe0', fontSize: 12.5, ...F.regular },
  res: { flex: 1, height: 40, borderRadius: 9, borderWidth: 1, borderColor: '#2a3350', backgroundColor: C.dField, alignItems: 'center', justifyContent: 'center' },
  resOk: { borderColor: C.dGreen, backgroundColor: 'rgba(34,195,142,.25)' },
  resKo: { borderColor: C.dRed, backgroundColor: 'rgba(255,90,110,.25)' },
  recap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  recapTxt: { color: C.dMuted, fontSize: 12.5, ...F.regular },
  pasMinute: { width: 32, height: 30, borderRadius: 7, backgroundColor: '#1a2140', alignItems: 'center', justifyContent: 'center' },
  add: { marginTop: 11, height: 46, borderRadius: 10, backgroundColor: C.dBlue, alignItems: 'center', justifyContent: 'center' },
  addTxt: { color: '#fff', fontSize: 14.5, ...F.semi },
  log: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.dLine },
  boxIA: { borderColor: '#f5b942' },
  propositionChoisie: { backgroundColor: 'rgba(245,185,66,.14)' },
  commentaire: { height: 40, borderRadius: 9, borderWidth: 1, borderColor: '#2a3350', backgroundColor: C.dField, color: '#fff', paddingHorizontal: 10, fontSize: 13, marginVertical: 8, ...F.regular },
  logT: { color: C.dMuted, fontSize: 12, width: 30, ...F.regular },
  dot: { width: 8, height: 8, borderRadius: 2 },
  logA: { flex: 1, color: C.dText, fontSize: 12.5, ...F.regular },
  logR: { fontSize: 11.5, ...F.medium },
  suppr: { color: C.dMuted, fontSize: 13, paddingHorizontal: 4 },
});
