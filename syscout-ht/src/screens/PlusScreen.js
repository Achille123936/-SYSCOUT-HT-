import React, { useState } from 'react';
import { Text } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { MENU, ONGLETS_PAR_ROLE } from '../menu';
import { Ecran, Ligne, Card, Info, Field, Button, Alert, Avatar, Segmented, confirmer, informer, useFormulaire, s } from '../components/ui';
import { AIDE, LANGUES } from '../aide';

// Suite du menu (les options commencent par une majuscule, SEL 3.5) et déconnexion
export default function PlusScreen({ navigation }) {
  const { utilisateur, role, deconnexion } = useAuth();
  const entrees = MENU.filter(([ecran, , , roles]) => roles.includes(role) && !ONGLETS_PAR_ROLE[role].includes(ecran));
  const quitter = async () => {
    if (await confirmer('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?')) deconnexion();
  };
  return (
    <Ecran titre="Plus" sousTitre={utilisateur.nom_complet}>
      <Card>
        <Ligne titre={utilisateur.nom_complet} sousTitre={`${utilisateur.role_libelle} · ${utilisateur.nom_utilisateur}`}
          gauche={<Avatar nom={utilisateur.nom_complet} />} style={{ borderWidth: 0, padding: 0, marginBottom: 10 }} />
        {utilisateur.club_nom ? <Info libelle="Club" valeur={utilisateur.club_nom} /> : null}
        <Info libelle="Courriel" valeur={utilisateur.courriel} />
      </Card>
      {entrees.map(([ecran, titre, description]) => (
        <Ligne key={ecran} titre={titre} sousTitre={description} onPress={() => navigation.navigate(ecran)} />
      ))}
      <Ligne titre="Aide · Èd" sousTitre="Mode d'emploi en français et en créole" onPress={() => navigation.navigate('Aide')} />
      <Ligne titre="Mot de passe" sousTitre="Changer mon mot de passe" onPress={() => navigation.navigate('MotDePasse')} />
      <Button title="Déconnexion" kind="secondary" style={{ marginTop: 8 }} onPress={quitter} />
    </Ecran>
  );
}

export function MotDePasseScreen({ navigation }) {
  const { rafraichir } = useAuth();
  const f = useFormulaire({ ancien: '', nouveau: '', confirmation: '' });
  const enregistrer = () => f.soumettre(async () => {
    if (f.valeurs.nouveau !== f.valeurs.confirmation) {
      f.setErreurs({ confirmation: 'Les deux saisies ne sont pas identiques.' });
      return;
    }
    await api.post('/auth/mot-de-passe/', { ancien: f.valeurs.ancien, nouveau: f.valeurs.nouveau });
    await rafraichir();
    informer('Mot de passe modifié');
    navigation.goBack();
  });
  return (
    <Ecran titre="Mot de passe" sousTitre="Au moins 8 caractères, lettres et chiffres">
      <Card>
        <Alert tone="e" text={f.message} />
        <Field label="Mot de passe actuel" required secure autoCapitalize="none" {...f.lier('ancien')} />
        <Field label="Nouveau mot de passe" required secure autoCapitalize="none" {...f.lier('nouveau')} />
        <Field label="Confirmer le nouveau mot de passe" required secure autoCapitalize="none" {...f.lier('confirmation')} />
      </Card>
      <Button title="Enregistrer" onPress={enregistrer} loading={f.envoi} />
      <Button title="Annuler" kind="secondary" style={{ marginTop: 10 }} onPress={navigation.goBack} />
    </Ecran>
  );
}

// Aide en ligne (SEL 3.6.9), en français et en créole haïtien (SEL 3.5), limitée aux écrans du rôle connecté
export function AideScreen() {
  const { role } = useAuth();
  const [langue, setLangue] = useState('fr');
  return (
    <Ecran titre={langue === 'fr' ? 'Aide' : 'Èd'} sousTitre={langue === 'fr' ? "Mode d'emploi de SYSCOUT-HT" : 'Kijan pou sèvi ak SYSCOUT-HT'}>
      <Segmented options={LANGUES} value={langue} onChange={setLangue} />
      {AIDE[langue].filter(([, , roles]) => !roles || roles.includes(role)).map(([titre, texte]) => (
        <Card key={titre} title={titre}>
          <Text style={[s.alertTxt, { fontSize: 13.5, lineHeight: 20, marginBottom: 12 }]}>{texte}</Text>
        </Card>
      ))}
    </Ecran>
  );
}
