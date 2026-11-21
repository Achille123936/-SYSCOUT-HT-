import React, { useEffect, useState } from 'react';
import { Text, FlatList, StyleSheet, View } from 'react-native';
import { api, exporterPdf } from '../api';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import { RECOMMANDATIONS, TON_ETAT, aujourdhuiFR, dateFR, dateHeureFR, dateISO, nombre } from '../constantes';
import { Ecran, Etat, Card, Info, Field, Select, Segmented, Button, Badge, Alert, Ligne, Rangee, Avatar, BoutonEntete, confirmer, useChargement, useFormulaire, Cellule, useListeColonnes } from '../components/ui';
import SelecteurJoueur from '../components/SelecteurJoueur';

const FILTRES = [[null, 'Tous'], ['BROUILLON', 'Brouillons'], ['SOUMIS', 'Soumis'], ['RENVOYE', 'Renvoyés'], ['VALIDE', 'Validés']];

// Liste des rapports visibles selon le rôle (RG8 : les clubs clients ne voient que les rapports validés)
export function RapportsScreen({ navigation }) {
  const { a } = useAuth();
  const [etatRapport, setEtatRapport] = useState(a('DIRECTEUR') ? 'SOUMIS' : null);
  const [selecteur, setSelecteur] = useState(false);
  const colonnes = useListeColonnes();
  const { donnees, ...etat } = useChargement(() => api.get('/rapports/', { etat: etatRapport, page_size: 100 }), [etatRapport]);
  const filtres = a('SCOUT', 'DIRECTEUR', 'ADMIN') ? FILTRES.filter(([cle]) => cle !== 'BROUILLON' || a('SCOUT')) : null;

  return (
    <Ecran titre="Rapports" sousTitre={a('DIRECTEUR') && etatRapport === 'SOUMIS' ? 'Rapports à valider' : 'Rapports de scouting'} defilant={false}
      droite={a('SCOUT') ? <BoutonEntete titre="+ Nouveau" onPress={() => setSelecteur(true)} /> : null}>
      {filtres ? <Segmented options={filtres} value={etatRapport} onChange={setEtatRapport} /> : null}
      <Etat {...etat} donnees={donnees} vide={donnees && !donnees.results.length ? 'Aucun rapport.' : null} />
      <FlatList
        {...colonnes}
        data={donnees?.results || []}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ paddingBottom: 14 }}
        renderItem={({ item: r }) => (
          <Cellule>
            <Ligne
              titre={`${r.joueur_nom} · ${r.note}/10`}
              sousTitre={`${r.recommandation_libelle} · ${r.scout_nom} · ${dateFR(r.date_rapport)}`}
              gauche={<Avatar nom={r.joueur_nom} />}
              droite={<Badge text={r.etat_libelle} tone={TON_ETAT[r.etat]} />}
              onPress={() => navigation.navigate('RapportDetail', { id: r.id })}
            />
          </Cellule>
        )}
      />
      <SelecteurJoueur visible={selecteur} titre="Rapport sur quel joueur ?" onFermer={() => setSelecteur(false)}
        onChoisir={(joueur) => { setSelecteur(false); navigation.navigate('RapportForm', { joueur }); }} />
    </Ecran>
  );
}

