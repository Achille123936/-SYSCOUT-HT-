import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import { api } from '../api';
import { C, F } from '../theme';
import { Card, Segmented, Badge, useChargement } from './ui';

const L = 105, H = 68;        // terrain en mètres ; le joueur attaque vers la droite
const COLONNES = 12, RANGS = 8;
const TRAIT = { stroke: '#c9d3e6', strokeWidth: 0.4, fill: 'none' };

export function Lignes({ trait = TRAIT }) {
  return (
    <>
      <Rect x={0.5} y={0.5} width={L - 1} height={H - 1} {...trait} />
      <Line x1={L / 2} y1={0.5} x2={L / 2} y2={H - 0.5} {...trait} />
      <Circle cx={L / 2} cy={H / 2} r={9.15} {...trait} />
      <Rect x={0.5} y={(H - 40.3) / 2} width={16.5} height={40.3} {...trait} />
      <Rect x={L - 17} y={(H - 40.3) / 2} width={16.5} height={40.3} {...trait} />
      <Rect x={0.5} y={(H - 18.3) / 2} width={5.5} height={18.3} {...trait} />
      <Rect x={L - 6} y={(H - 18.3) / 2} width={5.5} height={18.3} {...trait} />
    </>
  );
}

// Zones d'action : le terrain est découpé en cases, plus une case est foncée plus le joueur y agit souvent
function Chaleur({ actions }) {
  const cases = Array.from({ length: COLONNES * RANGS }, () => 0);
  actions.forEach((a) => {
    const c = Math.min(COLONNES - 1, Math.floor((a.zone_x / 100) * COLONNES));
    const r = Math.min(RANGS - 1, Math.floor((a.zone_y / 100) * RANGS));
    cases[r * COLONNES + c] += 1;
  });
  const maximum = Math.max(1, ...cases);
  return cases.map((n, i) => (n ? (
    <Rect key={i} x={(i % COLONNES) * (L / COLONNES)} y={Math.floor(i / COLONNES) * (H / RANGS)} width={L / COLONNES} height={H / RANGS}
      fill={C.blue} fillOpacity={0.1 + 0.75 * (n / maximum)} />
  ) : null));
}

// Carte des tirs : un rond par tir, d'autant plus grand que l'occasion était belle (xG) ; plein = but
function Tirs({ actions }) {
  return actions.filter((a) => a.type_action === 'TIR' || a.type_action === 'BUT').map((a, i) => {
    const but = a.type_action === 'BUT';
    return (
      <Circle key={i} cx={(a.zone_x / 100) * L} cy={(a.zone_y / 100) * H} r={1.2 + 3.2 * (a.valeur_xg || 0.05)}
        fill={but ? C.red : '#ffffff'} fillOpacity={but ? 0.9 : 0.55} stroke={but ? C.red : C.ink2} strokeWidth={0.35} />
    );
  });
}

export default function CarteTerrain({ joueur }) {
  const [vue, setVue] = useState('zones');
  const { donnees } = useChargement(() => api.get(`/joueurs/${joueur}/carte/`), [joueur]);
  if (!donnees || !donnees.actions.length) return null;
  const tirs = donnees.tirs;
  return (
    <Card title={`Sur le terrain · ${donnees.saison}`} badge={<Badge text={`${donnees.actions.length} actions`} tone="b" />}>
      <Segmented options={[['zones', "Zones d'action"], ['tirs', `Tirs (${tirs.nombre})`]]} value={vue} onChange={setVue} />
      <View style={st.terrain}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${L} ${H}`}>
          <Rect width={L} height={H} fill="#f7f9fc" />
          {vue === 'zones' ? <Chaleur actions={donnees.actions} /> : null}
          <Lignes />
          {vue === 'tirs' ? <Tirs actions={donnees.actions} /> : null}
        </Svg>
      </View>
      <Text style={st.legende}>
        {vue === 'zones'
          ? 'Sens de l\'attaque → · plus la case est foncée, plus le joueur y est actif.'
          : `Sens de l'attaque → · ${tirs.buts} but(s) pour ${String(tirs.xg).replace('.', ',')} xG · rond plein = but, taille = qualité de l'occasion.`}
      </Text>
    </Card>
  );
}

const st = StyleSheet.create({
  terrain: { width: '100%', aspectRatio: L / H, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  legende: { fontSize: 11.5, lineHeight: 16, color: C.muted, marginTop: 8, marginBottom: 12, ...F.regular },
});
