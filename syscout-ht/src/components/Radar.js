import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText } from 'react-native-svg';
import { C, F } from '../theme';
import { AXES_RADAR } from '../constantes';

const CX = 170, CY = 150, R = 105;
const pt = (i, v) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / AXES_RADAR.length;
  return [CX + (R * v / 100) * Math.cos(a), CY + (R * v / 100) * Math.sin(a)];
};
const poly = (vals) => vals.map((v, i) => pt(i, v).join(',')).join(' ');

// CU09 — radar des centiles (rang parmi les joueurs du même poste, RG5). series = [{ nom, couleur, centiles }]
export default function Radar({ series }) {
  const traces = series.filter((serie) => serie.centiles && Object.keys(serie.centiles).length);
  if (!traces.length) {
    return <Text style={st.vide}>Pas de radar : moins de 450 minutes jouées cette saison (RG5).</Text>;
  }
  return (
    <View>
      <Svg width="100%" height="300" viewBox="-30 0 400 300">
        {[25, 50, 75, 100].map((l) => <Polygon key={l} points={poly(AXES_RADAR.map(() => l))} fill="none" stroke={C.line} />)}
        {AXES_RADAR.map((_, i) => { const [x, y] = pt(i, 100); return <Line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke={C.line} />; })}
        {[...traces].reverse().map((serie) => {
          const vals = AXES_RADAR.map(([cle]) => serie.centiles[cle] ?? 0);
          return (
            <React.Fragment key={serie.nom}>
              <Polygon points={poly(vals)} fill={serie.couleur} fillOpacity="0.16" stroke={serie.couleur} strokeWidth="2" />
              {vals.map((v, i) => { const [x, y] = pt(i, v); return <Circle key={i} cx={x} cy={y} r="3" fill={serie.couleur} />; })}
            </React.Fragment>
          );
        })}
        {AXES_RADAR.map(([cle, nom], i) => {
          const [x, y] = pt(i, 122);
          const anchor = Math.abs(x - CX) < 8 ? 'middle' : x > CX ? 'start' : 'end';
          return <SvgText key={cle} x={x} y={y + 4} fontSize="11" fill={C.ink2} textAnchor={anchor} fontWeight="500" fontFamily="sans-serif">{nom}</SvgText>;
        })}
      </Svg>
      <View style={st.legend}>
        {traces.map((serie) => (
          <Text key={serie.nom} style={st.lg}><Text style={{ color: serie.couleur }}>■</Text> {serie.nom}</Text>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 18, marginTop: -6, marginBottom: 10 },
  lg: { fontSize: 12.5, color: C.ink2, ...F.medium },
  vide: { textAlign: 'center', color: C.muted, fontSize: 13, marginVertical: 20, ...F.regular },
});
