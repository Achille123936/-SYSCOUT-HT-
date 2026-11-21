import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, Pressable, Image, StyleSheet, ScrollView, Modal, FlatList, ActivityIndicator, Platform,
  Alert as AlerteNative, KeyboardAvoidingView, useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import { initiales } from '../constantes';

// ---------------------------------------------------------------- Boîtes de dialogue (SEL 2.1)
// confirmation (« Voulez-vous vraiment… ? Oui / Non »), avertissement et message de succès
export function confirmer(titre, message) {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${titre}\n\n${message || ''}`));
  return new Promise((resoudre) => {
    AlerteNative.alert(titre, message, [
      { text: 'Non', style: 'cancel', onPress: () => resoudre(false) },
      { text: 'Oui', onPress: () => resoudre(true) },
    ], { cancelable: true, onDismiss: () => resoudre(false) });
  });
}

export function informer(titre, message) {
  if (Platform.OS === 'web') window.alert(message ? `${titre}\n\n${message}` : titre);
  else AlerteNative.alert(titre, message);
}

// ---------------------------------------------------------------- Écrans larges (SEL 3.5 : 13 pouces et tablette)
export const SEUIL_LARGE = 900;
export const useLarge = () => useWindowDimensions().width >= SEUIL_LARGE;

// Sur écran large, les blocs se rangent en deux colonnes ; sur téléphone, ils restent l'un sous l'autre.
export function Colonnes({ children }) {
  const large = useLarge();
  const blocs = React.Children.toArray(children);
  if (!large) return <>{blocs}</>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, alignItems: 'flex-start' }}>
      {blocs.map((bloc) => <View key={bloc.key} style={{ flexGrow: 1, flexBasis: '46%', minWidth: 340 }}>{bloc}</View>)}
    </View>
  );
}

// Liste en deux colonnes sur écran large : <FlatList {...useListeColonnes()} /> et chaque élément dans <Cellule>
export function useListeColonnes() {
  const large = useLarge();
  return large ? { numColumns: 2, key: 'deux', columnWrapperStyle: { gap: 10 } } : { numColumns: 1, key: 'une' };
}
export function Cellule({ children }) {
  const large = useLarge();
  return large ? <View style={{ flex: 1 }}>{children}</View> : children;
}

// ---------------------------------------------------------------- Chargement des données
// Recharge à chaque retour sur l'écran : une liste reflète toujours ce qui vient d'être enregistré.
export function useChargement(charger, dependances = []) {
  const [etat, setEtat] = useState({ donnees: null, erreur: null, enCours: true });
  const recharger = useCallback(async () => {
    setEtat((e) => ({ ...e, enCours: true, erreur: null }));
    try {
      setEtat({ donnees: await charger(), erreur: null, enCours: false });
    } catch (e) {
      setEtat((precedent) => ({ donnees: precedent.donnees, erreur: e.message, enCours: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependances);
  useFocusEffect(useCallback(() => { recharger(); }, [recharger]));
  return { ...etat, recharger };
}

// État d'un formulaire : valeurs, erreurs par champ renvoyées par le serveur, envoi en cours
export function useFormulaire(initial) {
  const [valeurs, setValeurs] = useState(initial);
  const [erreurs, setErreurs] = useState({});
  const [message, setMessage] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const changer = (champ) => (valeur) => {
    setValeurs((v) => ({ ...v, [champ]: valeur }));
    setErreurs((e) => (e[champ] ? { ...e, [champ]: undefined } : e));
  };
  // champ lié : <Field {...lier('nom')} />
  const lier = (champ) => ({
    value: valeurs[champ], onChangeText: changer(champ),
    state: erreurs[champ] ? 'error' : undefined, hint: erreurs[champ] || undefined,
  });
  const soumettre = async (action) => {
    setEnvoi(true);
    setMessage(null);
    setErreurs({});
    try {
      return await action();
    } catch (e) {
      setErreurs(e.champs || {});
      setMessage(e.message);
      return undefined;
    } finally {
      setEnvoi(false);
    }
  };
  return { valeurs, setValeurs, erreurs, setErreurs, message, setMessage, envoi, changer, lier, soumettre };
}

// ---------------------------------------------------------------- Structure d'écran
export function AppHeader({ title, subtitle, back, right, onBack }) {
  const insets = useSafeAreaInsets();
  const large = useLarge();
  return (
    <View style={[s.header, { paddingTop: Math.max(insets.top, 14) + 10 }]}>
      <View style={s.headerRow}>
        {back ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Retour"><Text style={s.back}>‹</Text></Pressable>
        ) : large ? null : (
          <View style={s.logo}>
            <View style={[s.logoHalf, { left: 0, backgroundColor: C.blue }]} />
            <View style={[s.logoHalf, { right: 0, backgroundColor: C.red }]} />
            <Text style={s.logoTxt}>SH</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.hTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={s.hSub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

// Charte commune (SEL 3.5) : en-tête, contenu défilant, largeur limitée sur tablette et ordinateur
export function Ecran({ titre, sousTitre, droite, children, defilant = true, pied }) {
  const navigation = useNavigation();
  const pile = navigation.getState()?.type === 'stack';
  const large = useLarge();
  const contenu = <View style={[s.contenu, large && { maxWidth: 1180 }]}>{children}</View>;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader title={titre} subtitle={sousTitre} right={droite} back={pile && navigation.canGoBack()} onBack={navigation.goBack} />
      {defilant ? <ScrollView contentContainerStyle={{ padding: large ? 22 : 14 }} keyboardShouldPersistTaps="handled">{contenu}</ScrollView>
        : <View style={{ flex: 1, padding: large ? 22 : 14, paddingBottom: 0 }}>{contenu}</View>}
      {pied}
    </KeyboardAvoidingView>
  );
}

export function BoutonEntete({ titre, onPress }) {
  return <Pressable onPress={onPress} style={s.hBtn} hitSlop={6}><Text style={s.hBtnTxt}>{titre}</Text></Pressable>;
}

// Chargement, erreur ou liste vide
export function Etat({ enCours, erreur, vide, recharger, donnees }) {
  if (erreur) {
    return (
      <View style={{ marginBottom: 12 }}>
        <Alert tone="e" text={erreur} />
        {recharger ? <Button title="Réessayer" kind="secondary" onPress={recharger} /> : null}
      </View>
    );
  }
  if (enCours && !donnees) return <ActivityIndicator color={C.blue} style={{ marginVertical: 30 }} />;
  if (vide) return <Text style={s.vide}>{vide}</Text>;
  return null;
}

// ---------------------------------------------------------------- Composants de base
export function Card({ title, step, badge, children, style }) {
  return (
    <View style={[s.card, style]}>
      {title ? (
        <View style={s.cardHead}>
          {step ? <View style={s.step}><Text style={s.stepTxt}>{step}</Text></View> : null}
          <Text style={s.cardTitle}>{title}</Text>
          {badge}
        </View>
      ) : null}
      <View style={s.cardBody}>{children}</View>
    </View>
  );
}

export function Field({ label, required, value, placeholder, state, hint, right, style, onChangeText, secure, keyboardType, multiline, editable = true, autoCapitalize, onSubmitEditing }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      {label ? <Text style={s.label}>{label}{required ? <Text style={{ color: C.red }}> *</Text> : null}</Text> : null}
      <View style={[s.input, multiline && s.multi, focus && s.focus, state === 'error' && s.error, !editable && s.inactif]}>
        <TextInput
          style={[s.inputTxt, multiline && { height: 84, paddingVertical: 10, textAlignVertical: 'top' }]}
          value={value == null ? '' : String(value)}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          editable={editable}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          multiline={multiline}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={label || placeholder}
        />
        {right}
      </View>
      {hint ? <Text style={[s.hint, state === 'error' && { color: C.red }]}>{hint}</Text> : null}
    </View>
  );
}

// Liste de choix : options = [[valeur, libellé], …]
export function Select({ label, required, value, options, onChange, placeholder = 'Choisir…', state, hint, style, vide, sombre }) {
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState('');
  const choisi = options.find(([v]) => v === value);
  const visibles = filtre ? options.filter(([, l]) => l.toLowerCase().includes(filtre.toLowerCase())) : options;
  const fermer = () => { setOuvert(false); setFiltre(''); };
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      {label ? <Text style={[s.label, sombre && { color: C.dMuted }]}>{label}{required ? <Text style={{ color: C.red }}> *</Text> : null}</Text> : null}
      <Pressable onPress={() => setOuvert(true)} accessibilityLabel={label} accessibilityRole="button"
        style={[s.input, sombre && s.inputSombre, state === 'error' && s.error]}>
        <Text style={[s.inputTxt, sombre && { color: '#fff' }, !choisi && { color: '#9ca3af' }]} numberOfLines={1}>{choisi ? choisi[1] : placeholder}</Text>
        <Text style={s.chev}>▾</Text>
      </Pressable>
      {hint ? <Text style={[s.hint, state === 'error' && { color: C.red }]}>{hint}</Text> : null}
      <Modal visible={ouvert} transparent animationType="fade" onRequestClose={fermer}>
        <Pressable style={s.voile} onPress={fermer}>
          <Pressable style={s.feuille} onPress={() => {}}>
            <Text style={s.feuilleTitre}>{label || placeholder}</Text>
            {options.length > 8 ? <Field placeholder="Rechercher…" value={filtre} onChangeText={setFiltre} style={{ marginBottom: 6 }} /> : null}
            <FlatList
              data={visibles}
              keyExtractor={([v]) => String(v)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={s.vide}>{vide || 'Aucun choix disponible.'}</Text>}
              renderItem={({ item: [v, l] }) => (
                <Pressable style={[s.option, v === value && { backgroundColor: C.blue50 }]} onPress={() => { onChange(v); fermer(); }}>
                  <Text style={[s.optionTxt, v === value && { color: C.blue, ...F.semi }]}>{l}</Text>
                </Pressable>
              )}
            />
            {value != null && value !== '' && !required ? <Button title="Effacer le choix" kind="secondary" style={{ marginTop: 8, height: 40 }} onPress={() => { onChange(null); fermer(); }} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Choix exclusif : options = [[valeur, libellé], …]
export function Segmented({ label, options, value, onChange, style }) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.seg}>
        {options.map(([v, l], i) => (
          <Pressable key={String(v)} onPress={() => onChange(v)} accessibilityRole="button" accessibilityState={{ selected: v === value }}
            style={[s.segItem, v === value && s.segOn, i < options.length - 1 && s.segSep]}>
            <Text style={[s.segTxt, v === value && { color: C.blue, ...F.semi }]} numberOfLines={1}>{l}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Button({ title, kind = 'primary', style, onPress, loading, disabled }) {
  const st = { primary: s.btnP, success: s.btnG, danger: s.btnD, secondary: s.btnS }[kind];
  const couleur = kind === 'secondary' ? C.ink2 : '#fff';
  const inactif = disabled || loading;
  return (
    <Pressable onPress={inactif ? undefined : onPress} accessibilityRole="button" accessibilityState={{ disabled: !!inactif }}
      style={({ pressed }) => [s.btn, st, style, (inactif || pressed) && { opacity: 0.6 }]}>
      {loading ? <ActivityIndicator color={couleur} /> : <Text style={[s.btnTxt, { color: couleur }]} numberOfLines={1}>{title}</Text>}
    </Pressable>
  );
}

export function Badge({ text, tone = 'n', style }) {
  const t = { g: [C.green50, C.green], b: [C.blue50, C.blue], r: [C.red50, C.red], a: [C.amber50, C.amber], n: ['#f3f4f6', C.ink2] }[tone];
  return (
    <View style={[s.badge, { backgroundColor: t[0] }, style]}>
      <Text style={[s.badgeTxt, { color: t[1] }]}>{text}</Text>
    </View>
  );
}

export function Check({ on, onPress, label }) {
  const case_ = <View style={[s.cb, on && s.cbOn]}>{on ? <Text style={s.cbTick}>✓</Text> : null}</View>;
  if (!onPress) return case_;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: !!on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {case_}{label ? <Text style={s.optionTxt}>{label}</Text> : null}
    </Pressable>
  );
}

// tone : w = avertissement, i = information, e = erreur, s = succès
export function Alert({ text, tone = 'w' }) {
  if (!text) return null;
  const t = {
    w: [C.amber50, '#f5d9a6', '#7a4a00'], i: [C.blue50, C.blue100, '#1d3a8a'],
    e: [C.red50, '#f5b8c3', '#8a0f26'], s: [C.green50, '#b7e4d0', '#0b5a40'],
  }[tone];
  return (
    <View style={[s.alert, { backgroundColor: t[0], borderColor: t[1] }]}>
      <Text style={[s.alertTxt, { color: t[2] }]}>{text}</Text>
    </View>
  );
}

export function Avatar({ nom, couleur = C.blue, taille = 44, photo }) {
  if (photo) {
    return <Image source={{ uri: photo }} accessibilityLabel={nom} style={{ width: taille, height: taille, borderRadius: taille / 2, backgroundColor: C.line }} />;
  }
  return (
    <View style={{ width: taille, height: taille, borderRadius: taille / 2, backgroundColor: `${couleur}1f`, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: couleur, fontSize: taille * 0.34, ...F.bold }}>{initiales(nom)}</Text>
    </View>
  );
}

// Ligne de liste cliquable
export function Ligne({ titre, sousTitre, gauche, droite, onPress, style }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.ligne, pressed && { backgroundColor: '#f8fafc' }, style]}>
      {gauche}
      <View style={{ flex: 1 }}>
        <Text style={s.ligneT} numberOfLines={1}>{titre}</Text>
        {sousTitre ? <Text style={s.ligneS} numberOfLines={2}>{sousTitre}</Text> : null}
      </View>
      {droite}
      {onPress ? <Text style={s.fleche}>›</Text> : null}
    </Pressable>
  );
}

// Paire libellé / valeur d'une fiche
export function Info({ libelle, valeur }) {
  return (
    <View style={s.info}>
      <Text style={s.infoL}>{libelle}</Text>
      {React.isValidElement(valeur) ? valeur
        : <Text style={s.infoV}>{valeur === null || valeur === undefined || valeur === '' ? '—' : valeur}</Text>}
    </View>
  );
}

export const Rangee = ({ children, style }) => <View style={[{ flexDirection: 'row', gap: 10 }, style]}>{children}</View>;

export const s = StyleSheet.create({
  header: { backgroundColor: C.navy, paddingBottom: 14, paddingHorizontal: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 38 },
  logo: { width: 34, height: 34, borderRadius: 9, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logoHalf: { position: 'absolute', top: 0, bottom: 0, width: 17 },
  logoTxt: { color: '#fff', fontSize: 12, ...F.bold },
  back: { color: '#fff', fontSize: 34, lineHeight: 34, ...F.regular, marginRight: 2, paddingHorizontal: 4 },
  hTitle: { color: '#fff', fontSize: 18, ...F.bold },
  hSub: { color: '#9fb0dd', fontSize: 12, marginTop: 2, ...F.regular },
  hBtn: { backgroundColor: 'rgba(255,255,255,.14)', borderRadius: 9, paddingHorizontal: 12, height: 34, justifyContent: 'center' },
  hBtnTxt: { color: '#fff', fontSize: 13, ...F.semi },
  contenu: { width: '100%', maxWidth: 760, alignSelf: 'center', flex: 1 },
  vide: { textAlign: 'center', color: C.muted, fontSize: 13.5, marginVertical: 26, ...F.regular },
  card: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  cardTitle: { fontSize: 14, color: C.ink, ...F.semi, flex: 1 },
  cardBody: { padding: 14, paddingBottom: 4 },
  step: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { color: C.blue, fontSize: 11, ...F.semi },
  label: { fontSize: 12, color: C.ink2, marginBottom: 6, ...F.semi },
  input: { height: 44, borderWidth: 1, borderColor: C.line2, borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  inputSombre: { backgroundColor: C.dField, borderColor: '#2a3350' },
  multi: { height: 'auto', alignItems: 'flex-start' },
  inactif: { backgroundColor: '#f3f4f6' },
  inputTxt: { flex: 1, fontSize: 14, color: C.ink, ...F.regular, outlineStyle: 'none', minWidth: 0 },
  focus: { borderColor: C.blue, borderWidth: 1.5 },
  error: { borderColor: C.red, borderWidth: 1.5 },
  chev: { color: C.muted, fontSize: 14, marginLeft: 6 },
  hint: { fontSize: 11.5, color: C.muted, marginTop: 5, ...F.regular },
  voile: { flex: 1, backgroundColor: 'rgba(11,31,77,.45)', justifyContent: 'center', padding: 20 },
  feuille: { backgroundColor: '#fff', borderRadius: 16, padding: 16, maxHeight: '80%', width: '100%', maxWidth: 460, alignSelf: 'center' },
  feuilleTitre: { fontSize: 15, color: C.ink, marginBottom: 10, ...F.bold },
  option: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  optionTxt: { fontSize: 14, color: C.ink, ...F.regular },
  seg: { flexDirection: 'row', height: 44, borderWidth: 1, borderColor: C.line2, borderRadius: 10, overflow: 'hidden' },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', paddingHorizontal: 4 },
  segSep: { borderRightWidth: 1, borderRightColor: C.line2 },
  segOn: { backgroundColor: C.blue50 },
  segTxt: { fontSize: 13, color: C.ink2, ...F.medium },
  btn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnP: { backgroundColor: C.blue },
  btnG: { backgroundColor: C.green },
  btnD: { backgroundColor: C.red },
  btnS: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line2 },
  btnTxt: { fontSize: 15, ...F.semi },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeTxt: { fontSize: 11, ...F.semi },
  cb: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  cbOn: { backgroundColor: C.blue, borderColor: C.blue },
  cbTick: { color: '#fff', fontSize: 12, ...F.bold },
  alert: { borderWidth: 1, borderRadius: 10, padding: 11, marginBottom: 12 },
  alertTxt: { fontSize: 12.5, lineHeight: 18, ...F.regular },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 8 },
  ligneT: { fontSize: 14.5, color: C.ink, ...F.semi },
  ligneS: { fontSize: 12, color: C.muted, marginTop: 2, ...F.regular },
  fleche: { color: '#9ca3af', fontSize: 22, marginLeft: -4 },
  info: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f1f3' },
  infoL: { fontSize: 13, color: C.muted, ...F.regular },
  infoV: { fontSize: 13, color: C.ink, flexShrink: 1, textAlign: 'right', ...F.medium },
});
