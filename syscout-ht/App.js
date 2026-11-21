import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AuthProvider, useAuth } from './src/auth';
import { C, F } from './src/theme';
import { ONGLETS_PAR_ROLE } from './src/menu';
import { useLarge } from './src/components/ui';
import MenuLateral from './src/components/MenuLateral';
import LoginScreen from './src/screens/LoginScreen';
import VitrineScreen from './src/screens/VitrineScreen';
import AccueilScreen from './src/screens/AccueilScreen';
import PlusScreen, { MotDePasseScreen, AideScreen } from './src/screens/PlusScreen';
import JoueursScreen from './src/screens/JoueursScreen';
import JoueurDetailScreen, { MaFicheScreen } from './src/screens/JoueurDetailScreen';
import JoueurScreen from './src/screens/JoueurScreen';
import ComparaisonScreen from './src/screens/ComparaisonScreen';
import ClassementsScreen from './src/screens/ClassementsScreen';
import MatchsScreen from './src/screens/MatchsScreen';
import MatchDetailScreen from './src/screens/MatchDetailScreen';
import MatchScreen from './src/screens/MatchScreen';
import CodageScreen from './src/screens/CodageScreen';
import RelectureScreen from './src/screens/RelectureScreen';
import IAScreen from './src/screens/IAScreen';
import { ChampionnatScreen } from './src/screens/ChampionnatScreen';
import { EquipeScreen, AssistantScreen } from './src/screens/EquipeScreens';
import CapteurScreen from './src/screens/CapteurScreen';
import { DirectScreen, PhysiqueScreen } from './src/screens/DirectScreens';
import { RapportsScreen, RapportDetailScreen, RapportFormScreen } from './src/screens/RapportsScreens';
import { ShortlistsScreen, ShortlistDetailScreen } from './src/screens/ShortlistsScreens';
import { ClubsScreen, ClubFormScreen, CompetitionsScreen, CompetitionFormScreen, SaisonFormScreen } from './src/screens/ReferentielScreens';
import { AbonnementsScreen, AbonnementFormScreen, AbonnementDetailScreen } from './src/screens/AbonnementsScreens';
import { UtilisateursScreen, UtilisateurFormScreen, AuditScreen } from './src/screens/AdminScreens';
import PistesIAScreen from './src/screens/PistesIAScreen';
import { CamerasScreen, CameraFormScreen } from './src/screens/CamerasScreens';
import TactiqueScreen from './src/screens/TactiqueScreen';

const Pile = createNativeStackNavigator();
const Onglets = createBottomTabNavigator();
const navigation = createNavigationContainerRef();

// Menu adapté au rôle de l'utilisateur (SEL 2.1) : onglets du bas, le reste dans « Plus »
const ECRANS = {
  Accueil: [AccueilScreen, 'Accueil', '⌂'],
  Joueurs: [JoueursScreen, 'Joueurs', '☺'],
  Matchs: [MatchsScreen, 'Matchs', '◷'],
  Classements: [ClassementsScreen, 'Statistiques', '▦'],
  Rapports: [RapportsScreen, 'Rapports', '✎'],
  Clubs: [ClubsScreen, 'Clubs', '⚑'],
  Abonnements: [AbonnementsScreen, 'Abonnements', '▤'],
  Equipe: [EquipeScreen, 'Équipe', '⚽'],
  Membres: [UtilisateursScreen, 'Membres', '☷'],
  MaFiche: [MaFicheScreen, 'Ma fiche', '☺'],
  Plus: [PlusScreen, 'Plus', '☰'],
};
function MenuPrincipal() {
  const { role } = useAuth();
  const large = useLarge();
  return (
    <Onglets.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.blue,
        tabBarInactiveTintColor: '#9ca3af',
        tabBarLabelStyle: { fontSize: 10.5, ...F.medium },
        tabBarStyle: large ? { display: 'none' } : { borderTopColor: C.line },
      }}
    >
      {ONGLETS_PAR_ROLE[role].map((nom) => {
        const [composant, titre, icone] = ECRANS[nom];
        return (
          <Onglets.Screen key={nom} name={nom} component={composant}
            options={{ title: titre, tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>{icone}</Text> }} />
        );
      })}
    </Onglets.Navigator>
  );
}

