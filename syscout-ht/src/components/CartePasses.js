import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import { C, F } from '../theme';
import { Card, Segmented, Badge, useLarge } from './ui';
import { Lignes } from './CarteTerrain';

const L = 105, H = 68; // terrain en mètres ; chaque équipe attaque vers la droite
const REUSSIE = '#1d3fae', RATEE = '#d21034';
const BLANC = { stroke: '#ffffff', strokeWidth: 0.4, strokeOpacity: 0.85, fill: 'none' };

// Un terrain par équipe : chaque passe est un trait du départ à l'arrivée, le rond marque l'arrivée.
// Une passe codée sans point d'arrivée n'apparaît que par un petit rond creux à son départ.
function Terrain({ nom, passes }) {
  const reussies = passes.filter((e) => e.resultat).length;
  const x = (v) => (v / 100) * L, y = (v) => (v / 100) * H;
  // les passes ratées sont dessinées en dernier pour rester lisibles au milieu des passes réussies
  const ordonnees = [...passes].sort((a, b) => Number(b.resultat) - Number(a.resultat));
  return (
    <View style={{ flex: 1 }}>
      <Text style={st.equipe} numberOfLines={1}>{nom}</Text>
      <Text style={st.bilan}>{passes.length ? `${passes.length} · ${Math.round((100 * reussies) / passes.length)} % réussies` : 'Aucune'}</Text>
      <View style={st.terrain}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${L} ${H}`}>
          <Rect width={L} height={H} fill="#a9d68e" />
          <Lignes trait={BLANC} />
          {ordonnees.map((e) => {
            const couleur = e.resultat ? REUSSIE : RATEE;
            if (e.fin_x == null || e.fin_y == null) {
              return <Circle key={e.id} cx={x(e.zone_x)} cy={y(e.zone_y)} r={0.8} fill="none" stroke={couleur} strokeWidth={0.3} />;
            }
            return (
              <React.Fragment key={e.id}>
                <Line x1={x(e.zone_x)} y1={y(e.zone_y)} x2={x(e.fin_x)} y2={y(e.fin_y)} stroke={couleur} strokeWidth={0.3} strokeOpacity={0.75} />
                <Circle cx={x(e.fin_x)} cy={y(e.fin_y)} r={0.75} fill={couleur} />
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    </View>
  );
}

// Carte des passes d'un match : `equipes` = [[club, nom], [club, nom]], `evenements` = les actions codées
export default function CartePasses({ evenements, equipes }) {
  const [type, setType] = useState('PASSE');
  const [resultat, setResultat] = useState(null);
  const large = useLarge();
  const du_type = evenements.filter((e) => e.type_action === type);
  if (!evenements.some((e) => e.type_action === 'PASSE' || e.type_action === 'CENTRE')) return null;
  const visibles = du_type.filter((e) => resultat === null || e.resultat === resultat);
  const sans_arrivee = visibles.filter((e) => e.fin_x == null || e.fin_y == null).length;
  return (
    <Card title="Carte des passes" badge={<Badge text={`${visibles.length} ${type === 'PASSE' ? 'passe(s)' : 'centre(s)'}`} tone="b" />}>
      <Segmented options={[['PASSE', 'Passes'], ['CENTRE', 'Centres']]} value={type} onChange={setType} />
      <Segmented options={[[null, 'Toutes'], [true, 'Réussies'], [false, 'Ratées']]} value={resultat} onChange={setResultat} />
      <View style={large ? st.cote : st.pile}>
        {equipes.map(([club, nom]) => <Terrain key={club} nom={nom} passes={visibles.filter((e) => e.club === club)} />)}
      </View>
      <View style={st.legende}>
        <View style={[st.trait, { backgroundColor: REUSSIE }]} /><Text style={st.legendeTxt}>Réussie</Text>
        <View style={[st.trait, { backgroundColor: RATEE }]} /><Text style={st.legendeTxt}>Ratée</Text>
        <Text style={[st.legendeTxt, { flex: 1 }]}>· Sens de l'attaque → · le rond marque l'arrivée</Text>
      </View>
      {sans_arrivee ? (
        <Text style={st.note}>
          {sans_arrivee} action(s) codée(s) sans point d'arrivée : seul leur départ est indiqué par un rond creux.
        </Text>
      ) : null}
      <View style={{ height: 12 }} />
    </Card>
  );
}

const st = StyleSheet.create({
  cote: { flexDirection: 'row', gap: 12 },
  pile: { gap: 14 },
  equipe: { fontSize: 13.5, color: C.ink, ...F.semi },
  bilan: { fontSize: 11.5, color: C.muted, marginBottom: 6, ...F.regular },
  terrain: { width: '100%', aspectRatio: L / H, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  legende: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  trait: { width: 16, height: 3, borderRadius: 2 },
  legendeTxt: { fontSize: 11.5, lineHeight: 16, color: C.muted, marginRight: 6, ...F.regular },
  note: { fontSize: 11.5, lineHeight: 16, color: C.muted, marginTop: 4, ...F.regular },
});
