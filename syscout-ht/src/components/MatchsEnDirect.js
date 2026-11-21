import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { api } from '../api';
import { C, F } from '../theme';

const RAFRAICHIR_MS = 15000;

// Matchs codés en ce moment : score et minute seulement (liste publique, sans compte). `surOuvrir(match)` ouvre le suivi
// détaillé pour un compte connecté ; sans lui, la ligne n'est pas cliquable. `sombre` : version de la page d'accueil.
export default function MatchsEnDirect({ surOuvrir, sombre = false, texteVide = 'Aucun match en direct pour le moment.' }) {
  const [matchs, setMatchs] = useState(null);
  const charger = useCallback(() => api.get('/matchs-en-direct/').then(setMatchs).catch(() => setMatchs((m) => m || [])), []);
  useEffect(() => {
    charger();
    const minuteur = setInterval(charger, RAFRAICHIR_MS);
    return () => clearInterval(minuteur);
  }, [charger]);

  const t = sombre ? { texte: '#fff', sous: 'rgba(255,255,255,.62)', fond: 'rgba(255,255,255,.06)', trait: 'rgba(255,255,255,.14)' }
    : { texte: C.ink, sous: C.muted, fond: '#fff', trait: C.line };
  if (matchs === null) return null;
  if (!matchs.length) return <Text style={[st.vide, { color: t.sous }]}>{texteVide}</Text>;

  return (
    <View style={st.liste}>
      {matchs.map((m) => (
        <Pressable key={m.id} disabled={!surOuvrir} onPress={() => surOuvrir(m)} accessibilityRole={surOuvrir ? 'button' : 'text'}
          style={[st.carte, { backgroundColor: t.fond, borderColor: t.trait }, sombre && st.carteSombre]}>
          <View style={st.entete}>
            <View style={st.direct}><View style={st.point} /><Text style={st.directTxt}>EN DIRECT · {m.minute}'</Text></View>
            <Text style={[st.sous, { color: t.sous }]} numberOfLines={1}>{m.competition} · J{m.journee}{m.stade ? ` · ${m.stade}` : ''}</Text>
          </View>
          <View style={st.rang}>
            <Text style={[st.equipe, { color: t.texte, textAlign: 'right' }]} numberOfLines={1}>{m.domicile.nom}</Text>
            <Text style={[st.score, { color: t.texte }]}>{m.score[0]} – {m.score[1]}</Text>
            <Text style={[st.equipe, { color: t.texte }]} numberOfLines={1}>{m.exterieur.nom}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  liste: { gap: 10 },
  vide: { fontSize: 13.5, lineHeight: 20, ...F.regular },
  carte: { borderWidth: 1, borderRadius: 14, padding: 14 },
  carteSombre: { minWidth: 280 },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  direct: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  point: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red },
  directTxt: { fontSize: 11.5, letterSpacing: 0.6, color: C.red, ...F.bold },
  sous: { flexShrink: 1, fontSize: 12, ...F.regular },
  rang: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  equipe: { flex: 1, fontSize: 15, ...F.semi },
  score: { fontSize: 22, ...F.bold },
});
