import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { api } from '../api';
import { C, F } from '../theme';
import { Lignes } from '../components/CarteTerrain';
import { Ecran, Etat, Card, Segmented, Button, Badge, Alert, Ligne, useChargement } from '../components/ui';

const L = 105, H = 68;

// Heatmap des pistes de l'IA (FR-055) : données non vérifiées, toujours présentées avec leurs limites
function Chaleur({ h }) {
  return h.grille.flatMap((rang, r) => rang.map((n, c) => (n ? (
    <Rect key={`${r}-${c}`} x={c * (L / h.colonnes)} y={r * (H / h.lignes)} width={L / h.colonnes} height={H / h.lignes}
      fill={C.orange || C.amber} fillOpacity={0.12 + 0.75 * (n / h.maximum)} />
  ) : null)));
}

// Pistes de suivi de l'IA d'un match : voir leur zone d'activité et relier une piste à un joueur (FR-052, FR-055)
export default function PistesIAScreen({ route }) {
  const { id } = route.params;
  const [piste, setPiste] = useState(null);
  const [message, setMessage] = useState(null);
  const match = useChargement(() => api.get(`/matchs/${id}/`), [id]);
  const pistes = useChargement(async () => {
    const points = await api.get('/pistes-ia/', { match: id });
    const parPiste = {};
    (Array.isArray(points) ? points : points.results).forEach((p) => {
      const e = (parPiste[p.piste] = parPiste[p.piste] || { piste: p.piste, joueur: p.joueur, points: 0 });
      e.points += 1;
    });
    return Object.values(parPiste);
  }, [id]);
  const carte = useChargement(() => api.get('/pistes-ia/heatmap/', { match: id, ...(piste ? { piste } : {}) }), [id, piste]);
  const m = match.donnees;
  const nomJoueur = (j) => { const c = m && m.compositions.find((x) => x.joueur === j); return c ? (c.joueur_nom || `Joueur ${j}`) : null; };

  const identifier = async (joueur) => {
    setMessage(null);
    try {
      await api.post('/pistes-ia/identifier/', { match: Number(id), piste, joueur });
      pistes.recharger(); carte.recharger();
    } catch (e) { setMessage(e.message); }
  };
  const choisie = piste && (pistes.donnees || []).find((p) => p.piste === piste);

  return (
    <Ecran titre="Pistes de l'IA" sousTitre={m ? `${m.domicile.nom} – ${m.exterieur.nom}` : null}>
      <Etat {...pistes} recharger={pistes.recharger} donnees={pistes.donnees}
        vide={pistes.donnees && !pistes.donnees.length ? "Le moteur IA n'a envoyé aucune piste pour ce match." : null} />
      {pistes.donnees && pistes.donnees.length ? (
        <>
          <Alert tone="w" text="Données du moteur IA, non vérifiées : elles ne comptent dans aucune statistique officielle." />
          <Card title="Zones d'activité" badge={<Badge text={carte.donnees ? `${carte.donnees.points} points` : '…'} tone="a" />}>
            <Segmented options={[[null, 'Toutes les pistes'], ...pistes.donnees.map((p) => [p.piste, p.piste])]} value={piste} onChange={setPiste} />
            <View style={st.terrain}>
              <Svg width="100%" height="100%" viewBox={`0 0 ${L} ${H}`}>
                <Rect width={L} height={H} fill="#f7f9fc" />
                {carte.donnees && carte.donnees.points ? <Chaleur h={carte.donnees} /> : null}
                <Lignes />
              </Svg>
            </View>
            {carte.donnees ? carte.donnees.avertissements.slice(1).map((a) => <Alert key={a} tone="w" text={a} />) : null}
          </Card>
          <Card title="Pistes">
            {pistes.donnees.map((p) => (
              <Ligne key={p.piste} titre={`Piste ${p.piste}`} sousTitre={`${p.points} points`}
                droite={<Badge text={p.joueur ? (nomJoueur(p.joueur) || 'Identifiée') : 'Non identifiée'} tone={p.joueur ? 'g' : 'a'} />}
                onPress={() => setPiste(p.piste)} />
            ))}
          </Card>
          {choisie && m ? (
            <Card title={`Relier la piste ${choisie.piste} à un joueur`}>
              <Alert tone="i" text="Une piste n'est pas un joueur : seul l'analyste fait le lien." />
              {message ? <Alert text={message} /> : null}
              {m.compositions.map((c) => (
                <Ligne key={c.joueur} titre={c.joueur_nom || `Joueur ${c.joueur}`} sousTitre={c.numero_maillot ? `n° ${c.numero_maillot}` : null}
                  droite={choisie.joueur === c.joueur ? <Badge text="Lié" tone="g" /> : null} onPress={() => identifier(c.joueur)} />
              ))}
              {choisie.joueur ? <Button title="Détacher la piste" kind="secondary" onPress={() => identifier(null)} /> : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </Ecran>
  );
}

const st = StyleSheet.create({
  terrain: { width: '100%', aspectRatio: L / H, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.line, marginBottom: 8 },
});
