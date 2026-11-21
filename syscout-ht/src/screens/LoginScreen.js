import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { C, F } from '../theme';
import { useAuth } from '../auth';
import { SERVEUR } from '../config';
import { api } from '../api';
import { Field, Button, Check, Alert, Rangee, informer, useFormulaire } from '../components/ui';
import { LANGUES, SECURITE } from '../aide';

// CU01 — S'authentifier
export default function LoginScreen({ ongletInitial = 'connexion', surRetour }) {
  const { connexion, message } = useAuth();
  const [nom, setNom] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [afficher, setAfficher] = useState(false);
  const [seSouvenir, setSeSouvenir] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [langue, setLangue] = useState('fr');
  const [onglet, setOnglet] = useState(ongletInitial);
  const [succes, setSucces] = useState(null);
  const f = useFormulaire({ nom: '', prenom: '', courriel: '', telephone: '', nom_utilisateur: '', mot_de_passe: '', confirmation: '' });

  // Demande d'inscription : le compte reste en attente jusqu'à ce que l'administrateur l'active et lui donne un rôle
  const inscrire = () => f.soumettre(async () => {
    const v = f.valeurs;
    const erreurs = {};
    ['nom', 'prenom', 'courriel', 'nom_utilisateur', 'mot_de_passe'].forEach((champ) => { if (!v[champ].trim()) erreurs[champ] = 'Champ obligatoire'; });
    if (v.mot_de_passe && v.mot_de_passe !== v.confirmation) erreurs.confirmation = 'Les deux saisies ne sont pas identiques.';
    if (Object.keys(erreurs).length) { f.setErreurs(erreurs); f.setMessage('Complétez les champs signalés en rouge.'); return; }
    const reponse = await api.post('/auth/inscription/', {
      nom: v.nom.trim(), prenom: v.prenom.trim(), courriel: v.courriel.trim(), telephone: v.telephone.trim(),
      nom_utilisateur: v.nom_utilisateur.trim(), mot_de_passe: v.mot_de_passe,
    });
    setNom(v.nom_utilisateur.trim());
    setSucces(reponse.detail);
    setOnglet('connexion');
  });

  const valider = async () => {
    if (!nom.trim() || !motDePasse) {
      setErreur("Saisissez votre nom d'utilisateur et votre mot de passe.");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      await connexion(nom.trim(), motDePasse, seSouvenir);
    } catch (e) {
      const restants = e.donnees?.essais_restants;
      setErreur(e.message + (restants > 0 ? `\nIl vous reste ${restants} essai(s).` : ''));
      setEnvoi(false);
    }
  };
  const annuler = () => { setNom(''); setMotDePasse(''); setErreur(null); };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={st.hero}>
          {/* même fond que la page d'accueil : l'analyse tactique, assombrie pour garder le texte lisible */}
          <Image source={require('../../assets/accueil-fond.jpg')} style={st.fond} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={st.voile} />
          <View style={st.large}>
            {surRetour ? (
              <Pressable onPress={surRetour} hitSlop={8} accessibilityRole="button" style={({ pressed }) => [st.retour, pressed && { opacity: 0.7 }]}>
                <Text style={st.retourFleche}>←</Text>
                <Text style={st.retourTxt}>Retour à la page d'accueil</Text>
              </Pressable>
            ) : null}
            <View style={st.brandRow}>
              <View style={st.logo}><View style={st.logoBlue} /><View style={st.logoRed} /><Text style={st.logoTxt}>SH</Text></View>
              <View>
                <Text style={st.brand}>SYSCOUT-HT</Text>
                <Text style={st.brandSub}>Ayiti Data Foot S.A.</Text>
              </View>
            </View>
            <Text style={st.slogan}>Le talent haïtien,{'\n'}mesuré et révélé.</Text>
            <Text style={st.tag}>Codage vidéo, statistiques et rapports de scouting de la Ligue Haïtienne.</Text>
          </View>
        </View>

        <View style={st.sheet}>
          <View style={st.large}>
            <View style={st.onglets} accessibilityRole="tablist">
              {[['connexion', 'Connexion'], ['inscription', 'Inscription']].map(([cle, titre]) => (
                <Pressable key={cle} onPress={() => { setOnglet(cle); setErreur(null); }} style={[st.onglet, onglet === cle && st.ongletActif]}
                  accessibilityRole="tab" accessibilityState={{ selected: onglet === cle }}>
                  <Text style={[st.ongletTxt, onglet === cle && st.ongletTxtActif]}>{titre}</Text>
                </Pressable>
              ))}
            </View>

            {onglet === 'connexion' ? (
              <>
                <Text style={st.sub}>Entrez vos identifiants pour accéder à votre espace.</Text>
                <Alert tone="s" text={succes} />
                <Alert tone="w" text={message} />
                <Alert tone="e" text={erreur} />
                <Field label="Nom d'utilisateur" required value={nom} onChangeText={setNom} autoCapitalize="none" />
                <Field label="Mot de passe" required value={motDePasse} onChangeText={setMotDePasse} secure={!afficher} autoCapitalize="none"
                  onSubmitEditing={valider}
                  right={<Pressable onPress={() => setAfficher(!afficher)} hitSlop={10}><Text style={st.show}>{afficher ? 'Masquer' : 'Afficher'}</Text></Pressable>} />
                <View style={st.row}>
                  <Check on={seSouvenir} onPress={() => setSeSouvenir(!seSouvenir)} label="Se souvenir de moi" />
                  <Pressable onPress={() => informer('Mot de passe oublié', "Contactez l'administrateur du système : il réinitialisera votre mot de passe et vous enverra un mot de passe provisoire par courriel.")}>
                    <Text style={st.link}>Mot de passe oublié ?</Text>
                  </Pressable>
                </View>
                <Rangee>
                  <Button title="Annuler" kind="secondary" style={{ flex: 1 }} onPress={annuler} />
                  <Button title="Connexion" style={{ flex: 1.6 }} onPress={valider} loading={envoi} />
                </Rangee>
              </>
            ) : (
              <>
                <Text style={st.sub}>Demandez un compte : l'administrateur l'activera et vous attribuera votre rôle.</Text>
                <Alert tone="e" text={f.message} />
                <Rangee>
                  <Field label="Nom" required {...f.lier('nom')} style={{ flex: 1 }} />
                  <Field label="Prénom" required {...f.lier('prenom')} style={{ flex: 1 }} />
                </Rangee>
                <Field label="Courriel" required keyboardType="email-address" autoCapitalize="none" {...f.lier('courriel')} />
                <Field label="Téléphone" keyboardType="phone-pad" {...f.lier('telephone')} />
                <Field label="Nom d'utilisateur souhaité" required autoCapitalize="none" {...f.lier('nom_utilisateur')} />
                <Field label="Mot de passe" required secure autoCapitalize="none" {...f.lier('mot_de_passe')}
                  hint={f.erreurs.mot_de_passe || 'Au moins 8 caractères, avec des lettres et des chiffres.'} />
                <Field label="Confirmer le mot de passe" required secure autoCapitalize="none" {...f.lier('confirmation')} onSubmitEditing={inscrire} />
                <Rangee>
                  <Button title="Annuler" kind="secondary" style={{ flex: 1 }} onPress={() => setOnglet('connexion')} />
                  <Button title="Envoyer la demande" style={{ flex: 1.6 }} onPress={inscrire} loading={f.envoi} />
                </Rangee>
              </>
            )}
            <View style={{ height: 16 }} />
            <Alert tone="i" text={SECURITE[langue]} />
            <Text style={st.foot}>
              {LANGUES.map(([cle, nom], i) => (
                <Text key={cle} onPress={() => setLangue(cle)} accessibilityRole="button" style={langue === cle ? st.langue : null}>{i ? '  |  ' : ''}{nom}</Text>
              ))}
              {'\n'}Serveur : {SERVEUR}
            </Text>
            <Text style={st.credit}>Réalisé par Smartgen</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  retour: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', height: 38, paddingHorizontal: 14, marginBottom: 22,
    borderRadius: 19, backgroundColor: 'rgba(255,255,255,.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,.28)' },
  retourFleche: { color: '#fff', fontSize: 16, ...F.bold },
  retourTxt: { color: '#fff', fontSize: 13.5, ...F.semi },
  hero: { backgroundColor: C.navy, paddingTop: 48, paddingHorizontal: 24, paddingBottom: 54, overflow: 'hidden' },
  large: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  fond: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  voile: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,31,77,.80)' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 42, height: 42, borderRadius: 11, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logoBlue: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 21, backgroundColor: C.blue },
  logoRed: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 21, backgroundColor: C.red },
  logoTxt: { color: '#fff', fontSize: 14, ...F.bold },
  brand: { color: '#fff', fontSize: 19, ...F.bold },
  brandSub: { color: '#9fb0dd', fontSize: 12, ...F.regular },
  slogan: { color: '#fff', fontSize: 28, lineHeight: 33, marginTop: 34, ...F.bold },
  tag: { color: '#b9c6ea', fontSize: 14, lineHeight: 20, marginTop: 10, ...F.regular },
  sheet: { flex: 1, backgroundColor: '#fff', marginTop: -24, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  onglets: { flexDirection: 'row', backgroundColor: '#eef1f6', borderRadius: 12, padding: 4, marginBottom: 14 },
  onglet: { flex: 1, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  ongletActif: { backgroundColor: '#fff', shadowColor: '#0b1f4d', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  ongletTxt: { fontSize: 14.5, color: C.muted, ...F.semi },
  ongletTxtActif: { color: C.blue, ...F.bold },
  title: { fontSize: 22, color: C.ink, ...F.bold },
  sub: { fontSize: 13.5, color: C.muted, marginTop: 4, marginBottom: 20, ...F.regular },
  show: { color: C.muted, fontSize: 12.5, ...F.medium },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, marginTop: 2 },
  link: { fontSize: 13, color: C.blue, ...F.semi },
  langue: { color: C.blue, ...F.semi },
  credit: { textAlign: 'center', color: C.ink2, fontSize: 12.5, marginTop: 14, ...F.semi },
  foot: { lineHeight: 20, textAlign: 'center', color: C.muted, fontSize: 11.5, ...F.regular },
});
