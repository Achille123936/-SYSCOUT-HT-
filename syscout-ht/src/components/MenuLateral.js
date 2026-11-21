import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import { MENU, ONGLETS_PAR_ROLE } from '../menu';
import { confirmer } from './ui';

export const LARGEUR_MENU = 232;
const TITRES = {
  Accueil: 'Tableau de bord', Joueurs: 'Joueurs', Matchs: 'Matchs', Classements: 'Statistiques', Rapports: 'Rapports', Clubs: 'Clubs',
  Abonnements: 'Abonnements', Equipe: 'Mon équipe', Membres: 'Membres du club', MaFiche: 'Ma fiche',
};
const GESTION = ['Abonnements', 'Utilisateurs', 'Audit', 'Membres'];

// Menu latéral permanent des écrans larges (SEL 2.1 et 3.5) : tablette en paysage, ordinateur.
// Sur téléphone, les mêmes entrées sont dans les onglets du bas et dans « Plus ».
export default function MenuLateral({ navigation, actif }) {
  const { utilisateur, role, deconnexion } = useAuth();
  const insets = useSafeAreaInsets();
  const onglets = ONGLETS_PAR_ROLE[role].filter((nom) => nom !== 'Plus');
  const entrees = [
    ...onglets.map((nom) => [nom, TITRES[nom], true]),
    ...MENU.filter(([ecran, , , roles]) => roles.includes(role) && !onglets.includes(ecran)).map(([ecran, titre]) => [ecran, titre.replace('Administration › ', ''), false]),
  ];
  const aller = (ecran, onglet) => (onglet ? navigation.navigate('Menu', { screen: ecran }) : navigation.navigate(ecran));
  const quitter = async () => {
    if (await confirmer('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?')) deconnexion();
  };
  const ligne = ([ecran, titre, onglet]) => (
    <Pressable key={ecran} onPress={() => aller(ecran, onglet)} style={[st.entree, actif === ecran && st.active]} accessibilityRole="link" accessibilityState={{ selected: actif === ecran }}>
      <View style={[st.puce, actif === ecran && { backgroundColor: C.red, borderColor: C.red }]} />
      <Text style={[st.titre, actif === ecran && { color: '#fff', ...F.semi }]} numberOfLines={1}>{titre}</Text>
    </Pressable>
  );

  return (
    <View style={[st.menu, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={st.marque}>
        <View style={st.logo}>
          <View style={[st.moitie, { left: 0, backgroundColor: C.blue }]} />
          <View style={[st.moitie, { right: 0, backgroundColor: C.red }]} />
          <Text style={st.logoTxt}>SH</Text>
        </View>
        <View>
          <Text style={st.nom}>SYSCOUT-HT</Text>
          <Text style={st.sous}>Ayiti Data Foot</Text>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }}>
        <Text style={st.section}>SPORTIF</Text>
        {entrees.filter(([ecran]) => !GESTION.includes(ecran)).map(ligne)}
        {entrees.some(([ecran]) => GESTION.includes(ecran)) ? <Text style={st.section}>GESTION</Text> : null}
        {entrees.filter(([ecran]) => GESTION.includes(ecran)).map(ligne)}
        <Text style={st.section}>COMPTE</Text>
        {[['Aide', 'Aide · Èd', false], ['MotDePasse', 'Mot de passe', false]].map(ligne)}
      </ScrollView>
      <View style={st.pied}>
        <Text style={st.utilisateur} numberOfLines={1}>{utilisateur.nom_complet}</Text>
        <Text style={st.role} numberOfLines={1}>{utilisateur.role_libelle}</Text>
        <Pressable onPress={quitter} style={st.quitter} accessibilityRole="button"><Text style={st.quitterTxt}>Déconnexion</Text></Pressable>
        <Text style={st.credit}>Réalisé par Smartgen</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  menu: { width: LARGEUR_MENU, backgroundColor: C.navy, paddingHorizontal: 12, paddingBottom: 14 },
  marque: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, marginBottom: 18 },
  logo: { width: 34, height: 34, borderRadius: 9, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  moitie: { position: 'absolute', top: 0, bottom: 0, width: 17 },
  logoTxt: { color: '#fff', fontSize: 12, ...F.bold },
  nom: { color: '#fff', fontSize: 15, ...F.bold },
  sous: { color: '#9fb0dd', fontSize: 11, ...F.regular },
  section: { color: '#6f82b8', fontSize: 10, letterSpacing: 1, marginTop: 14, marginBottom: 6, paddingHorizontal: 8, ...F.semi },
  entree: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 38, paddingHorizontal: 8, borderRadius: 8 },
  active: { backgroundColor: 'rgba(255,255,255,.10)' },
  puce: { width: 14, height: 14, borderRadius: 4, borderWidth: 1.5, borderColor: '#5b6ea3' },
  titre: { flex: 1, color: '#c9d4f2', fontSize: 13.5, ...F.medium },
  pied: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.12)', paddingTop: 12, paddingHorizontal: 6 },
  utilisateur: { color: '#fff', fontSize: 13, ...F.semi },
  role: { color: '#9fb0dd', fontSize: 11.5, marginBottom: 10, ...F.regular },
  quitter: { height: 36, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,.25)', alignItems: 'center', justifyContent: 'center' },
  quitterTxt: { color: '#fff', fontSize: 13, ...F.semi },
  credit: { color: '#6f82b8', fontSize: 10.5, textAlign: 'center', marginTop: 10, ...F.medium },
});
