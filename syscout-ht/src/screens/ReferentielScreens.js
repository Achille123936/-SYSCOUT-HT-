import React, { useEffect, useState } from 'react';
import { Text, FlatList, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api, pieceJointe } from '../api';
import { useAuth } from '../auth';
import { DIVISIONS, dateFR, dateISO } from '../constantes';
import { Ecran, Etat, Card, Field, Select, Segmented, Button, Badge, Alert, Ligne, Rangee, Avatar, Check, BoutonEntete, confirmer, useChargement, useFormulaire, s } from '../components/ui';

const DEPARTEMENTS = ['Artibonite', 'Centre', "Grand'Anse", 'Nippes', 'Nord', 'Nord-Est', 'Nord-Ouest', 'Ouest', 'Sud', 'Sud-Est'].map((d) => [d, d]);
const TYPES = [['CHAMPIONNAT', 'Championnat'], ['COUPE', 'Coupe']];

// boutons communs des formulaires (SEL 3.5) : Enregistrer, Annuler et, en modification, Supprimer
function Boutons({ navigation, f, enregistrer, supprimer }) {
  return (
    <>
      <Rangee style={{ marginBottom: 10 }}>
        <Button title="Annuler" kind="secondary" style={{ flex: 1 }} onPress={navigation.goBack} />
        <Button title="Enregistrer" style={{ flex: 2 }} onPress={enregistrer} loading={f.envoi} />
      </Rangee>
      {supprimer ? <Button title="Supprimer" kind="danger" style={{ marginBottom: 10 }} onPress={supprimer} /> : null}
    </>
  );
}

// ---------------------------------------------------------------- CU03 — Gérer les clubs
export function ClubsScreen({ navigation }) {
  const { a } = useAuth();
  const [q, setQ] = useState('');
  const peutModifier = a('ADMIN', 'ANALYSTE', 'AGENT');
  const { donnees, ...etat } = useChargement(() => api.get('/clubs/', { q, page_size: 200 }), [q]);
  return (
    <Ecran titre="Clubs" sousTitre={donnees ? `${donnees.count} club(s)` : null} defilant={false}
      droite={peutModifier ? <BoutonEntete titre="+ Nouveau" onPress={() => navigation.navigate('ClubForm')} /> : null}>
      <Field placeholder="Rechercher un club, une ville…" value={q} onChangeText={setQ} />
      <Etat {...etat} donnees={donnees} vide={donnees && !donnees.results.length ? 'Aucun club.' : null} />
      <FlatList
        data={donnees?.results || []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ paddingBottom: 14 }}
        renderItem={({ item: c }) => (
          <Ligne titre={c.nom} sousTitre={`${c.ville}${c.departement ? ` · ${c.departement}` : ''}${c.stade ? ` · ${c.stade}` : ''}`}
            gauche={<Avatar nom={c.sigle || c.nom} photo={c.logo} />} droite={<Badge text={c.division} tone="b" />}
            onPress={peutModifier ? () => navigation.navigate('ClubForm', { id: c.id }) : undefined} />
        )}
      />
    </Ecran>
  );
}