// CU12 — Valider un rapport de scouting (directeur sportif) ; soumission et correction par le scout
export function RapportDetailScreen({ navigation, route }) {
  const { id } = route.params;
  const { a, utilisateur } = useAuth();
  const [commentaire, setCommentaire] = useState('');
  const [message, setMessage] = useState(null);
  const [envoi, setEnvoi] = useState(null);
  const { donnees: r, recharger, ...etat } = useChargement(() => api.get(`/rapports/${id}/`), [id]);
  const auteur = r && r.scout === utilisateur.id && ['BROUILLON', 'RENVOYE'].includes(r.etat);

  const agir = async (chemin, corps, retour) => {
    setEnvoi(chemin);
    setMessage(null);
    try {
      if (chemin === 'supprimer') await api.delete(`/rapports/${id}/`);
      else await api.post(`/rapports/${id}/${chemin}/`, corps);
      if (retour) navigation.goBack(); else recharger();
    } catch (e) { setMessage(e.message); } finally { setEnvoi(null); }
  };
  const exporter = async () => {
    try { await exporterPdf({ type: 'rapport', id }); } catch (e) { setMessage(e.message); }
  };

  return (
    <Ecran titre={r ? r.joueur_nom : 'Rapport'} sousTitre={r ? `Rapport de scouting · ${r.joueur_club}` : null}
      droite={r ? <Badge text={r.etat_libelle} tone={TON_ETAT[r.etat]} /> : null}>
      <Etat {...etat} recharger={recharger} donnees={r} />
      {r ? (
        <>
          <Alert tone="e" text={message} />
          {r.etat === 'RENVOYE' ? <Alert text={`Rapport renvoyé par ${r.valide_par_nom || 'le directeur sportif'} : ${r.commentaire_validation}`} /> : null}
          <Card>
            <View style={st.note}>
              <Text style={st.noteV}>{r.note}<Text style={st.noteSur}>/10</Text></Text>
              <Badge text={r.recommandation_libelle} tone={{ RECRUTER: 'g', SUIVRE: 'b', NE_PAS_RETENIR: 'r' }[r.recommandation]} />
            </View>
            <Info libelle="Joueur" valeur={<Text style={st.lien} onPress={() => navigation.navigate('JoueurDetail', { id: r.joueur })}>{r.joueur_nom} ›</Text>} />
            <Info libelle="Scout" valeur={r.scout_nom} />
            <Info libelle="Date" valeur={dateFR(r.date_rapport)} />
            <Info libelle="Match observé" valeur={r.match_libelle} />
            {r.valide_par_nom && r.etat !== 'RENVOYE' ? <Info libelle="Validé par" valeur={`${r.valide_par_nom} · ${dateHeureFR(r.date_validation)}`} /> : null}
          </Card>
          <Card title="Forces"><Text style={st.texte}>{r.forces}</Text></Card>
          <Card title="Faiblesses"><Text style={st.texte}>{r.faiblesses}</Text></Card>
          {r.commentaire_validation && r.etat !== 'RENVOYE' ? <Card title="Commentaire du directeur sportif"><Text style={st.texte}>{r.commentaire_validation}</Text></Card> : null}

          {auteur ? (
            <>
              <Button title="Soumettre au directeur sportif" style={{ marginBottom: 10 }} loading={envoi === 'soumettre'} onPress={() => agir('soumettre')} />
              <Rangee style={{ marginBottom: 10 }}>
                <Button title="Modifier" kind="secondary" style={{ flex: 1 }} onPress={() => navigation.navigate('RapportForm', { id })} />
                <Button title="Supprimer" kind="danger" style={{ flex: 1 }} loading={envoi === 'supprimer'}
                  onPress={async () => { if (await confirmer('Supprimer', 'Voulez-vous vraiment supprimer ce rapport ?')) agir('supprimer', null, true); }} />
              </Rangee>
            </>
          ) : null}

          {a('DIRECTEUR') && r.etat === 'SOUMIS' ? (
            <Card title="Décision du directeur sportif">
              <Field label="Commentaire (obligatoire pour renvoyer)" multiline value={commentaire} onChangeText={setCommentaire} />
              <Rangee style={{ marginBottom: 12 }}>
                <Button title="Renvoyer" kind="secondary" style={{ flex: 1 }} loading={envoi === 'renvoyer'} onPress={() => agir('renvoyer', { commentaire })} />
                <Button title="Valider" kind="success" style={{ flex: 1.4 }} loading={envoi === 'valider'} onPress={() => agir('valider', { commentaire })} />
              </Rangee>
            </Card>
          ) : null}

          {r.etat === 'VALIDE' || r.etat === 'ARCHIVE' ? <Button title="Exporter en PDF" style={{ marginBottom: 10 }} onPress={exporter} /> : null}
          {a('DIRECTEUR', 'ADMIN') && r.etat === 'VALIDE' ? (
            <Button title="Archiver" kind="secondary" style={{ marginBottom: 10 }} loading={envoi === 'archiver'}
              onPress={async () => { if (await confirmer('Archiver', 'Archiver ce rapport ? Les clubs clients ne le verront plus.')) agir('archiver'); }} />
          ) : null}
        </>
      ) : null}
    </Ecran>
  );
}

const NOTES = Array.from({ length: 11 }, (_, i) => [i, String(i)]);

