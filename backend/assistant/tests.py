"""Tests de l'assistant football : recherche documentaire, confidentialité des mineurs, appel au modèle simulé."""
import os
from datetime import date
from types import SimpleNamespace
from unittest import mock

from core.tests import Base
from joueurs.models import Joueur
from statistiques.models import StatistiqueJoueur

from . import rag
from .rag import Passage, classer


def reponse_modele(texte, arret='end_turn'):
    return SimpleNamespace(stop_reason=arret, content=[SimpleNamespace(type='text', text=texte)])


class RechercheTests(Base):
    def test_la_definition_du_ppda_arrive_en_premier(self):
        trouves = classer('Que mesure le PPDA ?', rag.passages_connaissances())
        self.assertTrue(trouves)
        self.assertIn('PPDA', trouves[0].titre + trouves[0].texte)

    def test_aucun_passage_si_rien_ne_correspond(self):
        self.assertEqual(classer('zzzz qqqq', [Passage('K1', 'Corner', 'Un corner est un coup de pied.')]), [])

    def test_accents_et_majuscules_ignores(self):
        passages = [Passage('K1', 'Hors-jeu', 'Règle du hors-jeu'), Passage('K2', 'Corner', 'Un corner')]
        self.assertEqual(classer('HORS JEU règle', passages)[0].identifiant, 'K1')

    def stat(self, joueur, minutes=900):
        return StatistiqueJoueur.objects.create(joueur=joueur, saison=self.saison, minutes_jouees=minutes,
                                                matchs_joues=10, buts_p90=0.5, centiles={'buts_p90': 80})

    def test_mineurs_et_joueurs_peu_utilises_exclus(self):
        adulte, mineur, peu = self.effectifs[self.ej.id][:3]
        Joueur.objects.filter(pk=mineur.pk).update(date_naissance=date(date.today().year - 15, 1, 1))
        self.stat(adulte)
        self.stat(mineur)
        self.stat(peu, minutes=100)
        ids = {p.identifiant for p in rag.passages_joueurs(self.admin)}
        self.assertEqual(ids, {f'J{adulte.id}'})


class DonneesExternesTests(Base):
    def test_valeurs_transcrites(self):
        from . import donnees_externes as d
        self.assertEqual(d.MATCHS['France']['xg'], (0.22, 1.66))
        self.assertEqual(d.MATCHS['Arabie saoudite']['receptions_dernier_tiers'], (167, 50))
        self.assertTrue(all(len(v) == 2 for m in d.MATCHS.values() for v in m.values()))
        self.assertEqual(set(d.INDICATEURS), set(d.MATCHS['Uruguay']))

    def test_la_recherche_retrouve_le_match(self):
        trouves = classer("statistiques Haïti U-17 contre l'Uruguay", rag.passages_connaissances())
        self.assertTrue(any('Uruguay' in p.titre for p in trouves))

    def test_coupe_du_monde(self):
        from . import donnees_externes as d
        self.assertEqual(len(d.EQUIPES_CM), 6)
        self.assertEqual(len(d.JOUEURS_CM), 20)
        self.assertIn('8,7 km', d._fiche_joueur(d.JOUEURS_CM[0]))       # Mbappé : 8,7 km, 35,3 km/h
        self.assertIn('35,3 km/h', d._fiche_joueur(d.JOUEURS_CM[0]))
        self.assertIn('non vérifiés', d._fiche_equipe(d.EQUIPES_CM[0]))
        trouves = classer('distance de Mbappé', rag.passages_connaissances())
        self.assertTrue(any('Mbapp' in p.titre for p in trouves))

    def test_aucun_score_invente(self):
        from . import donnees_externes as d
        texte = ' '.join(p[2] for p in d.passages())
        self.assertNotIn('gagne', texte)
        self.assertNotIn('victoire', texte.lower())


class VueAssistantTests(Base):
    def poser(self, question='Que mesure le PPDA ?', **extra):
        return self.client.post('/api/assistant/ia/', {'question': question, **extra}, format='json')

    def test_authentification_exigee(self):
        self.assertEqual(self.poser().status_code, 401)

    def test_question_vide_refusee(self):
        self.comme(self.analyste)
        self.assertEqual(self.poser('  ').status_code, 400)

    def test_sans_cle_api_le_service_est_indisponible(self):
        self.comme(self.analyste)
        with mock.patch.dict(os.environ, {'ANTHROPIC_API_KEY': ''}):
            self.assertEqual(self.poser().status_code, 503)

    def test_reponse_avec_sources_et_sans_donnees_de_mineur(self):
        mineur = self.effectifs[self.ej.id][0]
        Joueur.objects.filter(pk=mineur.pk).update(date_naissance=date(date.today().year - 15, 1, 1))
        StatistiqueJoueur.objects.create(joueur=mineur, saison=self.saison, minutes_jouees=900, matchs_joues=10,
                                         centiles={'buts_p90': 90})
        self.comme(self.analyste)
        faux = mock.MagicMock()
        premier = classer('Que mesure le PPDA ?', rag.passages_connaissances())[0].identifiant
        faux.return_value.beta.messages.create.return_value = reponse_modele(f'Le PPDA mesure le pressing [{premier}].')
        with mock.patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'cle-de-test'}), \
                mock.patch('assistant.views.anthropic.Anthropic', faux):
            r = self.poser(f'Que mesure le PPDA ? Et {mineur.nom} ?')
        self.assertEqual(r.status_code, 200)
        self.assertIn('pressing', r.data['reponse'])
        self.assertEqual([s['id'] for s in r.data['sources']], [premier])
        envoye = faux.return_value.beta.messages.create.call_args.kwargs
        contenu = envoye['messages'][-1]['content']
        self.assertNotIn(mineur.nom_complet, contenu)  # aucune donnée de mineur envoyée au service externe
        self.assertEqual(envoye['model'], 'claude-opus-5-5')
        self.assertNotIn('temperature', envoye)

    def test_refus_du_modele(self):
        self.comme(self.analyste)
        faux = mock.MagicMock()
        faux.return_value.beta.messages.create.return_value = reponse_modele('', arret='refusal')
        with mock.patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'cle-de-test'}), \
                mock.patch('assistant.views.anthropic.Anthropic', faux):
            r = self.poser()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['sources'], [])
