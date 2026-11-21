import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api, pieceJointe } from '../api';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import { CONTRATS, PIEDS, POSTES, age, dateFR, dateISO } from '../constantes';
import { Ecran, Card, Field, Select, Segmented, Button, Badge, Alert, Rangee, Avatar, confirmer, useFormulaire } from '../components/ui';

const VIDE = {
  nom: '', prenom: '', sexe: 'M', date_naissance: '', nationalite: 'Haïtienne', telephone: '', adresse: '',
  poste: null, pied_fort: 'D', taille: '', poids: '', club_actuel: null, type_contrat: 'AMATEUR',
  nom_tuteur: '', lien_tuteur: 'Mère',
};

// CU05 — Enregistrer un joueur (création et modification de la fiche)
export default function JoueurScreen({ navigation, route }) {
  const id = route.params?.id;
  const { a, utilisateur } = useAuth();
  // l'administrateur d'un club n'enregistre que les joueurs de son club
  const sonClub = a('CLUB_ADMIN') ? utilisateur.club : null;
  const f = useFormulaire(sonClub ? { ...VIDE, club_actuel: sonClub } : VIDE);
  const [clubs, setClubs] = useState([]);
  const [accord, setAccord] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [initial, setInitial] = useState(null);
  const v = f.valeurs;

  useEffect(() => {
    (async () => {
      try {
        setClubs((await api.tout('/clubs/')).filter((c) => !sonClub || c.id === sonClub).map((c) => [c.id, `${c.nom} · ${c.division}`]));
        if (id) {
          const j = await api.get(`/joueurs/${id}/`);
          setInitial(j);
          f.setValeurs({
            ...VIDE, ...j, date_naissance: dateFR(j.date_naissance), taille: j.taille ?? '', poids: j.poids ?? '',
            nom_tuteur: j.nom_tuteur || '', lien_tuteur: j.lien_tuteur || 'Mère',
          });
        }
      } catch (e) { f.setMessage(e.message); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // CU05 étape 4 : le système calcule l'âge ; si le joueur est mineur, le tuteur devient obligatoire (RG12)
  const naissance = dateISO(v.date_naissance);
  const ans = age(naissance);
  const mineur = ans !== null && ans < 18;
  const accordExistant = initial?.accord_tuteur;

  const choisirAccord = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (!r.canceled) { setAccord(r.assets[0]); f.setErreurs((e) => ({ ...e, accord_tuteur: undefined })); }
  };

  const choisirPhoto = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (r.canceled) return;
    if (r.assets[0].size > 2 * 1024 * 1024) { f.setMessage('La photo dépasse 2 Mo : choisissez une image plus légère.'); return; }
    setPhoto(r.assets[0]);
  };

  const enregistrer = () => f.soumettre(async () => {
    const erreurs = {};
    ['nom', 'prenom'].forEach((champ) => { if (!v[champ].trim()) erreurs[champ] = 'Champ obligatoire'; });
    if (!naissance) erreurs.date_naissance = 'Date invalide (format JJ/MM/AAAA)';
    if (!v.poste) erreurs.poste = 'Champ obligatoire';
    if (!v.club_actuel) erreurs.club_actuel = 'Champ obligatoire';
    if (mineur && !v.nom_tuteur.trim()) erreurs.nom_tuteur = 'Champ obligatoire';
    if (mineur && !accord && !accordExistant) erreurs.accord_tuteur = "L'accord écrit est exigé";
    if (Object.keys(erreurs).length) {
      f.setErreurs(erreurs);
      f.setMessage('Complétez les champs signalés en rouge.');
      return;
    }
    const donnees = {
      nom: v.nom.trim(), prenom: v.prenom.trim(), sexe: v.sexe, date_naissance: naissance, nationalite: v.nationalite,
      poste: v.poste, pied_fort: v.pied_fort, club_actuel: v.club_actuel, type_contrat: v.type_contrat,
      telephone: mineur ? '' : v.telephone, adresse: mineur ? '' : v.adresse,
      nom_tuteur: mineur ? v.nom_tuteur.trim() : '', lien_tuteur: mineur ? v.lien_tuteur : '',
    };
    if (v.taille !== '') donnees.taille = Number(v.taille);
    if (v.poids !== '') donnees.poids = Number(v.poids);
    if (id) donnees.version = initial.version;
    let corps = donnees;
    if (accord || photo) { // les fichiers (photo, accord du tuteur) partent avec la fiche, en multipart
      corps = new FormData();
      Object.entries(donnees).forEach(([cle, valeur]) => corps.append(cle, String(valeur)));
      if (accord) corps.append('accord_tuteur', pieceJointe(accord));
      if (photo) corps.append('photo', pieceJointe(photo));
    }
    const joueur = id ? await api.patch(`/joueurs/${id}/`, corps) : await api.post('/joueurs/', corps);
    if (id) navigation.goBack();
    else navigation.replace('JoueurDetail', { id: joueur.id });
  });

  const supprimer = async () => {
    if (!(await confirmer('Supprimer', 'Voulez-vous vraiment supprimer ce joueur ?'))) return;
    f.soumettre(async () => {
      await api.delete(`/joueurs/${id}/`);
      navigation.pop(2);
    });
  };

  return (
    <Ecran titre={id ? 'Modifier le joueur' : 'Nouveau joueur'} sousTitre={id ? 'Joueurs › Fiche' : 'Joueurs › Créer une fiche'}
      droite={<Badge text={id ? `Version ${initial?.version ?? ''}` : 'Brouillon'} tone="n" />}>
      <Alert tone="e" text={f.message} />
      <View style={st.photoRow}>
        <Avatar nom={`${v.prenom} ${v.nom}`.trim() || '?'} taille={54} photo={photo?.uri || initial?.photo} />
        <View style={{ flex: 1 }}>
          <Text style={st.photoT}>{`${v.prenom} ${v.nom}`.trim() || 'Nouveau joueur'}</Text>
          <Text style={st.photoS}>{photo ? photo.name : 'Photo JPG ou PNG, 2 Mo max'}</Text>
        </View>
        <Button title="Charger" kind="secondary" style={{ height: 38 }} onPress={choisirPhoto} />
      </View>

      <Card title="Identité" step="1">
        <Rangee>
          <Field label="Nom" required {...f.lier('nom')} style={{ flex: 1 }} />
          <Field label="Prénom" required {...f.lier('prenom')} style={{ flex: 1 }} />
        </Rangee>
        <Field label="Date de naissance" required placeholder="JJ/MM/AAAA" keyboardType="numbers-and-punctuation" {...f.lier('date_naissance')}
          hint={f.erreurs.date_naissance || (ans !== null ? `Âge calculé : ${ans} ans${mineur ? ' (mineur)' : ''}` : 'Format JJ/MM/AAAA')} />
        <Rangee>
          <Segmented label="Sexe" options={[['M', 'M'], ['F', 'F']]} value={v.sexe} onChange={f.changer('sexe')} style={{ flex: 1 }} />
          <Field label="Nationalité" {...f.lier('nationalite')} style={{ flex: 1 }} />
        </Rangee>
        {mineur ? <Field label="Téléphone" value="" placeholder="Masqué (joueur mineur)" editable={false} /> : (
          <>
            <Field label="Téléphone" keyboardType="phone-pad" {...f.lier('telephone')} />
            <Field label="Adresse" {...f.lier('adresse')} />
          </>
        )}
      </Card>

      <Card title="Profil sportif" step="2">
        <Select label="Poste" required options={POSTES} value={v.poste} onChange={f.changer('poste')}
          state={f.erreurs.poste ? 'error' : undefined} hint={f.erreurs.poste} />
        <Segmented label="Pied fort" options={PIEDS} value={v.pied_fort} onChange={f.changer('pied_fort')} />
        <Rangee>
          <Field label="Taille (cm)" keyboardType="number-pad" {...f.lier('taille')} style={{ flex: 1 }} />
          <Field label="Poids (kg)" keyboardType="number-pad" {...f.lier('poids')} style={{ flex: 1 }} />
        </Rangee>
        <Select label="Club actuel" required options={clubs} value={v.club_actuel} onChange={f.changer('club_actuel')}
          state={f.erreurs.club_actuel ? 'error' : undefined}
          hint={f.erreurs.club_actuel || (id && initial && v.club_actuel !== initial.club_actuel ? "Changement de club : une ligne d'historique sera créée (RG1)." : undefined)} />
        <Select label="Type de contrat" options={CONTRATS} value={v.type_contrat} onChange={f.changer('type_contrat')} required />
      </Card>

      {mineur ? (
        <Card title="Tuteur légal" step="3" badge={<Badge text="Obligatoire : moins de 18 ans" tone="a" />}>
          <Alert text="Ce joueur est mineur (RG12) : le nom du tuteur et l'accord écrit sont exigés avant l'enregistrement." />
          <Field label="Nom du tuteur" required placeholder="Nom du parent ou tuteur" {...f.lier('nom_tuteur')} />
          <Segmented label="Lien" options={[['Mère', 'Mère'], ['Père', 'Père'], ['Tuteur', 'Tuteur']]} value={v.lien_tuteur} onChange={f.changer('lien_tuteur')} />
          <Text style={st.label}>Accord écrit (PDF ou photo) <Text style={{ color: C.red }}>*</Text></Text>
          <Pressable onPress={choisirAccord} style={[st.fichier, f.erreurs.accord_tuteur && { borderColor: C.red, borderWidth: 1.5 }]}>
            <Text style={[st.fichierTxt, !accord && !accordExistant && { color: '#9ca3af' }]} numberOfLines={1}>
              {accord ? accord.name : accordExistant ? 'Accord déjà enregistré' : 'accord_tuteur.pdf'}
            </Text>
            <Text style={st.browse}>Parcourir</Text>
          </Pressable>
          {f.erreurs.accord_tuteur ? <Text style={st.erreur}>{f.erreurs.accord_tuteur}</Text> : <View style={{ height: 12 }} />}
        </Card>
      ) : null}

      <Rangee style={{ marginBottom: 10 }}>
        <Button title="Annuler" kind="secondary" style={{ flex: 1 }} onPress={navigation.goBack} />
        <Button title="Enregistrer" style={{ flex: 2 }} onPress={enregistrer} loading={f.envoi} />
      </Rangee>
      {id && a('ADMIN') ? <Button title="Supprimer" kind="danger" style={{ marginBottom: 10 }} onPress={supprimer} /> : null}
    </Ecran>
  );
}

const st = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 12 },
  photoT: { fontSize: 14, color: C.ink, ...F.semi },
  photoS: { fontSize: 12, color: C.muted, ...F.regular },
  label: { fontSize: 12, color: C.ink2, marginBottom: 6, ...F.semi },
  fichier: { height: 44, borderWidth: 1, borderColor: C.line2, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fichierTxt: { flex: 1, fontSize: 14, color: C.ink, ...F.regular },
  browse: { color: C.blue, fontSize: 13, ...F.semi },
  erreur: { fontSize: 11.5, color: C.red, marginTop: 5, marginBottom: 12, ...F.regular },
});
