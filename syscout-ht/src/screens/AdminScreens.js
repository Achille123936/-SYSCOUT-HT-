import React, { useEffect, useState } from 'react';
import { Text, View, FlatList, StyleSheet, Pressable, Platform } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import { ACTIONS_AUDIT, ROLES, ROLES_CLUB, dateHeureFR, dateISO } from '../constantes';

// l'administrateur d'un club gère les comptes des entraîneurs et des joueurs de son club (SRS HAITI SCOUT AI §4)
const MEMBRES_DU_CLUB = ['COACH', 'JOUEUR'];
import { Ecran, Etat, Card, Info, Field, Select, Button, Badge, Alert, Ligne, Rangee, Avatar, BoutonEntete, confirmer, informer, useChargement, useFormulaire } from '../components/ui';

// ---------------------------------------------------------------- CU02 — Gérer les utilisateurs
export function UtilisateursScreen({ navigation }) {
  const { a, utilisateur } = useAuth();
  const [q, setQ] = useState('');
  const { donnees, ...etat } = useChargement(() => api.get('/utilisateurs/', { q, page_size: 200 }), [q]);
  return (
    <Ecran titre={a('CLUB_ADMIN') ? 'Membres du club' : 'Utilisateurs'}
      sousTitre={a('CLUB_ADMIN') ? `${utilisateur.club_nom} · entraîneurs et joueurs` : 'Administration › Comptes et rôles'} defilant={false}
      droite={<BoutonEntete titre="+ Nouveau" onPress={() => navigation.navigate('UtilisateurForm')} />}>
      <Field placeholder="Rechercher un compte…" value={q} onChangeText={setQ} />
      <Etat {...etat} donnees={donnees} vide={donnees && !donnees.results.length ? 'Aucun compte.' : null} />
      <FlatList
        data={donnees?.results || []}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={{ paddingBottom: 14 }}
        renderItem={({ item: u }) => (
          <Ligne titre={u.nom_complet} sousTitre={`${u.nom_utilisateur} · ${u.role_libelle}${u.club_nom ? ` · ${u.club_nom}` : ''}${u.joueur_nom && u.joueur_nom !== u.nom_complet ? ` · fiche de ${u.joueur_nom}` : ''}`}
            gauche={<Avatar nom={u.nom_complet} couleur={u.is_active ? C.blue : C.muted} />}
            droite={u.bloque ? <Badge text="Bloqué" tone="r" /> : !u.is_active ? (u.demande_inscription && !u.last_login ? <Badge text="Demande à valider" tone="a" /> : <Badge text="Inactif" tone="n" />) : null}
            onPress={() => navigation.navigate('UtilisateurForm', { id: u.id })} />
        )}
      />
    </Ecran>
  );
}