// CU11 — Rédiger un rapport de scouting
export function RapportFormScreen({ navigation, route }) {
  const id = route.params?.id;
  const [joueur, setJoueur] = useState(route.params?.joueur || null);
  const [matchs, setMatchs] = useState([]);
  const [stat, setStat] = useState(null);
  const f = useFormulaire({ match_observe: null, date_rapport: aujourdhuiFR(), forces: '', faiblesses: '', note: null, recommandation: null });
  const v = f.valeurs;

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await api.get(`/rapports/${id}/`);
        setJoueur({ id: r.joueur, nom_complet: r.joueur_nom, club_nom: r.joueur_club });
        f.setValeurs({ match_observe: r.match_observe, date_rapport: dateFR(r.date_rapport), forces: r.forces, faiblesses: r.faiblesses, note: r.note, recommandation: r.recommandation });
      } catch (e) { f.setMessage(e.message); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // CU11 étape 2 : formulaire prérempli avec le joueur et ses statistiques récentes
  useEffect(() => {
    if (!joueur) return;
    (async () => {
      try {
        const [fiche, liste] = await Promise.all([api.get(`/joueurs/${joueur.id}/radar/`), api.tout('/matchs/', { joueur: joueur.id })]);
        setStat(fiche.statistique);
        setMatchs(liste.map((m) => [m.id, `J${m.journee} · ${m.domicile_nom} ${m.score_domicile}–${m.score_exterieur} ${m.exterieur_nom}`]));
      } catch (e) { f.setMessage(e.message); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joueur?.id]);

  const enregistrer = (soumettre) => f.soumettre(async () => {
    const erreurs = {};
    const date = dateISO(v.date_rapport);
    if (!date) erreurs.date_rapport = 'Date invalide (JJ/MM/AAAA)';
    if (!v.forces.trim()) erreurs.forces = 'Champ obligatoire';
    if (!v.faiblesses.trim()) erreurs.faiblesses = 'Champ obligatoire';
    if (v.note === null) erreurs.note = 'Choisissez une note de 0 à 10';
    if (!v.recommandation) erreurs.recommandation = 'Champ obligatoire';
    if (Object.keys(erreurs).length) {
      f.setErreurs(erreurs);
      f.setMessage('Complétez les champs signalés en rouge.');
      return;
    }
    const donnees = { joueur: joueur.id, match_observe: v.match_observe, date_rapport: date, forces: v.forces.trim(), faiblesses: v.faiblesses.trim(), note: v.note, recommandation: v.recommandation };
    const rapport = id ? await api.patch(`/rapports/${id}/`, donnees) : await api.post('/rapports/', donnees);
    if (soumettre) await api.post(`/rapports/${rapport.id}/soumettre/`);
    if (id) navigation.goBack();
    else navigation.replace('RapportDetail', { id: rapport.id });
  });

  return (
    <Ecran titre={id ? 'Modifier le rapport' : 'Nouveau rapport'} sousTitre={joueur ? `${joueur.nom_complet} · ${joueur.club_nom}` : null}>
      <Alert tone="e" text={f.message} />
      {stat ? (
        <Card title="Statistiques récentes du joueur">
          <View style={st.stats}>
            {[['Indice', stat.indice_performance != null ? Math.round(stat.indice_performance) : null], ['Minutes', stat.minutes_jouees], ['Buts', stat.buts], ['xG', stat.xg], ['Passes %', stat.passes_reussies_pct], ['Duels %', stat.duels_gagnes_pct]].map(([nom, valeur]) => (
              <View key={nom} style={st.stat}><Text style={st.statV}>{nombre(valeur)}</Text><Text style={st.statL}>{nom}</Text></View>
            ))}
          </View>
        </Card>
      ) : null}
      <Card>
        <Select label="Match observé" options={matchs} value={v.match_observe} onChange={f.changer('match_observe')} placeholder="Aucun"
          vide="Ce joueur ne figure dans aucune composition." state={f.erreurs.match_observe ? 'error' : undefined} hint={f.erreurs.match_observe} />
        <Field label="Date du rapport" required placeholder="JJ/MM/AAAA" {...f.lier('date_rapport')} />
        <Field label="Forces" required multiline {...f.lier('forces')} />
        <Field label="Faiblesses" required multiline {...f.lier('faiblesses')} />
        <Select label="Note sur 10" required options={NOTES} value={v.note} onChange={f.changer('note')}
          state={f.erreurs.note ? 'error' : undefined} hint={f.erreurs.note} />
        <Segmented label="Recommandation *" options={RECOMMANDATIONS} value={v.recommandation} onChange={f.changer('recommandation')} />
        {f.erreurs.recommandation ? <Text style={st.erreur}>{f.erreurs.recommandation}</Text> : null}
      </Card>
      <Button title="Soumettre" style={{ marginBottom: 10 }} onPress={() => enregistrer(true)} loading={f.envoi} />
      <Rangee style={{ marginBottom: 10 }}>
        <Button title="Annuler" kind="secondary" style={{ flex: 1 }} onPress={navigation.goBack} />
        <Button title="Enregistrer le brouillon" kind="secondary" style={{ flex: 1.6 }} onPress={() => enregistrer(false)} />
      </Rangee>
    </Ecran>
  );
}

const st = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  noteV: { fontSize: 32, color: C.navy, ...F.bold },
  noteSur: { fontSize: 15, color: C.muted, ...F.medium },
  lien: { fontSize: 13, color: C.blue, ...F.semi },
  texte: { fontSize: 13.5, lineHeight: 20, color: C.ink2, marginBottom: 10, ...F.regular },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  stat: { flexGrow: 1, flexBasis: '30%', backgroundColor: C.bg, borderRadius: 10, padding: 9, alignItems: 'center' },
  statV: { fontSize: 16, color: C.navy, ...F.bold },
  statL: { fontSize: 11, color: C.muted, ...F.regular },
  erreur: { fontSize: 11.5, color: C.red, marginTop: -6, marginBottom: 12, ...F.regular },
});