export function ClubFormScreen({ navigation, route }) {
  const id = route.params?.id;
  const { a } = useAuth();
  const f = useFormulaire({ nom: '', sigle: '', ville: '', departement: null, stade: '', division: 'D1' });
  const v = f.valeurs;
  const [logo, setLogo] = useState(null);
  const choisirLogo = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (!r.canceled) setLogo(r.assets[0]);
  };
  useEffect(() => {
    if (id) api.get(`/clubs/${id}/`).then((c) => f.setValeurs({ ...c, departement: c.departement || null })).catch((e) => f.setMessage(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const enregistrer = () => f.soumettre(async () => {
    const erreurs = {};
    if (!v.nom.trim()) erreurs.nom = 'Champ obligatoire';
    if (!v.ville.trim()) erreurs.ville = 'Champ obligatoire';
    if (Object.keys(erreurs).length) { f.setErreurs(erreurs); f.setMessage('Complétez les champs signalés en rouge.'); return; }
    const donnees = { nom: v.nom.trim(), sigle: (v.sigle || '').trim().toUpperCase(), ville: v.ville.trim(), departement: v.departement || '', stade: v.stade, division: v.division };
    let corps = donnees;
    if (logo) {
      corps = new FormData();
      Object.entries(donnees).forEach(([cle, valeur]) => corps.append(cle, String(valeur)));
      corps.append('logo', pieceJointe(logo));
    }
    if (id) await api.patch(`/clubs/${id}/`, corps); else await api.post('/clubs/', corps);
    navigation.goBack();
  });
  const supprimer = async () => {
    if (!(await confirmer('Supprimer', 'Voulez-vous vraiment supprimer ce club ?'))) return;
    f.soumettre(async () => { await api.delete(`/clubs/${id}/`); navigation.goBack(); });
  };

  return (
    <Ecran titre={id ? 'Modifier le club' : 'Nouveau club'} sousTitre="Clubs">
      <Alert tone="e" text={f.message} />
      <Card>
        <Rangee>
          <Field label="Nom" required {...f.lier('nom')} style={{ flex: 2.4 }} />
          <Field label="Sigle" autoCapitalize="characters" {...f.lier('sigle')} style={{ flex: 1 }} />
        </Rangee>
        <Field label="Ville" required {...f.lier('ville')} />
        <Select label="Département" options={DEPARTEMENTS} value={v.departement} onChange={f.changer('departement')} />
        <Field label="Stade" {...f.lier('stade')} />
        <Rangee style={{ alignItems: 'center', marginBottom: 12 }}>
          <Avatar nom={v.sigle || v.nom || '?'} photo={logo?.uri || v.logo} />
          <Text style={[s.ligneS, { flex: 1 }]} numberOfLines={1}>{logo ? logo.name : v.logo ? 'Logo enregistré' : 'Logo du club (image)'}</Text>
          <Button title="Charger le logo" kind="secondary" style={{ height: 38 }} onPress={choisirLogo} />
        </Rangee>
        <Segmented label="Division" options={DIVISIONS.map(([cle, nom]) => [cle, cle === 'ACADEMIE' ? nom : cle])} value={v.division} onChange={f.changer('division')} />
      </Card>
      <Boutons navigation={navigation} f={f} enregistrer={enregistrer} supprimer={id && a('ADMIN', 'ANALYSTE') ? supprimer : null} />
    </Ecran>
  );
}

// ---------------------------------------------------------------- CU04 — Gérer les compétitions et saisons
export function CompetitionsScreen({ navigation }) {
  const { donnees, ...etat } = useChargement(async () => ({
    saisons: await api.tout('/saisons/'), competitions: await api.tout('/competitions/'),
  }));
  return (
    <Ecran titre="Compétitions" sousTitre="Compétitions et saisons"
      droite={<BoutonEntete titre="+ Nouvelle" onPress={() => navigation.navigate('CompetitionForm')} />}>
      <Etat {...etat} donnees={donnees} />
      {(donnees?.saisons || []).map((saison) => {
        const liste = donnees.competitions.filter((c) => c.saison === saison.id);
        return (
          <Card key={saison.id} title={`Saison ${saison.libelle}`} badge={saison.est_courante ? <Badge text="En cours" tone="g" /> : null}>
            <Text style={[s.ligneS, { marginBottom: 8 }]}>Du {dateFR(saison.date_debut)} au {dateFR(saison.date_fin)}</Text>
            {liste.length ? liste.map((c) => (
              <Ligne key={c.id} titre={c.nom} sousTitre={`${c.type_libelle} · ${c.clubs.length} clubs · ${dateFR(c.date_debut)} → ${dateFR(c.date_fin)}`}
                droite={<Badge text={c.niveau} tone="b" />} onPress={() => navigation.navigate('CompetitionForm', { id: c.id })} />
            )) : <Text style={[s.ligneS, { marginBottom: 10 }]}>Aucune compétition pour cette saison.</Text>}
            <View style={{ height: 6 }} />
          </Card>
        );
      })}
      <Button title="+ Nouvelle saison" kind="secondary" style={{ marginBottom: 10 }} onPress={() => navigation.navigate('SaisonForm')} />
    </Ecran>
  );
}

export function CompetitionFormScreen({ navigation, route }) {
  const id = route.params?.id;
  const f = useFormulaire({ nom: '', type: 'CHAMPIONNAT', niveau: 'D1', saison: null, date_debut: '', date_fin: '', clubs: [] });
  const v = f.valeurs;
  const [saisons, setSaisons] = useState([]);
  const [clubs, setClubs] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const [listeSaisons, listeClubs] = await Promise.all([api.tout('/saisons/'), api.tout('/clubs/')]);
        setSaisons(listeSaisons);
        setClubs(listeClubs);
        if (id) {
          const c = await api.get(`/competitions/${id}/`);
          f.setValeurs({ nom: c.nom, type: c.type, niveau: c.niveau, saison: c.saison, date_debut: dateFR(c.date_debut), date_fin: dateFR(c.date_fin), clubs: c.clubs });
        } else {
          const courante = listeSaisons.find((saison) => saison.est_courante);
          if (courante) f.setValeurs((x) => ({ ...x, saison: courante.id, date_debut: dateFR(courante.date_debut), date_fin: dateFR(courante.date_fin) }));
        }
      } catch (e) { f.setMessage(e.message); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cocher = (club) => f.changer('clubs')(v.clubs.includes(club) ? v.clubs.filter((c) => c !== club) : [...v.clubs, club]);
  const enregistrer = () => f.soumettre(async () => {
    const erreurs = {};
    const [debut, fin] = [dateISO(v.date_debut), dateISO(v.date_fin)];
    if (!v.nom.trim()) erreurs.nom = 'Champ obligatoire';
    if (!v.saison) erreurs.saison = 'Champ obligatoire';
    if (!debut) erreurs.date_debut = 'Date invalide';
    if (!fin) erreurs.date_fin = 'Date invalide';
    if (Object.keys(erreurs).length) { f.setErreurs(erreurs); f.setMessage('Complétez les champs signalés en rouge.'); return; }
    const donnees = { nom: v.nom.trim(), type: v.type, niveau: v.niveau, saison: v.saison, date_debut: debut, date_fin: fin, clubs: v.clubs };
    if (id) await api.patch(`/competitions/${id}/`, donnees); else await api.post('/competitions/', donnees);
    navigation.goBack();
  });
  const supprimer = async () => {
    if (!(await confirmer('Supprimer', 'Voulez-vous vraiment supprimer cette compétition ?'))) return;
    f.soumettre(async () => { await api.delete(`/competitions/${id}/`); navigation.goBack(); });
  };

  return (
    <Ecran titre={id ? 'Modifier la compétition' : 'Nouvelle compétition'} sousTitre="Compétitions">
      <Alert tone="e" text={f.message} />
      <Card>
        <Field label="Nom" required placeholder="ex. Ligue Haïtienne D1" {...f.lier('nom')} />
        <Segmented label="Type" options={TYPES} value={v.type} onChange={f.changer('type')} />
        <Segmented label="Niveau" options={DIVISIONS.map(([cle, nom]) => [cle, cle === 'ACADEMIE' ? nom : cle])} value={v.niveau} onChange={f.changer('niveau')} />
        <Select label="Saison" required options={saisons.map((saison) => [saison.id, saison.libelle])} value={v.saison} onChange={f.changer('saison')}
          state={f.erreurs.saison ? 'error' : undefined} hint={f.erreurs.saison} />
        <Rangee>
          <Field label="Début" required placeholder="JJ/MM/AAAA" {...f.lier('date_debut')} style={{ flex: 1 }} />
          <Field label="Fin" required placeholder="JJ/MM/AAAA" {...f.lier('date_fin')} style={{ flex: 1 }} />
        </Rangee>
      </Card>
      <Card title="Clubs participants" badge={<Badge text={`${v.clubs.length} coché(s)`} tone={v.clubs.length >= 2 ? 'g' : 'a'} />}>
        <Alert tone="e" text={f.erreurs.clubs} />
        {clubs.map((c) => (
          <View key={c.id} style={{ paddingVertical: 7 }}>
            <Check on={v.clubs.includes(c.id)} onPress={() => cocher(c.id)} label={`${c.nom} · ${c.division}`} />
          </View>
        ))}
        <View style={{ height: 8 }} />
      </Card>
      <Boutons navigation={navigation} f={f} enregistrer={enregistrer} supprimer={id ? supprimer : null} />
    </Ecran>
  );
}

export function SaisonFormScreen({ navigation }) {
  const f = useFormulaire({ libelle: '', date_debut: '', date_fin: '', est_courante: false });
  const v = f.valeurs;
  const enregistrer = () => f.soumettre(async () => {
    const erreurs = {};
    const [debut, fin] = [dateISO(v.date_debut), dateISO(v.date_fin)];
    if (!v.libelle.trim()) erreurs.libelle = 'Champ obligatoire';
    if (!debut) erreurs.date_debut = 'Date invalide';
    if (!fin) erreurs.date_fin = 'Date invalide';
    if (Object.keys(erreurs).length) { f.setErreurs(erreurs); f.setMessage('Complétez les champs signalés en rouge.'); return; }
    await api.post('/saisons/', { libelle: v.libelle.trim(), date_debut: debut, date_fin: fin, est_courante: v.est_courante });
    navigation.goBack();
  });
  return (
    <Ecran titre="Nouvelle saison" sousTitre="Compétitions › Saisons">
      <Alert tone="e" text={f.message} />
      <Card>
        <Field label="Libellé" required placeholder="ex. 2027-2028" {...f.lier('libelle')} />
        <Rangee>
          <Field label="Début" required placeholder="JJ/MM/AAAA" {...f.lier('date_debut')} style={{ flex: 1 }} />
          <Field label="Fin" required placeholder="JJ/MM/AAAA" {...f.lier('date_fin')} style={{ flex: 1 }} />
        </Rangee>
        <View style={{ marginBottom: 14 }}>
          <Check on={v.est_courante} onPress={() => f.changer('est_courante')(!v.est_courante)} label="Saison en cours (remplace la saison courante)" />
        </View>
      </Card>
      <Boutons navigation={navigation} f={f} enregistrer={enregistrer} />
    </Ecran>
  );
}