export function UtilisateurFormScreen({ navigation, route }) {
  const id = route.params?.id;
  const { utilisateur: moi, a } = useAuth();
  const gestionClub = a('CLUB_ADMIN');
  const f = useFormulaire({ nom: '', prenom: '', courriel: '', telephone: '', nom_utilisateur: '', role: null, club: gestionClub ? moi.club : null, joueur: null });
  const v = f.valeurs;
  const [compte, setCompte] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [fiches, setFiches] = useState([]);
  const [provisoire, setProvisoire] = useState(null);
  const deClub = ROLES_CLUB.includes(v.role);

  const charger = async () => {
    try {
      if (!gestionClub) setClubs((await api.tout('/clubs/')).map((c) => [c.id, c.nom]));
      if (id) {
        const u = await api.get(`/utilisateurs/${id}/`);
        setCompte(u);
        f.setValeurs({ nom: u.nom, prenom: u.prenom, courriel: u.courriel, telephone: u.telephone, nom_utilisateur: u.nom_utilisateur, role: u.role, club: u.club, joueur: u.joueur });
      }
    } catch (e) { f.setMessage(e.message); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { charger(); }, [id]);
  // compte « Joueur » : il est relié à la fiche d'un joueur du club
  useEffect(() => {
    if (v.role !== 'JOUEUR' || !v.club) { setFiches([]); return; }
    api.tout('/joueurs/', { club: v.club, tri: 'nom' }).then((liste) => setFiches(liste.map((j) => [j.id, `${j.nom_complet} · ${j.poste}`]))).catch(() => setFiches([]));
  }, [v.role, v.club]);

  const enregistrer = () => f.soumettre(async () => {
    const erreurs = {};
    ['nom', 'prenom', 'nom_utilisateur'].forEach((champ) => { if (!v[champ].trim()) erreurs[champ] = 'Champ obligatoire'; });
    if (!v.role) erreurs.role = 'Champ obligatoire';
    if (deClub && !v.club) erreurs.club = 'Champ obligatoire pour un compte de club';
    if (v.role === 'JOUEUR' && !v.joueur) erreurs.joueur = 'Choisissez la fiche du joueur';
    if (Object.keys(erreurs).length) { f.setErreurs(erreurs); f.setMessage('Complétez les champs signalés en rouge.'); return; }
    const donnees = {
      ...v, nom: v.nom.trim(), prenom: v.prenom.trim(), nom_utilisateur: v.nom_utilisateur.trim(),
      club: deClub ? v.club : null, joueur: v.role === 'JOUEUR' ? v.joueur : null,
    };
    if (id) {
      await api.patch(`/utilisateurs/${id}/`, donnees);
      navigation.goBack();
    } else {
      const cree = await api.post('/utilisateurs/', donnees);
      setProvisoire({ nom: cree.nom_utilisateur, motDePasse: cree.mot_de_passe_provisoire, courriel: cree.courriel });
    }
  });

  const agir = (action) => f.soumettre(async () => { await action(); await charger(); });
  const activer = (actif) => agir(async () => {
    if (!actif && !(await confirmer('Désactiver', 'Voulez-vous vraiment désactiver ce compte ? Son titulaire ne pourra plus se connecter.'))) return;
    await api.patch(`/utilisateurs/${id}/`, { is_active: actif });
  });
  const reinitialiser = () => agir(async () => {
    if (!(await confirmer('Réinitialiser', 'Générer un nouveau mot de passe provisoire pour ce compte ?'))) return;
    const r = await api.post(`/utilisateurs/${id}/reinitialiser/`);
    informer('Mot de passe provisoire', `${r.mot_de_passe_provisoire}\n\nIl a aussi été envoyé par courriel. L'utilisateur devra le changer à sa prochaine connexion.`);
  });

  if (provisoire) { // CU02 étape 6 : compte créé, mot de passe provisoire et courriel d'activation
    return (
      <Ecran titre="Compte créé" sousTitre="Administration › Utilisateurs">
        <Alert tone="s" text={`Le compte « ${provisoire.nom} » a été créé.${provisoire.courriel ? ` Un courriel d'activation a été envoyé à ${provisoire.courriel}.` : ''}`} />
        <Card title="Mot de passe provisoire">
          <Text selectable style={st.provisoire}>{provisoire.motDePasse}</Text>
          <Text style={st.aide}>À remettre à l'utilisateur si le courriel n'arrive pas. Il devra le changer à sa première connexion.</Text>
        </Card>
        <Button title="Terminer" onPress={navigation.goBack} />
      </Ecran>
    );
  }

  return (
    <Ecran titre={id ? 'Modifier le compte' : 'Nouveau compte'} sousTitre="Administration › Utilisateurs"
      droite={compte?.bloque ? <Badge text="Bloqué" tone="r" /> : compte && !compte.is_active ? <Badge text="Inactif" tone="n" /> : null}>
      <Alert tone="e" text={f.message} />
      {compte?.demande_inscription && !compte.is_active && !compte.last_login
        ? <Alert text="Demande d'inscription : choisissez le rôle, enregistrez, puis touchez « Réactiver le compte » pour l'activer." /> : null}
      <Card>
        <Rangee>
          <Field label="Nom" required {...f.lier('nom')} style={{ flex: 1 }} />
          <Field label="Prénom" required {...f.lier('prenom')} style={{ flex: 1 }} />
        </Rangee>
        <Field label="Courriel" keyboardType="email-address" autoCapitalize="none" {...f.lier('courriel')} />
        <Field label="Téléphone" keyboardType="phone-pad" {...f.lier('telephone')} />
        <Field label="Nom d'utilisateur" required autoCapitalize="none" {...f.lier('nom_utilisateur')} />
        <Select label="Rôle" required options={gestionClub ? ROLES.filter(([cle]) => MEMBRES_DU_CLUB.includes(cle)) : ROLES} value={v.role} onChange={f.changer('role')}
          state={f.erreurs.role ? 'error' : undefined} hint={f.erreurs.role || (gestionClub
            ? "Un entraîneur consulte les analyses ; un joueur ne voit que sa propre fiche."
            : 'Le rôle fixe les droits et privilèges du compte.')} />
        {deClub && !gestionClub ? (
          <Select label="Club" required options={clubs} value={v.club} onChange={(c) => f.setValeurs((x) => ({ ...x, club: c, joueur: null }))}
            state={f.erreurs.club ? 'error' : undefined} hint={f.erreurs.club || "Le compte dépend de l'abonnement de ce club."} />
        ) : null}
        {v.role === 'JOUEUR' ? (
          <Select label="Fiche du joueur" required options={fiches} value={v.joueur} onChange={f.changer('joueur')}
            vide={v.club ? 'Aucun joueur dans ce club.' : 'Choisissez d\'abord le club.'}
            state={f.erreurs.joueur ? 'error' : undefined} hint={f.erreurs.joueur || 'Le joueur ne verra que cette fiche : ses statistiques, ses matchs, sa carte.'} />
        ) : null}
      </Card>
      {compte ? (
        <Card>
          <Info libelle="Créé le" valeur={dateHeureFR(compte.date_creation)} />
          <Info libelle="Dernière connexion" valeur={compte.last_login ? dateHeureFR(compte.last_login) : 'Jamais'} />
          <View style={{ height: 8 }} />
        </Card>
      ) : null}
      <Rangee style={{ marginBottom: 10 }}>
        <Button title="Annuler" kind="secondary" style={{ flex: 1 }} onPress={navigation.goBack} />
        <Button title="Enregistrer" style={{ flex: 2 }} onPress={enregistrer} loading={f.envoi} />
      </Rangee>
      {compte ? (
        <>
          {compte.bloque ? <Button title="Débloquer le compte" kind="success" style={{ marginBottom: 10 }} onPress={() => agir(() => api.post(`/utilisateurs/${id}/debloquer/`))} /> : null}
          <Button title="Réinitialiser le mot de passe" kind="secondary" style={{ marginBottom: 10 }} onPress={reinitialiser} />
          {compte.id !== moi.id ? (
            <Button title={compte.is_active ? 'Désactiver le compte' : 'Réactiver le compte'} kind={compte.is_active ? 'danger' : 'secondary'}
              style={{ marginBottom: 10 }} onPress={() => activer(!compte.is_active)} />
          ) : null}
        </>
      ) : null}
    </Ecran>
  );
}

// ---------------------------------------------------------------- CU16 — Consulter l'audit et sauvegarder
export function AuditScreen() {
  const [filtres, setFiltres] = useState({ utilisateur: null, action: null, debut: '', fin: '' });
  const [pages, setPages] = useState(1);
  const [ouverte, setOuverte] = useState(null);
  const [message, setMessage] = useState(null);
  const [enSauvegarde, setEnSauvegarde] = useState(false);
  const changer = (champ) => (valeur) => { setFiltres((x) => ({ ...x, [champ]: valeur })); setPages(1); };
  const utilisateurs = useChargement(() => api.tout('/utilisateurs/'));
  const copies = useChargement(() => api.get('/sauvegarde/'));
  const debut = dateISO(filtres.debut);
  const fin = dateISO(filtres.fin);
  const { donnees, ...etat } = useChargement(
    () => api.get('/audit/', { utilisateur: filtres.utilisateur, action: filtres.action, debut, fin, page_size: 40 * pages }),
    [filtres.utilisateur, filtres.action, debut, fin, pages],
  );

  const sauvegarder = async () => {
    setEnSauvegarde(true);
    setMessage(null);
    try {
      const r = await api.post('/sauvegarde/');
      setMessage({ ton: 's', texte: `Sauvegarde réussie : ${r.copies.map((c) => `${c.destination.replace('_', ' ')} (${String(c.taille_ko).replace('.', ',')} Ko, ${c.fichiers_copies} fichier(s) copié(s))`).join(' et ')}.` });
      copies.recharger();
      etat.recharger();
    } catch (e) { setMessage({ ton: 'e', texte: e.message }); } finally { setEnSauvegarde(false); }
  };

  return (
    <Ecran titre="Journal" sousTitre="Administration › Audit et sauvegarde">
      <Card title="Sauvegarde">
        {message ? <Alert tone={message.ton} text={message.texte} /> : null}
        {(copies.donnees || []).map((c) => (
          <Info key={c.destination} libelle={c.destination === 'cloud' ? 'Serveur cloud' : 'Disque externe'}
            valeur={c.derniere ? `${c.nombre} copie(s) · ${c.derniere.replace('base_', '').replace('.json', '')}` : 'Aucune copie'} />
        ))}
        <Button title="Sauvegarder maintenant" style={{ marginVertical: 12 }} onPress={sauvegarder} loading={enSauvegarde} />
      </Card>

      <Card title="Journal des opérations" badge={donnees ? <Badge text={`${donnees.count}`} tone="b" /> : null}>
        <Rangee>
          <Select label="Utilisateur" placeholder="Tous" value={filtres.utilisateur} onChange={changer('utilisateur')} style={{ flex: 1 }}
            options={(utilisateurs.donnees || []).map((u) => [u.id, u.nom_utilisateur])} />
          <Select label="Action" placeholder="Toutes" options={ACTIONS_AUDIT} value={filtres.action} onChange={changer('action')} style={{ flex: 1 }} />
        </Rangee>
        <Rangee>
          <Field label="Du" placeholder="JJ/MM/AAAA" value={filtres.debut} onChangeText={changer('debut')} style={{ flex: 1 }} />
          <Field label="Au" placeholder="JJ/MM/AAAA" value={filtres.fin} onChangeText={changer('fin')} style={{ flex: 1 }} />
        </Rangee>
      </Card>

      <Etat {...etat} donnees={donnees} vide={donnees && !donnees.results.length ? 'Aucune opération sur cette période.' : null} />
      {(donnees?.results || []).map((o) => (
        <Pressable key={o.id} style={st.operation} onPress={() => setOuverte(ouverte === o.id ? null : o.id)}>
          <View style={st.haut}>
            <Badge text={o.action_libelle} tone={{ CREATION: 'g', SUPPRESSION: 'r', ECHEC_CONNEXION: 'r', MODIFICATION: 'a' }[o.action] || 'b'} />
            <Text style={st.quoi} numberOfLines={1}>{o.table_concernee}{o.id_enregistrement ? ` n° ${o.id_enregistrement}` : ''}</Text>
            <Text style={st.quand}>{dateHeureFR(o.date_heure)}</Text>
          </View>
          <Text style={st.qui}>{o.utilisateur_nom || 'inconnu'} · poste {o.adresse_ip || '—'}</Text>
          {ouverte === o.id ? (
            <View style={st.valeurs}>
              <Text style={st.vTitre}>Valeur avant</Text>
              <Text style={st.json}>{o.valeur_avant ? JSON.stringify(o.valeur_avant, null, 1) : '—'}</Text>
              <Text style={st.vTitre}>Valeur après</Text>
              <Text style={st.json}>{o.valeur_apres ? JSON.stringify(o.valeur_apres, null, 1) : '—'}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
      {donnees?.next ? <Button title="Afficher plus d'opérations" kind="secondary" style={{ marginBottom: 10 }} onPress={() => setPages(pages + 1)} /> : null}
    </Ecran>
  );
}

const st = StyleSheet.create({
  provisoire: { fontSize: 24, letterSpacing: 1, color: C.navy, textAlign: 'center', marginVertical: 8, ...F.bold },
  aide: { fontSize: 12.5, lineHeight: 18, color: C.muted, marginBottom: 12, ...F.regular },
  operation: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 11, marginBottom: 8 },
  haut: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quoi: { flex: 1, fontSize: 13, color: C.ink, ...F.semi },
  quand: { fontSize: 11.5, color: C.muted, ...F.regular },
  qui: { fontSize: 12, color: C.muted, marginTop: 5, ...F.regular },
  valeurs: { marginTop: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  vTitre: { fontSize: 11, color: C.ink2, marginBottom: 3, ...F.semi },
  json: { fontSize: 11.5, lineHeight: 16, color: C.ink2, backgroundColor: C.bg, borderRadius: 8, padding: 8, marginBottom: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