// Avant la connexion : la page d'accueil publique, puis l'écran de connexion ou d'inscription.
// Une session fermée (inactivité) ramène directement à la connexion, où le motif est affiché.
function Public() {
  const { message } = useAuth();
  const [ecran, setEcran] = React.useState(message ? 'connexion' : 'accueil');
  if (ecran === 'accueil') return <VitrineScreen surConnexion={() => setEcran('connexion')} surInscription={() => setEcran('inscription')} />;
  return <LoginScreen key={ecran} ongletInitial={ecran} surRetour={() => setEcran('accueil')} />;
}

function Navigation() {
  const { utilisateur, pret } = useAuth();
  const large = useLarge();
  const [actif, setActif] = React.useState('Accueil');
  if (!pret) {
    return <View style={{ flex: 1, backgroundColor: C.navy, justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>;
  }
  if (!utilisateur) return <Public />;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.navy }}>
      {large ? <MenuLateral navigation={navigation} actif={actif} /> : null}
      <View style={{ flex: 1 }}>
    <NavigationContainer ref={navigation} documentTitle={{ formatter: () => 'SYSCOUT-HT' }}
      onStateChange={() => setActif(navigation.getCurrentRoute()?.name)}>
      <Pile.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Pile.Screen name="Menu" component={MenuPrincipal} />
        {/* les mêmes listes restent accessibles depuis « Plus » quand elles ne sont pas en onglet */}
        <Pile.Screen name="Joueurs" component={JoueursScreen} />
        <Pile.Screen name="Matchs" component={MatchsScreen} />
        <Pile.Screen name="Classements" component={ClassementsScreen} />
        <Pile.Screen name="Rapports" component={RapportsScreen} />
        <Pile.Screen name="Clubs" component={ClubsScreen} />
        <Pile.Screen name="Abonnements" component={AbonnementsScreen} />
        <Pile.Screen name="Shortlists" component={ShortlistsScreen} />
        <Pile.Screen name="Competitions" component={CompetitionsScreen} />
        <Pile.Screen name="Utilisateurs" component={UtilisateursScreen} />
        <Pile.Screen name="Audit" component={AuditScreen} />
        <Pile.Screen name="Membres" component={UtilisateursScreen} />
        <Pile.Screen name="MaFiche" component={MaFicheScreen} />
        <Pile.Screen name="Cameras" component={CamerasScreen} />
        <Pile.Screen name="CameraForm" component={CameraFormScreen} />
        <Pile.Screen name="MotDePasse" component={MotDePasseScreen} />
        <Pile.Screen name="Aide" component={AideScreen} />
        <Pile.Screen name="JoueurDetail" component={JoueurDetailScreen} />
        <Pile.Screen name="JoueurForm" component={JoueurScreen} />
        <Pile.Screen name="Comparaison" component={ComparaisonScreen} />
        <Pile.Screen name="MatchDetail" component={MatchDetailScreen} />
        <Pile.Screen name="MatchForm" component={MatchScreen} />
        <Pile.Screen name="Codage" component={CodageScreen} options={{ gestureEnabled: false }} />
        <Pile.Screen name="Apprentissage" component={IAScreen} />
        <Pile.Screen name="Direct" component={DirectScreen} />
        <Pile.Screen name="PistesIA" component={PistesIAScreen} />
        <Pile.Screen name="Tactique" component={TactiqueScreen} />
        <Pile.Screen name="Physique" component={PhysiqueScreen} />
        <Pile.Screen name="Capteur" component={CapteurScreen} />
        <Pile.Screen name="Equipe" component={EquipeScreen} />
        <Pile.Screen name="Assistant" component={AssistantScreen} />
        <Pile.Screen name="Championnat" component={ChampionnatScreen} />
        <Pile.Screen name="Relecture" component={RelectureScreen} />
        <Pile.Screen name="RapportDetail" component={RapportDetailScreen} />
        <Pile.Screen name="RapportForm" component={RapportFormScreen} />
        <Pile.Screen name="ShortlistDetail" component={ShortlistDetailScreen} />
        <Pile.Screen name="ClubForm" component={ClubFormScreen} />
        <Pile.Screen name="CompetitionForm" component={CompetitionFormScreen} />
        <Pile.Screen name="SaisonForm" component={SaisonFormScreen} />
        <Pile.Screen name="AbonnementForm" component={AbonnementFormScreen} />
        <Pile.Screen name="AbonnementDetail" component={AbonnementDetailScreen} />
        <Pile.Screen name="UtilisateurForm" component={UtilisateurFormScreen} />
      </Pile.Navigator>
    </NavigationContainer>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <Navigation />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
