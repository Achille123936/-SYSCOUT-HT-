import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../api';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import { GROUPES, dateFR, nombre } from '../constantes';
import { AppHeader, Colonnes, Ecran, Etat, Card, Select, Badge, Ligne, Avatar, useChargement } from '../components/ui';

const TON = { V: 'g', N: 'a', D: 'r' };

// Tableau de bord de l'entraîneur : bilan de la saison, forme, derniers résultats et effectif de son équipe
export function EquipeScreen({ navigation, route }) {
  const { utilisateur } = useAuth();
  const [club, setClub] = useState(route.params?.id || utilisateur.club || null);
  const liste = useChargement(() => api.get('/equipes/'));
  const choisi = club || liste.donnees?.clubs[0]?.id || null;
  const { donnees: d, ...etat } = useChargement(() => (choisi ? api.get(`/equipes/${choisi}/`) : null), [choisi]);
  const b = d?.bilan;

  return (
    <Ecran titre={d ? d.club.nom : 'Équipe'} sousTitre={d ? `${d.club.division} · saison ${d.saison}` : "Tableau de bord de l'entraîneur"}>
      <Select label="Équipe" required value={choisi} onChange={setClub}
        options={(liste.donnees?.clubs || []).map((c) => [c.id, `${c.nom} · ${c.division}${c.id === liste.donnees.mon_club ? ' (mon club)' : ''}`])} />
      <Etat {...etat} erreur={etat.erreur || liste.erreur} donnees={d} />
      {d ? (
        <>
          <View style={st.grille}>
            {[['Points', b.points], ['Joués', b.joues], ['V – N – D', `${b.victoires} – ${b.nuls} – ${b.defaites}`], ['Buts', `${b.buts_pour} : ${b.buts_contre}`],
              ['Différence', b.difference > 0 ? `+${b.difference}` : b.difference], ['Possession moy.', b.possession_moyenne == null ? '—' : `${nombre(b.possession_moyenne)} %`]].map(([nom, valeur]) => (
              <View key={nom} style={[st.carte, { minWidth: 96 }]}><Text style={st.valeur}>{valeur}</Text><Text style={st.libelle}>{nom}</Text></View>
            ))}
          </View>

          <Colonnes>
          <Card title="Forme récente" badge={d.matchs_non_codes ? <Badge text={`${d.matchs_non_codes} match(s) non codé(s)`} tone="a" /> : null}>
            {d.forme.length ? (
              <View style={st.forme}>{d.forme.map((issue, i) => <Badge key={i} text={issue} tone={TON[issue]} style={st.pastille} />)}</View>
            ) : <Text style={st.vide}>Aucun match validé cette saison.</Text>}
            {d.resultats.map((r) => (
              <Pressable key={r.id} style={st.rang} onPress={() => navigation.navigate('MatchDetail', { id: r.id })}>
                <Badge text={r.issue} tone={TON[r.issue]} />
                <Text style={st.adversaire} numberOfLines={1}>J{r.journee} · {r.domicile ? 'contre' : 'chez'} {r.adversaire}</Text>
                <Text style={st.score}>{r.score}</Text>
                <Text style={st.date}>{dateFR(r.date_match)}</Text>
              </Pressable>
            ))}
            <View style={{ height: 8 }} />
          </Card>

          {d.meilleur_buteur || d.meilleur_indice ? (
            <Card title="Joueurs clés">
              {d.meilleur_buteur ? <Ligne titre={d.meilleur_buteur.nom} sousTitre={`Meilleur buteur · ${d.meilleur_buteur.buts} but(s)`} gauche={<Avatar nom={d.meilleur_buteur.nom} taille={36} />}
                onPress={() => navigation.navigate('JoueurDetail', { id: d.meilleur_buteur.joueur })} /> : null}
              {d.meilleur_indice ? <Ligne titre={d.meilleur_indice.nom} sousTitre={`Meilleur indice de performance · ${Math.round(d.meilleur_indice.indice_performance)}/100`}
                gauche={<Avatar nom={d.meilleur_indice.nom} taille={36} />} onPress={() => navigation.navigate('JoueurDetail', { id: d.meilleur_indice.joueur })} /> : null}
              <View style={{ height: 6 }} />
            </Card>
          ) : null}

          {GROUPES.map(([groupe, nom]) => {
            const joueurs = d.effectif.filter((j) => j.groupe === groupe);
            if (!joueurs.length) return null;
            return (
              <Card key={groupe} title={nom} badge={<Badge text={String(joueurs.length)} />}>
                <View style={st.entete}>
                  <Text style={[st.th, st.nom]}>JOUEUR</Text>
                  {['MIN', 'MJ', 'BUTS', 'PD', 'INDICE'].map((c) => <Text key={c} style={st.th}>{c}</Text>)}
                </View>
                {joueurs.map((j) => (
                  <Pressable key={j.joueur} style={st.rang} onPress={() => navigation.navigate('JoueurDetail', { id: j.joueur })}>
                    <Text style={[st.td, st.nom]} numberOfLines={1}>{j.nom} <Text style={{ color: C.muted }}>{j.poste} · {j.age}</Text></Text>
                    <Text style={st.td}>{j.minutes_jouees}</Text>
                    <Text style={st.td}>{j.matchs_joues}</Text>
                    <Text style={st.td}>{j.buts}</Text>
                    <Text style={st.td}>{j.passes_decisives}</Text>
                    <Text style={[st.td, { color: C.blue, ...F.semi }]}>{j.indice_performance == null ? '—' : Math.round(j.indice_performance)}</Text>
                  </Pressable>
                ))}
                <View style={{ height: 8 }} />
              </Card>
            );
          })}
          </Colonnes>
        </>
      ) : null}
    </Ecran>
  );
}

