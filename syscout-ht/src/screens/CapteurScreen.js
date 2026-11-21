import React, { useEffect, useRef, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { api } from '../api';
import { C, F } from '../theme';
import { chrono } from '../constantes';
import { Ecran, Etat, Card, Info, Select, Button, Alert, Badge, useChargement } from '../components/ui';

// Capteur GPS : ce téléphone, porté par le joueur, enregistre sa position chaque seconde.
// À l'arrêt, la trace est envoyée au serveur, qui en tire distance, sprints et vitesse maximale.
export default function CapteurScreen({ route }) {
  const { id } = route.params;
  const [joueur, setJoueur] = useState(null);
  const [actif, setActif] = useState(false);
  const [nombre, setNombre] = useState(0);
  const [duree, setDuree] = useState(0);
  const [precision, setPrecision] = useState(null);
  const [message, setMessage] = useState(null);
  const [resultat, setResultat] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const points = useRef([]);
  const abonnement = useRef(null);
  const debut = useRef(0);
  const { donnees: m, ...etat } = useChargement(() => api.get(`/matchs/${id}/`), [id]);

  useEffect(() => () => { abonnement.current?.remove(); }, []);
  useEffect(() => {
    if (!actif) return undefined;
    const horloge = setInterval(() => setDuree(Math.round((Date.now() - debut.current) / 1000)), 1000);
    return () => clearInterval(horloge);
  }, [actif]);

  const demarrer = async () => {
    setMessage(null);
    setResultat(null);
    if (!joueur) { setMessage({ ton: 'e', texte: 'Choisissez le joueur qui porte ce téléphone.' }); return; }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setMessage({ ton: 'e', texte: "L'accès à la position a été refusé : autorisez-le dans les réglages du téléphone." }); return; }
      points.current = [];
      debut.current = Date.now();
      setNombre(0);
      setDuree(0);
      abonnement.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (position) => {
          points.current.push({ t: position.timestamp / 1000, lat: position.coords.latitude, lon: position.coords.longitude });
          setNombre(points.current.length);
          setPrecision(position.coords.accuracy);
        },
      );
      setActif(true);
    } catch (e) {
      setMessage({ ton: 'e', texte: `Le GPS n'a pas pu démarrer : ${e.message}` });
    }
  };

  const arreter = async () => {
    abonnement.current?.remove();
    abonnement.current = null;
    setActif(false);
    setEnvoi(true);
    try {
      setResultat(await api.post(`/matchs/${id}/gps/`, { joueur, points: points.current }));
      setMessage({ ton: 's', texte: 'Trace analysée : les données physiques du joueur sont enregistrées.' });
    } catch (e) {
      // la trace reste en mémoire : un nouvel essai est possible sans refaire l'enregistrement
      setMessage({ ton: 'e', texte: `${e.message}\nLa trace (${points.current.length} positions) est conservée : réessayez l'envoi.` });
    } finally { setEnvoi(false); }
  };

  const joueurs = m ? m.compositions.map((c) => [c.joueur, `${c.joueur_nom} · ${c.poste} · ${c.club === m.club_domicile ? m.domicile_sigle : m.exterieur_sigle}`]) : [];
  const km = (v) => `${String(v).replace('.', ',')} km/h`;

  return (
    <Ecran titre="Capteur GPS" sousTitre={m ? `J${m.journee} · ${m.domicile_nom} – ${m.exterieur_nom}` : null}
      droite={actif ? <Badge text="● Enregistrement" tone="r" /> : null}>
      <Etat {...etat} donnees={m} />
      {m ? (
        <>
          <Alert tone="i" text="Ce téléphone sert de capteur : le joueur le porte (brassard ou poche dorsale), écran allumé et application ouverte pendant l'enregistrement." />
          {message ? <Alert tone={message.ton} text={message.texte} /> : null}
          <Card>
            {actif ? <Info libelle="Joueur" valeur={(joueurs.find(([cle]) => cle === joueur) || [])[1]} />
              : <Select label="Joueur qui porte le téléphone" required options={joueurs} value={joueur} onChange={setJoueur} />}
            <View style={st.compteurs}>
              <View style={st.compteur}><Text style={st.valeur}>{chrono(duree)}</Text><Text style={st.libelle}>durée</Text></View>
              <View style={st.compteur}><Text style={st.valeur}>{nombre}</Text><Text style={st.libelle}>positions</Text></View>
              <View style={st.compteur}><Text style={st.valeur}>{precision == null ? '—' : `± ${Math.round(precision)} m`}</Text><Text style={st.libelle}>précision</Text></View>
            </View>
          </Card>
          {actif ? <Button title="Arrêter et analyser" kind="danger" onPress={arreter} />
            : <Button title={points.current.length && !resultat ? "Réessayer l'envoi" : "Démarrer l'enregistrement"} loading={envoi}
              onPress={points.current.length && !resultat && message?.ton === 'e' ? arreter : demarrer} />}

          {resultat ? (
            <Card title="Données physiques calculées" style={{ marginTop: 12 }} badge={<Badge text="GPS" tone="g" />}>
              <Info libelle="Distance parcourue" valeur={`${resultat.distance_m} m`} />
              <Info libelle="Distance à haute intensité" valeur={`${resultat.distance_sprint_m} m`} />
              <Info libelle="Sprints" valeur={resultat.sprints} />
              <Info libelle="Vitesse maximale" valeur={km(resultat.vitesse_max_kmh)} />
              <Info libelle="Seuil de sprint retenu" valeur={km(resultat.seuil_sprint_kmh)} />
              <Info libelle="Allures détectées (marche, course, sprint)" valeur={resultat.allures_kmh.map((a) => String(a).replace('.', ',')).join(' · ')} />
              <Info libelle="Mesures écartées (erreurs du GPS)" valeur={resultat.mesures_ecartees} />
              <View style={{ height: 8 }} />
            </Card>
          ) : null}
        </>
      ) : null}
    </Ecran>
  );
}

const st = StyleSheet.create({
  compteurs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  compteur: { flex: 1, backgroundColor: C.bg, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  valeur: { fontSize: 19, color: C.navy, ...F.bold },
  libelle: { fontSize: 11, color: C.muted, marginTop: 2, ...F.regular },
});
