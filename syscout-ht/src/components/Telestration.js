import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, PanResponder, StyleSheet } from 'react-native';
import Svg, { Line, Ellipse, Circle, Polyline, Polygon, Path, Rect, Text as SvgText } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F } from '../theme';

export const OUTILS = [['FLECHE', 'Flèche'], ['COURBE', 'Flèche courbe'], ['MESURE', 'Distance'], ['CERCLE', 'Cercle'],
  ['TRAIT', 'Trait'], ['TEXTE', 'Texte'], ['ZONE', 'Zone'], ['OVALE', 'Zone ovale'], ['LIGNE', 'Ligne'], ['SPOT', 'Projecteur'],
  ['CHAINE', 'Liaison joueurs'], ['POLY', 'Triangle'], ['JOUEUR', 'Étiquette joueur']];
export const COULEURS = ['#ffd84d', '#ff5a6e', '#4f7cff', '#22c38e', '#ffffff'];
export const DUREES = [3, 5, 10];
// rectangle connu que l'analyste désigne sur l'image pour convertir les positions en mètres
export const REFERENCES = [['TERRAIN', 'Terrain entier'], ['MOITIE', 'Moitié de terrain'], ['SURFACE', 'Surface de réparation']];
export const COINS = ['haut gauche', 'haut droit', 'bas droit', 'bas gauche'];
// formes dont chaque segment affiche sa longueur en mètres quand l'image est calibrée sur le terrain
export const MESUREES = ['MESURE', 'CHAINE', 'POLY'];
// formes posées point par point (un toucher par joueur), avec leur nombre minimal de points ; 12 au plus
const MULTI = { CHAINE: 2, POLY: 3 };
const UNITES = [['kmh', 'km/h'], ['mph', 'mph']];
const SOMBRE = '#0b1020';

const metres = (m) => `${Math.round(m)} m`;
export const vitesse = (kmh, unite) => `${(unite === 'mph' ? kmh * 0.621371 : kmh).toFixed(1).replace('.', ',')} ${unite === 'mph' ? 'mph' : 'km/h'}`;

// unité des vitesses affichées sur la vidéo, retenue sur l'appareil
export function useUniteVitesse() {
  const [unite, setUnite] = useState('kmh');
  useEffect(() => {
    AsyncStorage.getItem('syscout.unite.vitesse').then((v) => v === 'mph' && setUnite('mph')).catch(() => {});
  }, []);
  const changer = (u) => { setUnite(u); AsyncStorage.setItem('syscout.unite.vitesse', u).catch(() => {}); };
  return [unite, changer];
}

function Pastille({ x, y, texte, clair }) {
  const largeur = texte.length * 6.6 + 14;
  return (
    <>
      <Rect x={x - largeur / 2} y={y - 10} width={largeur} height={20} rx={10} fill={clair ? '#ffffff' : SOMBRE} fillOpacity={0.94} />
      <SvgText x={x} y={y + 4} fontSize="11.5" fontWeight="700" textAnchor="middle" fill={clair ? SOMBRE : '#ffffff'}>{texte}</SvgText>
    </>
  );
}

function Pointe({ x, y, angle, couleur, taille = 16, opacite = 1 }) {
  const coin = (ecart) => `${x - taille * Math.cos(angle + ecart)},${y - taille * Math.sin(angle + ecart)}`;
  return <Polygon points={`${x},${y} ${coin(0.5)} ${coin(-0.5)}`} fill={couleur} fillOpacity={opacite} />;
}