const SUGGESTIONS = ['Meilleurs buteurs', 'Meilleurs défenseurs', 'Derniers résultats', 'Matchs à coder'];

// Assistant : répond aux questions à partir des données que l'utilisateur a le droit de voir
export function AssistantScreen() {
  const navigation = useNavigation();
  const { utilisateur } = useAuth();
  const defilement = useRef(null);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [messages, setMessages] = useState([
    { id: 0, moi: false, texte: `Bonjour ${utilisateur.prenom}. Posez-moi une question sur un joueur, une équipe, les classements ou les matchs.`, liens: [] },
  ]);

  const envoyer = async (question) => {
    const q = (question ?? texte).trim();
    if (!q || envoi) return;
    setTexte('');
    setEnvoi(true);
    setMessages((m) => [...m, { id: m.length, moi: true, texte: q, liens: [] }]);
    let reponse;
    try {
      reponse = await api.post('/assistant/', { question: q });
    } catch (e) {
      reponse = { reponse: `Je n'ai pas pu répondre : ${e.message}`, liens: [] };
    }
    setMessages((m) => [...m, { id: m.length, moi: false, texte: reponse.reponse, liens: reponse.liens }]);
    setEnvoi(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader title="Assistant" subtitle="Questions sur les joueurs, les équipes et les matchs" back onBack={navigation.goBack} />
      <ScrollView ref={defilement} style={{ flex: 1 }} contentContainerStyle={st.fil} keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => defilement.current?.scrollToEnd({ animated: true })}>
        {messages.map((m) => (
          <View key={m.id} style={[st.bulle, m.moi ? st.bulleMoi : st.bulleLui]}>
            <Text style={[st.message, m.moi && { color: '#fff' }]}>{m.texte}</Text>
            {m.liens.map((lien) => (
              <Pressable key={lien.ecran + JSON.stringify(lien.params)} style={st.lien} onPress={() => navigation.navigate(lien.ecran, lien.params)}>
                <Text style={st.lienTxt}>{lien.titre} ›</Text>
              </Pressable>
            ))}
          </View>
        ))}
        {envoi ? <ActivityIndicator color={C.blue} style={{ alignSelf: 'flex-start', margin: 8 }} /> : null}
      </ScrollView>
      <View style={st.suggestions}>
        {SUGGESTIONS.map((sug) => (
          <Pressable key={sug} style={st.suggestion} onPress={() => envoyer(sug)}><Text style={st.suggestionTxt}>{sug}</Text></Pressable>
        ))}
      </View>
      <View style={st.saisie}>
        <TextInput style={st.champ} value={texte} onChangeText={setTexte} placeholder="Votre question…" placeholderTextColor="#9ca3af"
          onSubmitEditing={() => envoyer()} returnKeyType="send" accessibilityLabel="Votre question" />
        <Pressable style={[st.bouton, (!texte.trim() || envoi) && { opacity: 0.5 }]} onPress={() => envoyer()} accessibilityLabel="Envoyer">
          <Text style={st.boutonTxt}>Envoyer</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  carte: { flexGrow: 1, flexBasis: '30%', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingVertical: 12, alignItems: 'center' },
  valeur: { fontSize: 19, color: C.navy, ...F.bold },
  libelle: { fontSize: 11, color: C.muted, marginTop: 2, ...F.medium },
  forme: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  pastille: { minWidth: 28, alignItems: 'center' },
  rang: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f1f3' },
  adversaire: { flex: 1, fontSize: 13, color: C.ink, ...F.medium },
  score: { fontSize: 13.5, color: C.navy, ...F.bold },
  date: { fontSize: 11, color: C.muted, width: 70, textAlign: 'right', ...F.regular },
  entete: { flexDirection: 'row', gap: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  th: { flex: 1, fontSize: 9.5, color: C.muted, textAlign: 'right', ...F.semi },
  td: { flex: 1, fontSize: 12.5, color: C.ink, textAlign: 'right', ...F.regular },
  nom: { flex: 3.4, textAlign: 'left' },
  vide: { color: C.muted, fontSize: 13, paddingVertical: 10, ...F.regular },
  fil: { padding: 14, gap: 8, width: '100%', maxWidth: 760, alignSelf: 'center' },
  bulle: { maxWidth: '86%', borderRadius: 14, padding: 11 },
  bulleMoi: { alignSelf: 'flex-end', backgroundColor: C.blue },
  bulleLui: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  message: { fontSize: 14, lineHeight: 20, color: C.ink, ...F.regular },
  lien: { marginTop: 8, backgroundColor: C.blue50, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignSelf: 'flex-start' },
  lienTxt: { fontSize: 13, color: C.blue, ...F.semi },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 8, width: '100%', maxWidth: 760, alignSelf: 'center' },
  suggestion: { borderWidth: 1, borderColor: C.line2, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  suggestionTxt: { fontSize: 12.5, color: C.ink2, ...F.medium },
  saisie: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
  champ: { flex: 1, height: 44, borderWidth: 1, borderColor: C.line2, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: C.ink, outlineStyle: 'none' },
  bouton: { height: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.blue, justifyContent: 'center' },
  boutonTxt: { color: '#fff', fontSize: 14, ...F.semi },
});