function Forme({ a, w, h, unite }) {
  const pts = a.points.map(([x, y]) => [(x * w) / 100, (y * h) / 100]);
  const mesures = a.mesures || [];
  if (a.forme === 'TEXTE') {
    if (!pts.length || !a.texte) return null;
    return (
      <SvgText x={pts[0][0]} y={pts[0][1]} fontSize="17" fontWeight="700" textAnchor="middle" fill={a.couleur}
        stroke="#0b1020" strokeWidth="0.8">{a.texte}</SvgText>
    );
  }
  // étiquette joueur : numéro et nom sur fond sombre, vitesse en dessous quand elle est connue
  if (a.forme === 'JOUEUR') {
    if (!pts.length || !a.texte) return null;
    const [x, y] = pts[0];
    const allure = mesures[0] != null ? vitesse(mesures[0], unite) : null;
    const largeur = Math.max(a.texte.length, allure ? allure.length : 0) * 7 + 18;
    return (
      <>
        <Rect x={x - largeur / 2} y={y} width={largeur} height={22} rx={3} fill={SOMBRE} fillOpacity={0.92} stroke={a.couleur} strokeWidth={1.5} />
        <SvgText x={x} y={y + 15.5} fontSize="12" fontWeight="700" textAnchor="middle" fill="#ffffff">{a.texte}</SvgText>
        {allure ? (
          <>
            <Rect x={x - largeur / 2} y={y + 24} width={largeur} height={20} rx={3} fill="#ffffff" fillOpacity={0.95} />
            <SvgText x={x} y={y + 38} fontSize="12" fontWeight="700" textAnchor="middle" fill={SOMBRE}>{allure}</SvgText>
          </>
        ) : null}
      </>
    );
  }
  const trait = { stroke: a.couleur, strokeWidth: 3.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
  // liaison : un anneau sous chaque joueur, reliés dans l'ordre des touchers (ligne défensive, bloc équipe) ;
  // triangle ou forme : surface teintée entre les joueurs. Chaque côté porte sa longueur si l'image est calibrée.
  if (a.forme === 'CHAINE' || a.forme === 'POLY') {
    if (!pts.length) return null;
    const ferme = a.forme === 'POLY';
    const segments = pts.slice(1).map((p, i) => [pts[i], p]);
    if (ferme && pts.length > 2) segments.push([pts[pts.length - 1], pts[0]]);
    return (
      <>
        {ferme && pts.length > 2 ? <Polygon points={pts.map((p) => p.join(',')).join(' ')} fill={a.couleur} fillOpacity={0.16} /> : null}
        {segments.map(([p, q], i) => <Line key={`s${i}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} {...trait} strokeWidth={ferme ? 3 : 4} />)}
        {pts.map(([x, y], i) => (ferme
          ? <Circle key={`p${i}`} cx={x} cy={y} r={4.5} fill={a.couleur} />
          : <Ellipse key={`p${i}`} cx={x} cy={y} rx={17} ry={8} {...trait} strokeWidth={3} />))}
        {segments.map(([p, q], i) => (mesures[i] != null
          ? <Pastille key={`m${i}`} x={(p[0] + q[0]) / 2} y={(p[1] + q[1]) / 2} texte={metres(mesures[i])} clair={ferme} /> : null))}
      </>
    );
  }
  if (pts.length < 2) return null;
  if (a.forme === 'TRAIT') return <Polyline points={pts.map((p) => p.join(',')).join(' ')} {...trait} />;
  // flèche courbe : course ou passe en profondeur ; la courbe passe par le milieu du geste
  if (a.forme === 'COURBE') {
    const [d, m, f] = [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]];
    const c = pts.length < 3 ? [(d[0] + f[0]) / 2, (d[1] + f[1]) / 2] : [2 * m[0] - (d[0] + f[0]) / 2, 2 * m[1] - (d[1] + f[1]) / 2];
    const angle = Math.atan2(f[1] - c[1], f[0] - c[0]);
    const base = [f[0] - 14 * Math.cos(angle), f[1] - 14 * Math.sin(angle)]; // le trait s'arrête à la base de la pointe
    return (
      <>
        <Path d={`M${d[0]},${d[1]} Q${c[0]},${c[1]} ${base[0]},${base[1]}`} {...trait} strokeWidth={8} strokeOpacity={0.8} />
        <Pointe x={f[0]} y={f[1]} angle={angle} couleur={a.couleur} taille={24} opacite={0.9} />
      </>
    );
  }
  const [[x1, y1], [x2, y2]] = pts;
  // zone : rectangle teinté (espace libre, bloc équipe) ; ligne : ligne défensive ou de hors-jeu ;
  // projecteur : halo qui met un joueur en évidence
  if (a.forme === 'ZONE') {
    return <Rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} {...trait} strokeWidth={2} fill={a.couleur} fillOpacity={0.22} />;
  }
  // zone ovale : espace à attaquer ou à fermer, assombri sur la pelouse
  if (a.forme === 'OVALE') {
    return <Ellipse cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={Math.abs(x2 - x1) / 2} ry={Math.abs(y2 - y1) / 2} {...trait} strokeWidth={2} fill={SOMBRE} fillOpacity={0.42} />;
  }
  if (a.forme === 'LIGNE') return <Line x1={x1} y1={y1} x2={x2} y2={y2} {...trait} strokeWidth={4} strokeDasharray="10 7" />;
  if (a.forme === 'SPOT') {
    const rayon = Math.max(14, Math.hypot(x2 - x1, y2 - y1));
    return (
      <>
        <Ellipse cx={x1} cy={y1} rx={rayon * 1.5} ry={rayon * 0.9} fill={a.couleur} fillOpacity={0.14} />
        <Ellipse cx={x1} cy={y1} rx={rayon} ry={rayon * 0.6} fill={a.couleur} fillOpacity={0.3} stroke={a.couleur} strokeWidth={2.5} />
      </>
    );
  }
  if (a.forme === 'CERCLE') return <Ellipse cx={x1} cy={y1} rx={Math.hypot(x2 - x1, y2 - y1)} ry={Math.hypot(x2 - x1, y2 - y1) * 0.6} {...trait} />;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  // distance : flèche en pointillés qui porte sa longueur
  if (a.forme === 'MESURE') {
    return (
      <>
        <Line x1={x1} y1={y1} x2={x2 - 12 * Math.cos(angle)} y2={y2 - 12 * Math.sin(angle)} {...trait} strokeWidth={5} strokeLinecap="butt" strokeDasharray="12 8" />
        <Pointe x={x2} y={y2} angle={angle} couleur={a.couleur} taille={20} />
        {mesures[0] != null ? <Pastille x={(x1 + x2) / 2} y={(y1 + y2) / 2} texte={metres(mesures[0])} clair /> : null}
      </>
    );
  }
  // flèche : le trait, puis les deux branches de la pointe
  const branche = (ecart) => [x2 - 14 * Math.cos(angle + ecart), y2 - 14 * Math.sin(angle + ecart)];
  const [g, d] = [branche(0.45), branche(-0.45)];
  return (
    <>
      <Line x1={x1} y1={y1} x2={x2} y2={y2} {...trait} />
      <Line x1={x2} y1={y2} x2={g[0]} y2={g[1]} {...trait} />
      <Line x1={x2} y1={y2} x2={d[0]} y2={d[1]} {...trait} />
    </>
  );
}

// Télestration : couche de dessin posée sur l'image de la vidéo. Les dessins sont en % de l'image,
// donc ils retombent au même endroit quelle que soit la taille de l'écran.
// outil « CALIBRAGE » : chaque toucher désigne un coin (surPoint) ; outil « SUIVI » : le doigt suit un joueur
// pendant que la vidéo joue, chaque position étant datée par l'horloge de la vidéo (horloge()).
// Liaison et triangle se posent un toucher par joueur, puis se valident ou s'abandonnent avec les boutons flottants.
export function CoucheDessin({ annotations, actif, outil, couleur, texte, surDessin, surPoint, horloge, unite }) {
  const [taille, setTaille] = useState({ w: 1, h: 1 });
  const [brouillon, setBrouillon] = useState(null);
  const etat = useRef({});
  etat.current = { taille, outil, couleur, texte, surDessin, surPoint, horloge, brouillon };
  useEffect(() => { setBrouillon(null); }, [outil, actif]);

  const gestes = useMemo(() => {
    const point = (e) => {
      const { w, h } = etat.current.taille;
      const borne = (v) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
      return [borne((100 * e.nativeEvent.locationX) / w), borne((100 * e.nativeEvent.locationY) / h)];
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const p = point(e);
        const { outil: forme, couleur: teinte, texte: mots } = etat.current;
        if (forme === 'CALIBRAGE') { etat.current.surPoint(p); return; }
        if (forme === 'SUIVI') {
          setBrouillon({ forme: 'TRAIT', suivi: true, couleur: teinte, points: [p, p], temps: [etat.current.horloge(), etat.current.horloge()] });
          return;
        }
        if (MULTI[forme]) { // chaque toucher ajoute un joueur à la forme en cours
          setBrouillon((b) => (b && b.multi && b.forme === forme
            ? (b.points.length < 12 ? { ...b, points: [...b.points, p] } : b)
            : { forme, multi: true, couleur: teinte, points: [p] }));
          return;
        }
        // un texte suit le doigt jusqu'au lâcher ; les autres formes s'étirent depuis le point de départ
        setBrouillon(forme === 'TEXTE' || forme === 'JOUEUR' ? { forme, couleur: teinte, points: [p], texte: (mots || '').trim() } : { forme, couleur: teinte, points: [p, p] });
      },
      onPanResponderMove: (e) => {
        const p = point(e);
        setBrouillon((b) => {
          if (!b) return b;
          if (b.forme === 'TEXTE' || b.forme === 'JOUEUR') return { ...b, points: [p] };
          if (b.multi) return { ...b, points: [...b.points.slice(0, -1), p] }; // le dernier point posé s'ajuste
          if (b.suivi) return { ...b, points: [...b.points, p], temps: [...b.temps, etat.current.horloge()] };
          if (b.forme !== 'TRAIT' && b.forme !== 'COURBE') return { ...b, points: [b.points[0], p] };
          return b.points.length < 400 ? { ...b, points: [...b.points, p] } : b;
        });
      },
      onPanResponderRelease: () => {
        const b = etat.current.brouillon;
        if (b && b.multi) return; // la forme reste ouverte jusqu'à sa validation
        setBrouillon(null);
        if (!b) return;
        if (b.forme === 'TEXTE' || b.forme === 'JOUEUR') { etat.current.surDessin(b); return; }
        if (b.suivi) {
          etat.current.surDessin({ forme: 'SUIVI', couleur: b.couleur, points: b.points.map(([x, y], i) => ({ t: b.temps[i], x, y })) });
          return;
        }
        const [debut, fin] = [b.points[0], b.points[b.points.length - 1]];
        // un simple toucher sans déplacement ne crée pas de dessin
        if (b.forme !== 'TRAIT' && Math.hypot(fin[0] - debut[0], fin[1] - debut[1]) < 2) return;
        // la courbe ne garde que trois points : départ, milieu du geste, arrivée
        etat.current.surDessin(b.forme === 'COURBE' ? { ...b, points: [debut, b.points[Math.floor(b.points.length / 2)], fin] } : b);
      },
      onPanResponderTerminate: () => setBrouillon((b) => (b && b.multi ? b : null)),
    });
  }, []);

  const ouverte = actif && brouillon && brouillon.multi ? brouillon : null;
  const complete = ouverte && ouverte.points.length >= MULTI[ouverte.forme];
  const dernier = ouverte ? ouverte.points[ouverte.points.length - 1] : null;
  const valider = () => {
    if (!complete) return;
    setBrouillon(null);
    surDessin({ forme: ouverte.forme, couleur: ouverte.couleur, points: ouverte.points });
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={actif ? 'auto' : 'none'}
      onLayout={(e) => setTaille({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      {...(actif ? gestes.panHandlers : {})} accessibilityLabel="Zone de dessin sur la vidéo">
      <Svg width={taille.w} height={taille.h} pointerEvents="none">
        {annotations.map((a) => <Forme key={a.id} a={a} w={taille.w} h={taille.h} unite={unite} />)}
        {brouillon ? <Forme a={brouillon} w={taille.w} h={taille.h} unite={unite} /> : null}
      </Svg>
      {ouverte ? (
        <View style={[st.flottant, {
          left: Math.max(4, Math.min(taille.w - 78, (dernier[0] * taille.w) / 100 + 16)),
          top: Math.max(4, Math.min(taille.h - 36, (dernier[1] * taille.h) / 100 + 14)),
        }]}>
          <Pressable onPress={valider} style={[st.rond, { backgroundColor: C.dGreen }, !complete && { opacity: 0.4 }]}
            accessibilityLabel="Valider la forme" accessibilityState={{ disabled: !complete }}>
            <Text style={st.rondTxt}>✓</Text>
          </Pressable>
          <Pressable onPress={() => setBrouillon(null)} style={[st.rond, { backgroundColor: C.dRed }]} accessibilityLabel="Abandonner la forme">
            <Text style={st.rondTxt}>✕</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function BarreDessin({ actif, surBascule, outil, surOutil, couleur, surCouleur, duree, surDuree, texte, surTexte, visibles, surEffacer, suivi, unite, surUnite }) {
  const choix = (selectionne) => [st.bouton, selectionne && st.actif];
  const libelle = (selectionne) => [st.texte, selectionne && { color: '#fff', ...F.semi }];
  const mesure = MESUREES.includes(outil);
  const consigne = () => {
    if (suivi.enCalibrage) return `Calibrage ${suivi.coins.length}/4 : touchez sur l'image le coin ${COINS[suivi.coins.length]} de la zone choisie.`;
    if (mesure) {
      const geste = MULTI[outil] ? `Touchez chaque joueur l'un après l'autre (${MULTI[outil]} au moins), puis validez avec ✓. ` : '';
      return geste + (suivi.coins.length === 4
        ? 'Image calibrée : les distances s\'affichent en mètres. Recalibrez si la caméra a bougé.'
        : 'Sans calibrage, le dessin s\'enregistre sans distance.');
    }
    return suivi.joueur
      ? `Lancez la vidéo, posez le doigt sur ${suivi.joueur} et suivez-le. Relâchez pour mesurer.`
      : 'Choisissez le joueur à suivre dans le panneau « 2 · JOUEUR ».';
  };
  return (
    <View style={st.barre}>
      <Pressable onPress={surBascule} style={choix(actif)} accessibilityState={{ selected: actif }}>
        <Text style={libelle(actif)}>✎ Dessiner</Text>
      </Pressable>
      {actif ? (
        <>
          {[...OUTILS, ['SUIVI', 'Suivi joueur']].map(([cle, nom]) => (
            <Pressable key={cle} onPress={() => surOutil(cle)} style={choix(outil === cle)} accessibilityState={{ selected: outil === cle }}>
              <Text style={libelle(outil === cle)}>{nom}</Text>
            </Pressable>
          ))}
          {COULEURS.map((c) => (
            <Pressable key={c} onPress={() => surCouleur(c)} accessibilityLabel={`Couleur ${c}`}
              style={[st.pastille, { backgroundColor: c }, couleur === c && st.pastilleOn]} />
          ))}
          {DUREES.map((d) => (
            <Pressable key={d} onPress={() => surDuree(d)} style={choix(duree === d)} accessibilityLabel={`Afficher ${d} secondes`} accessibilityState={{ selected: duree === d }}>
              <Text style={libelle(duree === d)}>{d} s</Text>
            </Pressable>
          ))}
          {visibles.length ? (
            <Pressable onPress={surEffacer} style={st.bouton}><Text style={st.texte}>Effacer le dernier ({visibles.length})</Text></Pressable>
          ) : null}
          {(outil === 'SUIVI' || mesure) && suivi ? (
            <View style={st.suivi}>
              <View style={st.barre}>
                {REFERENCES.map(([cle, nom]) => (
                  <Pressable key={cle} onPress={() => suivi.surReference(cle)} style={choix(suivi.reference === cle)} accessibilityState={{ selected: suivi.reference === cle }}>
                    <Text style={libelle(suivi.reference === cle)}>{nom}</Text>
                  </Pressable>
                ))}
                {suivi.coins.length ? <Pressable onPress={suivi.surRecalibrer} style={st.bouton}><Text style={st.texte}>Recalibrer</Text></Pressable> : null}
                {mesure && !suivi.coins.length && !suivi.enCalibrage ? (
                  <Pressable onPress={suivi.surRecalibrer} style={st.bouton}><Text style={st.texte}>Calibrer pour mesurer en mètres</Text></Pressable>
                ) : null}
              </View>
              <Text style={st.consigne}>{consigne()}</Text>
              {outil === 'SUIVI' && suivi.resultat ? (
                <Text style={st.resultat}>
                  {suivi.resultat.joueur_nom} · {suivi.resultat.sequence.distance_m} m · max {vitesse(suivi.resultat.sequence.vitesse_max_kmh, unite)} · {suivi.resultat.sequence.sprints} sprint(s)
                  {'\n'}Cumul suivi : {Math.round(suivi.resultat.cumul.distance_m)} m en {suivi.resultat.cumul.secondes_suivies} s{suivi.resultat.enregistre ? '' : ' (relevé GPS ou manuel conservé)'}
                </Text>
              ) : null}
            </View>
          ) : null}
          {outil === 'JOUEUR' && suivi ? (
            <Text style={[st.consigne, { flexBasis: '100%' }]}>
              {suivi.joueur
                ? `Touchez l'image pour poser l'étiquette de ${suivi.joueur}. Sa vitesse s'affiche s'il vient d'être suivi avec « Suivi joueur ».`
                : 'Choisissez le joueur dans le panneau « 2 · JOUEUR », puis touchez l\'image.'}
            </Text>
          ) : null}
          {(outil === 'JOUEUR' || outil === 'SUIVI') && surUnite ? UNITES.map(([cle, nom]) => (
            <Pressable key={cle} onPress={() => surUnite(cle)} style={choix(unite === cle)} accessibilityLabel={`Vitesses en ${nom}`} accessibilityState={{ selected: unite === cle }}>
              <Text style={libelle(unite === cle)}>{nom}</Text>
            </Pressable>
          )) : null}
          {outil === 'TEXTE' ? (
            <TextInput style={st.saisie} value={texte} onChangeText={surTexte} maxLength={60} placeholder="Texte à poser, puis touchez l'image"
              placeholderTextColor={C.dMuted} accessibilityLabel="Texte à poser sur la vidéo" />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  barre: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  bouton: { height: 34, paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#1a2140', borderWidth: 1, borderColor: '#2a3350', justifyContent: 'center' },
  actif: { borderColor: C.dBlue, backgroundColor: 'rgba(79,124,255,.3)' },
  texte: { color: '#c4cbe0', fontSize: 12.5, ...F.medium },
  suivi: { flexBasis: '100%', gap: 6 },
  consigne: { color: '#ffd84d', fontSize: 12.5, lineHeight: 17, ...F.medium },
  resultat: { color: '#22c38e', fontSize: 12.5, lineHeight: 18, ...F.semi },
  pastille: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  pastilleOn: { borderColor: '#fff' },
  saisie: { flexGrow: 1, flexBasis: '100%', height: 38, borderRadius: 8, borderWidth: 1, borderColor: '#2a3350', backgroundColor: C.dField, color: '#fff', paddingHorizontal: 11, fontSize: 13.5, outlineStyle: 'none' },
  flottant: { position: 'absolute', flexDirection: 'row', gap: 6 },
  rond: { width: 34, height: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rondTxt: { color: '#fff', fontSize: 15, ...F.bold },
});
