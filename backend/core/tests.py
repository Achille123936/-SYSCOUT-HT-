"""Tests des exigences du SEL (partie IV). Chaque test porte la référence de son exigence : Test_EF x.y."""
import http.server
import shutil
import socket
import tempfile
import threading
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest import mock

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from .models import (Abonnement, Camera, Club, Competition, Composition, EtatAbonnement, EtatMatch, Evenement, Facture,
                     Formule, HistoriqueClub, Joueur, Match, OperationAudit, Paiement, PropositionIA, RapportScouting,
                     Role, Saison, StatistiqueJoueur, Utilisateur, ValidationEvenement)
from .services import calculer_xg, mettre_a_jour_abonnements, recalculer_saison

MDP = 'Syscout2026'
MEDIA = tempfile.mkdtemp(prefix='syscout_tests_')
ONZE = ['G', 'DC', 'DC', 'DL', 'DL', 'MD', 'MC', 'MC', 'MO', 'AIL', 'BU', 'BU', 'MC']  # 11 titulaires + 2


@override_settings(MEDIA_ROOT=MEDIA)
class Base(APITestCase):
    """Jeu d'essai : une saison, une compétition de D1 à deux clubs de 13 joueurs, un compte par rôle."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    @classmethod
    def setUpTestData(cls):
        cls.saison = Saison.objects.create(libelle='2026-2027', date_debut=date(2026, 8, 1),
                                           date_fin=date(2027, 6, 30), est_courante=True)
        cls.ej = Club.objects.create(nom='Étoile de Jacmel FC', sigle='EJ', ville='Jacmel', division='D1')
        cls.usc = Club.objects.create(nom='US des Cayes', sigle='USC', ville='Les Cayes', division='D1')
        cls.d2 = Club.objects.create(nom='Colibri de Hinche', sigle='CDH', ville='Hinche', division='D2')
        cls.ligue = Competition.objects.create(nom='Ligue Haïtienne D1', saison=cls.saison,
                                               date_debut=date(2026, 8, 8), date_fin=date(2027, 5, 30))
        cls.ligue.clubs.set([cls.ej, cls.usc])
        cls.effectifs = {}
        for club in (cls.ej, cls.usc):
            cls.effectifs[club.id] = [
                Joueur.objects.create(nom=f'{club.sigle}{i}', prenom='Joueur', poste=poste, club_actuel=club,
                                      date_naissance=date(2000, 1, 1 + i), telephone='+509 3700 0000',
                                      adresse='Jacmel')
                for i, poste in enumerate(ONZE)]
        cls.joueur_d2 = Joueur.objects.create(nom='Hinche', prenom='Joueur', poste='BU', club_actuel=cls.d2,
                                              date_naissance=date(1999, 4, 4))

        def compte(identifiant, role, **extra):
            return Utilisateur.objects.create_user(identifiant, MDP, nom=identifiant.title(), prenom='Test',
                                                   role=role, courriel=f'{identifiant}@test.ht', **extra)

        cls.admin = compte('admin', Role.ADMIN)
        cls.analyste = compte('analyste', Role.ANALYSTE)
        cls.analyste2 = compte('analyste2', Role.ANALYSTE)
        cls.scout = compte('scout', Role.SCOUT)
        cls.directeur = compte('directeur', Role.DIRECTEUR)
        cls.agent = compte('agent', Role.AGENT)
        cls.client_ej = compte('client', Role.CLIENT, club=cls.ej)
        cls.pro = Formule.objects.create(nom='Pro', prix_mensuel_htg=Decimal('15000'), nombre_comptes=5,
                                         divisions_incluses=['D1', 'D2'], rapports_inclus=True)
        cls.essentiel = Formule.objects.create(nom='Essentiel', prix_mensuel_htg=Decimal('5000'),
                                               divisions_incluses=['D1'], rapports_inclus=False)

    # ---- aides
    def comme(self, utilisateur):
        self.client.force_authenticate(utilisateur)

    def lignes_composition(self, entrees=None):
        """11 titulaires et 2 remplaçants par équipe ; `entrees` = {joueur_id: minute d'entrée}."""
        entrees = entrees or {}
        return [{'joueur': j.id, 'est_titulaire': i < 11, 'numero_maillot': i + 1,
                 'minute_entree': entrees.get(j.id)}
                for effectif in self.effectifs.values() for i, j in enumerate(effectif)]

    def donnees_match(self, **extra):
        return {'competition': self.ligue.id, 'journee': 1, 'date_match': '2026-10-05T15:00:00-04:00',
                'stade': 'Parc Pinchinat', 'club_domicile': self.ej.id, 'club_exterieur': self.usc.id,
                'score_domicile': 2, 'score_exterieur': 1, 'compositions': self.lignes_composition(), **extra}

    def creer_match(self, etat=EtatMatch.VIDEO_IMPORTEE, score=(2, 1), journee=1):
        match = Match.objects.create(
            competition=self.ligue, journee=journee, club_domicile=self.ej, club_exterieur=self.usc,
            date_match=timezone.make_aware(datetime(2026, 10, 5, 15)), score_domicile=score[0],
            score_exterieur=score[1], video_url='https://exemple.ht/match.mp4', etat=etat)
        for club_id, effectif in self.effectifs.items():
            for i, joueur in enumerate(effectif):
                Composition.objects.create(match=match, joueur=joueur, club_id=club_id, est_titulaire=i < 11)
        return match

    def coder(self, match, joueur, type_action, minute=10, resultat=True, **extra):
        return self.client.post('/api/evenements/', {
            'match': match.id, 'joueur': joueur.id, 'type_action': type_action, 'minute': minute,
            'temps_video': minute * 60, 'zone_x': 88, 'zone_y': 50, 'resultat': resultat, **extra}, format='json')

    def coder_les_buts(self, match):
        """Code autant de buts que le score : le 10e joueur (AIL) pour le domicile, le 11e (BU) en face."""
        for _ in range(match.score_domicile):
            self.assertEqual(self.coder(match, self.effectifs[self.ej.id][9], 'BUT').status_code, 201)
        for _ in range(match.score_exterieur):
            self.assertEqual(self.coder(match, self.effectifs[self.usc.id][10], 'BUT').status_code, 201)

    def abonner(self, club=None, formule=None):
        self.comme(self.agent)
        r = self.client.post('/api/abonnements/', {'club': (club or self.ej).id, 'formule': (formule or self.pro).id,
                                                   'date_debut': date.today().isoformat(), 'duree_mois': 12},
                             format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    def payer(self, facture, montant=None):
        self.comme(self.agent)
        return self.client.post('/api/paiements/', {'facture': facture['id'], 'mode': 'ESPECES',
                                                    'montant_htg': montant or facture['solde_du']}, format='json')


# ================================================================ EF 1 — S'authentifier
class Test_EF1_Authentification(Base):
    def connecter(self, nom='analyste', mdp=MDP):
        return self.client.post('/api/auth/connexion/', {'nom_utilisateur': nom, 'mot_de_passe': mdp}, format='json')

    def test_EF1_1_identifiants_exiges(self):
        """Test_EF1.1 : l'interface envoie nom d'utilisateur et mot de passe ; sans eux, pas d'accès."""
        self.assertEqual(self.connecter('', '').status_code, 401)
        self.assertEqual(self.client.get('/api/joueurs/').status_code, 401)

    def test_EF1_2_connexion_ouvre_le_tableau_de_bord_du_role(self):
        """Test_EF1.2"""
        r = self.connecter()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['utilisateur']['role'], 'ANALYSTE')
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + r.data['jeton'])
        tableau = self.client.get('/api/tableau-de-bord/')
        self.assertEqual(tableau.status_code, 200)
        self.assertIn('Matchs à coder', [c['libelle'] for c in tableau.data['cartes']])
        self.assertTrue(OperationAudit.objects.filter(action='CONNEXION', utilisateur=self.analyste).exists())

    def test_EF1_2_identifiants_incorrects(self):
        r = self.connecter(mdp='mauvais')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.data['detail'], "Nom d'utilisateur ou mot de passe incorrect.")
        self.assertEqual(self.connecter(nom='inconnu').status_code, 401)

    def test_EF1_3_blocage_apres_5_essais(self):
        """Test_EF1.3"""
        for _ in range(4):
            self.assertEqual(self.connecter(mdp='mauvais').status_code, 401)
        self.assertEqual(self.connecter().status_code, 200)  # un succès remet le compteur à zéro
        for _ in range(5):
            self.connecter(mdp='mauvais')
        self.analyste.refresh_from_db()
        self.assertTrue(self.analyste.bloque)
        self.assertEqual(self.connecter().status_code, 403)  # même avec le bon mot de passe
        self.comme(self.admin)
        self.assertEqual(self.client.post(f'/api/utilisateurs/{self.analyste.id}/debloquer/').status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.connecter().status_code, 200)

    def test_ENF8_session_fermee_apres_20_minutes(self):
        """Test_ENF8.0"""
        jeton = self.connecter().data['jeton']
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + jeton)
        self.assertEqual(self.client.get('/api/auth/moi/').status_code, 200)
        Utilisateur.objects.filter(pk=self.analyste.pk).update(
            derniere_activite=timezone.now() - timedelta(minutes=21))
        self.assertEqual(self.client.get('/api/auth/moi/').status_code, 401)

    def test_ENF8_mot_de_passe_chiffre_et_regles(self):
        self.assertNotIn(MDP, self.analyste.password)
        self.comme(self.analyste)
        for faible in ('court1', 'sanschiffres', '12345678'):
            r = self.client.post('/api/auth/mot-de-passe/', {'ancien': MDP, 'nouveau': faible}, format='json')
            self.assertEqual(r.status_code, 400, faible)
        r = self.client.post('/api/auth/mot-de-passe/', {'ancien': MDP, 'nouveau': 'Nouveau2027'}, format='json')
        self.assertEqual(r.status_code, 200)

    def test_compte_desactive(self):
        Utilisateur.objects.filter(pk=self.scout.pk).update(is_active=False)
        self.assertEqual(self.connecter('scout').status_code, 403)


# ================================================================ EF 2 — Gérer les utilisateurs
class Test_EF2_Utilisateurs(Base):
    NOUVEAU = {'nom_utilisateur': 'nouveau', 'nom': 'Désir', 'prenom': 'Ricardo', 'courriel': 'r.desir@test.ht',
               'telephone': '+509 3711 2222', 'role': 'SCOUT'}

    def test_EF2_1_creer_modifier_desactiver(self):
        """Test_EF2.1"""
        self.comme(self.admin)
        r = self.client.post('/api/utilisateurs/', self.NOUVEAU, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        provisoire = r.data['mot_de_passe_provisoire']
        self.assertEqual(len(mail.outbox), 1)  # courriel d'activation
        self.assertIn(provisoire, mail.outbox[0].body)
        r2 = self.client.patch(f"/api/utilisateurs/{r.data['id']}/", {'telephone': '+509 3799 0000'}, format='json')
        self.assertEqual(r2.data['telephone'], '+509 3799 0000')
        self.assertEqual(self.client.delete(f"/api/utilisateurs/{r.data['id']}/").status_code, 204)
        self.assertFalse(Utilisateur.objects.get(pk=r.data['id']).is_active)  # désactivé, pas supprimé
        self.client.force_authenticate(None)
        r3 = self.client.post('/api/auth/connexion/', {'nom_utilisateur': 'nouveau', 'mot_de_passe': provisoire})
        self.assertEqual(r3.status_code, 403)

    def test_EF2_1_nom_utilisateur_et_courriel_uniques(self):
        self.comme(self.admin)
        r = self.client.post('/api/utilisateurs/', {**self.NOUVEAU, 'nom_utilisateur': 'scout'}, format='json')
        self.assertIn('nom_utilisateur', r.data)
        r = self.client.post('/api/utilisateurs/', {**self.NOUVEAU, 'courriel': 'scout@test.ht'}, format='json')
        self.assertIn('courriel', r.data)

    def test_EF2_2_role_et_privileges(self):
        """Test_EF2.2 : seul l'administrateur gère les comptes ; chaque rôle a ses droits."""
        for utilisateur in (self.analyste, self.scout, self.directeur, self.agent, self.client_ej):
            self.comme(utilisateur)
            self.assertEqual(self.client.get('/api/utilisateurs/').status_code, 403)
            self.assertEqual(self.client.get('/api/audit/').status_code, 403)
        self.comme(self.agent)  # l'agent commercial n'accède pas aux données sportives
        self.assertEqual(self.client.get('/api/joueurs/').status_code, 403)
        self.comme(self.scout)  # le scout n'accède pas aux données commerciales
        self.assertEqual(self.client.get('/api/abonnements/').status_code, 403)

    def test_EF2_2_compte_client_rattache_a_un_club(self):
        self.comme(self.admin)
        r = self.client.post('/api/utilisateurs/', {**self.NOUVEAU, 'role': 'CLIENT'}, format='json')
        self.assertIn('club', r.data)


# ================================================================ EF 3, EF 4 — Clubs et compétitions
class Test_EF3_EF4_Clubs_Competitions(Base):
    CLUB = {'nom': 'Lions du Cap', 'sigle': 'LDC', 'ville': 'Cap-Haïtien', 'departement': 'Nord',
            'stade': 'Parc Saint-Victor', 'division': 'D1'}

    def test_EF3_1_enregistrer_un_club(self):
        """Test_EF3.1"""
        self.comme(self.analyste)
        r = self.client.post('/api/clubs/', self.CLUB, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.client.get('/api/clubs/?q=lions').data['count'], 1)
        self.comme(self.scout)
        self.assertEqual(self.client.post('/api/clubs/', {**self.CLUB, 'nom': 'Autre'}).status_code, 403)

    def test_EF3_2_club_deja_enregistre(self):
        """Test_EF3.2 : même nom et même ville."""
        self.comme(self.analyste)
        r = self.client.post('/api/clubs/', {**self.CLUB, 'nom': 'étoile de jacmel fc', 'ville': 'JACMEL'})
        self.assertEqual(r.status_code, 400)
        self.assertIn('déjà enregistré', str(r.data['nom']))
        r = self.client.post('/api/clubs/', {**self.CLUB, 'nom': 'Étoile de Jacmel FC', 'ville': 'Marigot'})
        self.assertEqual(r.status_code, 201)  # même nom, autre ville

    def test_EF4_1_competition_liee_a_une_saison(self):
        """Test_EF4.1"""
        self.comme(self.admin)
        donnees = {'nom': "Coupe d'Haïti", 'type': 'COUPE', 'saison': self.saison.id, 'date_debut': '2026-11-01',
                   'date_fin': '2027-04-30', 'clubs': [self.ej.id, self.usc.id, self.d2.id]}
        r = self.client.post('/api/competitions/', donnees, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['saison_libelle'], '2026-2027')
        self.assertEqual(len(r.data['clubs_detail']), 3)
        r = self.client.post('/api/competitions/', {**donnees, 'nom': 'Autre', 'date_fin': '2026-10-01'},
                             format='json')
        self.assertIn('date_fin', r.data)  # la fin doit être après le début
        r = self.client.post('/api/competitions/', {**donnees, 'nom': 'Autre', 'clubs': [self.ej.id]}, format='json')
        self.assertIn('clubs', r.data)


# ================================================================ EF 5 — Enregistrer un joueur
class Test_EF5_Joueurs(Base):
    def fiche(self, **extra):
        return {'nom': 'Joseph', 'prenom': 'Wilson', 'date_naissance': '2001-03-12', 'poste': 'BU',
                'pied_fort': 'D', 'taille': 178, 'poids': 71, 'club_actuel': self.ej.id, **extra}

    def test_EF5_1_fiche_joueur(self):
        """Test_EF5.1 : l'analyste et le scout créent une fiche ; le système calcule l'âge."""
        self.comme(self.scout)
        r = self.client.post('/api/joueurs/', self.fiche())
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['age'], Joueur.objects.get(pk=r.data['id']).calculer_age())
        self.assertFalse(r.data['est_mineur'])
        r = self.client.post('/api/joueurs/', {'prenom': 'Sans', 'poste': 'BU'})
        self.assertEqual(r.status_code, 400)
        for champ in ('nom', 'date_naissance', 'club_actuel'):  # champs obligatoires
            self.assertIn(champ, r.data)

    def test_EF5_2_doublon(self):
        """Test_EF5.2 : nom + date de naissance."""
        self.comme(self.analyste)
        self.assertEqual(self.client.post('/api/joueurs/', self.fiche()).status_code, 201)
        r = self.client.post('/api/joueurs/', self.fiche(nom='JOSEPH', prenom='wilson', club_actuel=self.usc.id))
        self.assertEqual(r.status_code, 400)
        self.assertIn('existe déjà', str(r.data['nom']))
        self.assertEqual(self.client.post('/api/joueurs/', self.fiche(date_naissance='2001-03-13')).status_code, 201)

    def test_EF5_3_tuteur_exige_pour_un_mineur(self):
        """Test_EF5.3 et RG12."""
        self.comme(self.analyste)
        naissance = date.today().replace(year=date.today().year - 17).isoformat()
        r = self.client.post('/api/joueurs/', self.fiche(date_naissance=naissance, telephone='+509 3700 1111'))
        self.assertEqual(r.status_code, 400)
        self.assertIn('nom_tuteur', r.data)
        self.assertIn('accord_tuteur', r.data)
        accord = SimpleUploadedFile('accord.pdf', b'%PDF-1.4 accord', content_type='application/pdf')
        r = self.client.post('/api/joueurs/', self.fiche(date_naissance=naissance, telephone='+509 3700 1111',
                                                         adresse='Jacmel', nom_tuteur='Marie Joseph',
                                                         accord_tuteur=accord), format='multipart')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data['est_mineur'])
        self.assertEqual(r.data['telephone'], '')  # ni téléphone ni adresse pour un mineur
        self.assertEqual(r.data['adresse'], '')

    def test_EF5_4_historique_des_clubs(self):
        """Test_EF5.4 et RG1 : un changement de club crée une ligne d'historique."""
        self.comme(self.analyste)
        joueur = self.client.post('/api/joueurs/', self.fiche()).data
        self.assertEqual(HistoriqueClub.objects.filter(joueur_id=joueur['id']).count(), 1)
        r = self.client.patch(f"/api/joueurs/{joueur['id']}/", {'club_actuel': self.usc.id, 'type_contrat': 'PRET',
                                                               'version': joueur['version']}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['club_nom'], 'US des Cayes')
        historique = self.client.get(f"/api/joueurs/{joueur['id']}/radar/").data['historique']
        self.assertEqual(len(historique), 2)
        self.assertIsNone(historique[0]['date_fin'])       # club actuel
        self.assertIsNotNone(historique[1]['date_fin'])    # ancien club clôturé
        self.assertEqual(HistoriqueClub.objects.filter(joueur_id=joueur['id'], date_fin__isnull=True).count(), 1)

    def test_verrouillage_optimiste(self):
        """SEL 2.4 : un numéro de version évite qu'une modification en écrase une autre."""
        self.comme(self.analyste)
        joueur = self.client.post('/api/joueurs/', self.fiche()).data
        url = f"/api/joueurs/{joueur['id']}/"
        self.assertEqual(self.client.patch(url, {'taille': 180, 'version': 1}, format='json').status_code, 200)
        r = self.client.patch(url, {'taille': 175, 'version': 1}, format='json')  # version périmée
        self.assertEqual(r.status_code, 400)
        self.assertIn('version', r.data)

    def test_droits_scout_cree_mais_ne_modifie_pas(self):
        self.comme(self.scout)
        joueur = self.client.post('/api/joueurs/', self.fiche()).data
        self.assertEqual(self.client.patch(f"/api/joueurs/{joueur['id']}/", {'taille': 181}).status_code, 403)


# ================================================================ EF 6 — Enregistrer un match
class Test_EF6_Matchs(Base):
    def test_EF6_1_match_compositions_score(self):
        """Test_EF6.1"""
        self.comme(self.analyste)
        r = self.client.post('/api/matchs/', self.donnees_match(), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['etat'], 'PLANIFIE')
        self.assertEqual(len(r.data['compositions']), 26)
        self.assertEqual((r.data['score_domicile'], r.data['score_exterieur']), (2, 1))
        titulaire = next(c for c in r.data['compositions'] if c['est_titulaire'])
        self.assertEqual(titulaire['minutes_jouees'], 90)

    def test_EF6_1_RG2_deux_clubs_differents_de_la_competition(self):
        self.comme(self.analyste)
        r = self.client.post('/api/matchs/', self.donnees_match(club_exterieur=self.ej.id), format='json')
        self.assertIn('club_exterieur', r.data)
        r = self.client.post('/api/matchs/', self.donnees_match(club_exterieur=self.d2.id, compositions=[]),
                             format='json')
        self.assertIn("n'est pas inscrit", str(r.data['club_exterieur']))

    def test_EF6_1_onze_titulaires_par_equipe(self):
        self.comme(self.analyste)
        lignes = self.lignes_composition()
        lignes[0]['est_titulaire'] = False
        r = self.client.post('/api/matchs/', self.donnees_match(compositions=lignes), format='json')
        self.assertIn('il en faut 11', str(r.data['compositions']))
        lignes = self.lignes_composition() + [{'joueur': self.joueur_d2.id, 'est_titulaire': False}]
        r = self.client.post('/api/matchs/', self.donnees_match(compositions=lignes), format='json')
        self.assertIn("n'appartient à aucune", str(r.data['compositions']))

    def test_EF6_2_importer_et_stocker_la_video(self):
        """Test_EF6.2 : le match passe à « Vidéo importée »."""
        self.comme(self.analyste)
        match = self.client.post('/api/matchs/', self.donnees_match(), format='json').data
        video = SimpleUploadedFile('match_J1.mp4', b'\x00\x00\x00\x18ftypmp42' + b'0' * 64, content_type='video/mp4')
        r = self.client.post(f"/api/matchs/{match['id']}/importer-video/", {'video': video}, format='multipart')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['etat'], 'VIDEO_IMPORTEE')
        self.assertIn('/media/videos/match_J1', r.data['video_lecture'])
        self.assertTrue(Match.objects.get(pk=match['id']).video.storage.exists(Match.objects.get(pk=match['id']).video.name))

    def test_match_valide_non_modifiable(self):
        """SEL 3.4.3 : pas de suppression d'un match validé."""
        match = self.creer_match(etat=EtatMatch.STATS_PUBLIEES)
        self.comme(self.analyste)
        self.assertEqual(self.client.delete(f'/api/matchs/{match.id}/').status_code, 400)
        self.assertEqual(self.client.patch(f'/api/matchs/{match.id}/', {'score_domicile': 5}).status_code, 400)


# ================================================================ EF 7 — Coder les événements
class Test_EF7_Codage(Base):
    def setUp(self):
        self.match = self.creer_match()
        self.comme(self.analyste)
        self.buteur = self.effectifs[self.ej.id][10]

    def test_EF7_1_video_ligne_de_temps_et_joueurs(self):
        """Test_EF7.1"""
        r = self.client.post(f'/api/matchs/{self.match.id}/ouvrir-codage/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['etat'], 'EN_CODAGE')
        self.assertTrue(r.data['video_lecture'])
        self.assertEqual(len(r.data['compositions']), 26)
        self.assertEqual(self.client.get(f'/api/evenements/?match={self.match.id}').data, [])

    def test_EF7_2_enregistrer_un_evenement(self):
        """Test_EF7.2 : type, minute, joueur, zone, résultat."""
        self.client.post(f'/api/matchs/{self.match.id}/ouvrir-codage/')
        r = self.coder(self.match, self.buteur, 'TIR', minute=34, resultat=False, zone_x=89, zone_y=50)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['minute'], r.data['resultat'], r.data['club']), (34, False, self.ej.id))
        self.assertEqual(r.data['valeur_xg'], calculer_xg(89, 50))
        self.assertIsNone(self.coder(self.match, self.buteur, 'PASSE').data['valeur_xg'])
        ligne_de_temps = self.client.get(f'/api/evenements/?match={self.match.id}').data
        self.assertEqual([e['type_action'] for e in ligne_de_temps], ['PASSE', 'TIR'])  # triée par temps

    def test_EF7_2_RG3_joueur_hors_composition(self):
        self.client.post(f'/api/matchs/{self.match.id}/ouvrir-codage/')
        r = self.coder(self.match, self.joueur_d2, 'PASSE')
        self.assertEqual(r.status_code, 400)
        self.assertIn('RG3', str(r.data['joueur']))

    def test_EF7_2_minute_ne_depasse_pas_la_duree(self):
        self.client.post(f'/api/matchs/{self.match.id}/ouvrir-codage/')
        self.assertIn('minute', self.coder(self.match, self.buteur, 'PASSE', minute=120).data)

    def test_EF7_3_verrou(self):
        """Test_EF7.3 : deux analystes ne codent pas le même match au même moment."""
        self.assertEqual(self.coder(self.match, self.buteur, 'PASSE').status_code, 400)  # pas encore ouvert
        self.client.post(f'/api/matchs/{self.match.id}/ouvrir-codage/')
        self.comme(self.analyste2)
        r = self.client.post(f'/api/matchs/{self.match.id}/ouvrir-codage/')
        self.assertEqual(r.status_code, 423)
        self.assertIn('verrouillé', r.data['detail'])
        self.assertEqual(self.coder(self.match, self.buteur, 'PASSE').status_code, 400)
        self.comme(self.analyste)
        r = self.client.post(f'/api/matchs/{self.match.id}/fermer-codage/')
        self.assertEqual(r.data['etat'], 'EN_CODAGE')  # le match reste « En codage »
        self.assertIsNone(r.data['verrouille_par'])
        self.comme(self.analyste2)
        self.assertEqual(self.client.post(f'/api/matchs/{self.match.id}/ouvrir-codage/').status_code, 200)

    def test_EF7_3_evenement_sauvegarde_aussitot(self):
        """Chaque événement est en base dès la réponse : aucune perte si le poste s'arrête (SEL 3.6.5)."""
        self.client.post(f'/api/matchs/{self.match.id}/ouvrir-codage/')
        identifiant = self.coder(self.match, self.buteur, 'DUEL').data['id']
        self.assertTrue(Evenement.objects.filter(pk=identifiant, match=self.match).exists())
        self.assertEqual(self.client.delete(f'/api/evenements/{identifiant}/').status_code, 204)


# ================================================================ EF 8 — Valider et calculer
class Test_EF8_Statistiques(Base):
    def test_EF8_1_controle_de_coherence(self):
        """Test_EF8.1 : buts codés = score."""
        match = self.creer_match(score=(2, 1))
        self.comme(self.analyste)
        self.client.post(f'/api/matchs/{match.id}/ouvrir-codage/')
        self.coder(match, self.effectifs[self.ej.id][9], 'BUT')
        r = self.client.post(f'/api/matchs/{match.id}/valider/')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(len(r.data['erreurs']), 2)  # 1 but sur 2 à domicile, 0 sur 1 à l'extérieur
        self.assertEqual(Match.objects.get(pk=match.id).etat, EtatMatch.EN_CODAGE)
        self.assertFalse(StatistiqueJoueur.objects.exists())  # RG4 : rien n'est calculé avant validation

    def test_jeu_de_tete(self):
        """Tirs, buts et xG de la tête, au total et par 90 minutes, à partir de la partie du corps codée."""
        match = self.creer_match(score=(2, 1))
        ailier, adverse = self.effectifs[self.ej.id][9], self.effectifs[self.usc.id][10]
        self.comme(self.analyste)
        self.client.post(f'/api/matchs/{match.id}/ouvrir-codage/')
        r = self.coder(match, ailier, 'BUT', partie_corps='TETE')
        self.assertEqual((r.status_code, r.data['partie_corps']), (201, 'TETE'))
        self.coder(match, ailier, 'BUT', partie_corps='PIED_D')
        self.coder(match, ailier, 'TIR', resultat=False, partie_corps='TETE')
        self.coder(match, ailier, 'DUEL', partie_corps='TETE')  # un duel de la tête n'est pas un tir
        self.coder(match, adverse, 'BUT')  # partie du corps non codée : compté nulle part
        self.assertIn('partie_corps', self.coder(match, ailier, 'TIR', partie_corps='GENOU').data)
        self.assertEqual(self.client.post(f'/api/matchs/{match.id}/valider/').status_code, 200)
        s = self.client.get(f'/api/statistiques/?joueur={ailier.id}&classement=0').data
        s = (s['results'] if isinstance(s, dict) else s)[0]
        xg = round(2 * calculer_xg(88, 50), 2)
        self.assertEqual((s['tirs_tete'], s['buts_tete'], s['xg_tete']), (2, 1, xg))
        self.assertEqual((s['tirs_tete_p90'], s['buts_tete_p90'], s['xg_tete_p90']), (2.0, 1.0, xg))  # 90 minutes jouées
        autre = StatistiqueJoueur.objects.get(joueur=adverse)
        self.assertEqual((autre.buts, autre.tirs_tete, autre.buts_tete, autre.xg_tete), (1, 0, 0, 0))

    def test_EF8_2_statistiques_par_90_centiles_et_indice(self):
        """Test_EF8.2, RG4 à RG7 et Test_ENF3.0 (moins de 30 secondes)."""
        self.comme(self.analyste)
        ailier, avant_centre = self.effectifs[self.ej.id][9], self.effectifs[self.ej.id][10]
        for journee in range(1, 6):  # 5 matchs complets = 450 minutes pour les titulaires
            match = self.creer_match(score=(2, 1), journee=journee)
            self.client.post(f'/api/matchs/{match.id}/ouvrir-codage/')
            self.coder_les_buts(match)
            self.coder(match, avant_centre, 'TIR', resultat=False)
            for resultat in (True, True, True, False):
                self.coder(match, ailier, 'PASSE', minute=20, resultat=resultat)
            r = self.client.post(f'/api/matchs/{match.id}/valider/')
            self.assertEqual(r.status_code, 200, r.data)
            self.assertEqual(r.data['etat'], 'STATS_PUBLIEES')
            self.assertLess(r.data['duree_calcul'], 30)

        stat = StatistiqueJoueur.objects.get(joueur=ailier, saison=self.saison)
        self.assertEqual((stat.minutes_jouees, stat.matchs_joues, stat.buts), (450, 5, 10))
        self.assertEqual(stat.buts_p90, 2.0)                # RG6 : 10 buts en 450 minutes
        self.assertEqual(stat.passes_p90, 4.0)
        self.assertEqual(stat.passes_reussies_pct, 75.0)
        self.assertTrue(stat.eligible)
        self.assertEqual(stat.centiles['buts_p90'], 100.0)  # meilleur buteur des attaquants
        self.assertTrue(0 <= stat.indice_performance <= 100)  # RG7
        ailier.refresh_from_db()
        self.assertEqual(ailier.indice_performance, stat.indice_performance)
        # RG5 : un remplaçant qui n'a pas joué 450 minutes n'a ni centiles ni indice, et sort du classement
        remplacant = StatistiqueJoueur.objects.get(joueur=self.effectifs[self.ej.id][11])
        self.assertEqual(remplacant.minutes_jouees, 0)
        self.assertEqual(remplacant.centiles, {})
        self.assertIsNone(remplacant.indice_performance)
        classement = self.client.get('/api/statistiques/?groupe=ATTAQUANT').data
        self.assertEqual(classement['count'], 4)  # AIL et BU titulaires des deux clubs
        self.assertEqual(classement['results'][0]['joueur'], ailier.id)

    def test_correction_retire_les_statistiques(self):
        """Une correction ramène le match « En codage » (diagramme d'états du Match)."""
        self.comme(self.analyste)
        match = self.creer_match(score=(1, 0))
        self.client.post(f'/api/matchs/{match.id}/ouvrir-codage/')
        self.coder_les_buts(match)
        self.assertEqual(self.client.post(f'/api/matchs/{match.id}/valider/').status_code, 200)
        self.assertTrue(StatistiqueJoueur.objects.exists())
        r = self.client.post(f'/api/matchs/{match.id}/corriger/')
        self.assertEqual(r.data['etat'], 'EN_CODAGE')
        self.assertFalse(StatistiqueJoueur.objects.exists())

    def test_minutes_jouees_des_remplacants(self):
        match = self.creer_match()
        composition = match.compositions.get(joueur=self.effectifs[self.ej.id][11])
        composition.minute_entree = 60
        composition.save()
        self.assertEqual(composition.minutes_jouees, 30)
        sortant = match.compositions.get(joueur=self.effectifs[self.ej.id][5])
        sortant.minute_sortie = 60
        sortant.save()
        self.assertEqual(sortant.minutes_jouees, 60)

    def test_xg_plus_fort_pres_du_but(self):
        self.assertGreater(calculer_xg(95, 50), calculer_xg(80, 50))
        self.assertGreater(calculer_xg(90, 50), calculer_xg(90, 10))  # angle fermé


class AvecStatistiques(Base):
    """Cinq matchs publiés, créés directement en base, pour les tests de consultation."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        for journee in range(1, 6):
            match = Match.objects.create(
                competition=cls.ligue, journee=journee, club_domicile=cls.ej, club_exterieur=cls.usc,
                date_match=timezone.make_aware(datetime(2026, 9, journee, 15)), score_domicile=1, score_exterieur=0,
                etat=EtatMatch.STATS_PUBLIEES)
            for club_id, effectif in cls.effectifs.items():
                for i, joueur in enumerate(effectif):
                    Composition.objects.create(match=match, joueur=joueur, club_id=club_id, est_titulaire=i < 11)
            Evenement.objects.create(match=match, joueur=cls.effectifs[cls.ej.id][10], type_action='BUT', minute=30,
                                     temps_video=1800, zone_x=90, zone_y=50, valeur_xg=0.4)
        recalculer_saison(cls.saison)
        cls.bu_ej, cls.bu_usc = cls.effectifs[cls.ej.id][10], cls.effectifs[cls.usc.id][10]


# ================================================================ EF 9, EF 10 — Radar, comparaison, recherche
class Test_EF9_EF10_Consultation(AvecStatistiques):
    def test_EF9_1_radar(self):
        """Test_EF9.1 : centiles par poste pour la saison en cours."""
        self.comme(self.scout)
        r = self.client.get(f'/api/joueurs/{self.bu_ej.id}/radar/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['saison']['libelle'], '2026-2027')
        self.assertEqual(r.data['statistique']['buts'], 5)
        self.assertEqual(r.data['statistique']['centiles']['buts_p90'], 100.0)

    def test_EF9_2_comparer_deux_joueurs(self):
        """Test_EF9.2"""
        self.comme(self.directeur)
        r = self.client.get(f'/api/joueurs/comparer/?a={self.bu_ej.id}&b={self.bu_usc.id}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['a']['joueur']['id'], self.bu_ej.id)
        self.assertGreater(r.data['a']['statistique']['indice_performance'],
                           r.data['b']['statistique']['indice_performance'])
        self.assertEqual(self.client.get(f'/api/joueurs/comparer/?a={self.bu_ej.id}&b=0').status_code, 404)

    def test_EF9_2_comparer_jusqu_a_cinq_joueurs(self):
        """SRS §12.2 : de deux à cinq joueurs, minutes jouées en contexte."""
        self.comme(self.directeur)
        ids = [self.bu_ej.id, self.bu_usc.id]
        r = self.client.get(f"/api/joueurs/comparer/?ids={','.join(map(str, ids))}")
        self.assertEqual((r.status_code, [f['joueur']['id'] for f in r.data['joueurs']]), (200, ids))
        self.assertIn('avertissements', r.data)
        self.assertEqual(self.client.get(f'/api/joueurs/comparer/?ids={ids[0]}').status_code, 400)
        self.assertEqual(self.client.get(f'/api/joueurs/comparer/?ids={ids[0]},{ids[0]}').status_code, 400)
        self.assertEqual(self.client.get('/api/joueurs/comparer/?ids=1,2,3,4,5,6').status_code, 400)

    def test_EF10_1_recherche_multicritere(self):
        """Test_EF10.1 : poste, âge, pied, division, indice minimal ; liste triée par indice."""
        self.comme(self.scout)
        r = self.client.get('/api/joueurs/?poste=BU&division=D1')
        self.assertEqual(r.data['count'], 4)
        self.assertEqual(r.data['results'][0]['id'], self.bu_ej.id)  # meilleur indice en tête
        indice = Joueur.objects.get(pk=self.bu_ej.id).indice_performance
        r = self.client.get(f'/api/joueurs/?poste=BU&indice_min={indice}')
        self.assertEqual([j['id'] for j in r.data['results']], [self.bu_ej.id])
        self.assertEqual(self.client.get('/api/joueurs/?division=D2').data['count'], 1)
        self.assertEqual(self.client.get('/api/joueurs/?age_max=20').data['count'], 0)
        age = self.bu_ej.calculer_age()
        self.assertGreater(self.client.get(f'/api/joueurs/?age_min={age}&age_max={age}').data['count'], 0)
        Joueur.objects.filter(pk=self.bu_usc.id).update(pied_fort='G')
        self.assertEqual(self.client.get('/api/joueurs/?pied_fort=G&groupe=ATTAQUANT').data['count'], 1)
        self.assertEqual(self.client.get(f'/api/joueurs/?q={self.bu_ej.nom}').data['count'], 1)

    def test_EF10_2_shortlist(self):
        """Test_EF10.2 : ajouter et retirer un joueur."""
        self.comme(self.scout)
        liste = self.client.post('/api/shortlists/', {'nom': 'Attaquants U21'}, format='json').data
        url = f"/api/shortlists/{liste['id']}/"
        r = self.client.post(url + 'ajouter/', {'joueur': self.bu_ej.id}, format='json')
        self.assertEqual(r.data['nb_joueurs'], 1)
        self.client.post(url + 'ajouter/', {'joueur': self.bu_ej.id}, format='json')  # pas de doublon
        self.assertEqual(self.client.get(url).data['nb_joueurs'], 1)
        r = self.client.post(url + 'retirer/', {'joueur': self.bu_ej.id}, format='json')
        self.assertEqual(r.data['nb_joueurs'], 0)
        self.comme(self.directeur)  # une shortlist est propre à son utilisateur
        self.assertEqual(self.client.get(url).status_code, 404)


# ================================================================ EF 11, EF 12 — Rapports de scouting
class Test_EF11_EF12_Rapports(AvecStatistiques):
    def rapport(self, **extra):
        return {'joueur': self.bu_ej.id, 'forces': 'Rapide', 'faiblesses': 'Jeu de tête', 'note': 8,
                'recommandation': 'RECRUTER', **extra}

    def soumis(self):
        self.comme(self.scout)
        rapport = self.client.post('/api/rapports/', self.rapport(), format='json').data
        self.client.post(f"/api/rapports/{rapport['id']}/soumettre/")
        return rapport['id']

    def test_EF11_1_rediger_et_soumettre(self):
        """Test_EF11.1"""
        self.comme(self.scout)
        r = self.client.post('/api/rapports/', self.rapport(), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['etat'], r.data['scout']), ('BROUILLON', self.scout.id))
        r = self.client.post(f"/api/rapports/{r.data['id']}/soumettre/")
        self.assertEqual(r.data['etat'], 'SOUMIS')
        self.assertEqual(mail.outbox[-1].to, ['directeur@test.ht'])  # le directeur sportif est notifié
        self.assertEqual(self.client.patch(f"/api/rapports/{r.data['id']}/", {'note': 9}).status_code, 400)

    def test_EF11_1_controles(self):
        self.comme(self.scout)
        self.assertIn('note', self.client.post('/api/rapports/', self.rapport(note=11), format='json').data)
        r = self.client.post('/api/rapports/', {'joueur': self.bu_ej.id, 'note': 5}, format='json')
        for champ in ('forces', 'faiblesses', 'recommandation'):
            self.assertIn(champ, r.data)
        self.comme(self.analyste)  # seul un scout rédige un rapport
        self.assertEqual(self.client.post('/api/rapports/', self.rapport(), format='json').status_code, 403)

    def test_EF12_1_valider_ou_renvoyer(self):
        """Test_EF12.1"""
        identifiant = self.soumis()
        self.assertEqual(self.client.post(f'/api/rapports/{identifiant}/valider/').status_code, 403)  # scout
        self.comme(self.directeur)
        self.assertEqual(self.client.get('/api/rapports/?etat=SOUMIS').data['count'], 1)
        r = self.client.post(f'/api/rapports/{identifiant}/renvoyer/', {}, format='json')
        self.assertIn('commentaire', r.data)  # motif obligatoire
        r = self.client.post(f'/api/rapports/{identifiant}/renvoyer/', {'commentaire': 'Trop court'}, format='json')
        self.assertEqual(r.data['etat'], 'RENVOYE')
        self.comme(self.scout)  # un rapport renvoyé revient « Soumis » après correction
        self.assertEqual(self.client.patch(f'/api/rapports/{identifiant}/', {'forces': 'Rapide, bon appel'},
                                           format='json').status_code, 200)
        self.client.post(f'/api/rapports/{identifiant}/soumettre/')
        self.comme(self.directeur)
        r = self.client.post(f'/api/rapports/{identifiant}/valider/', {'commentaire': 'Bon profil'}, format='json')
        self.assertEqual((r.data['etat'], r.data['valide_par']), ('VALIDE', self.directeur.id))

    def test_EF12_2_le_scout_est_notifie(self):
        """Test_EF12.2"""
        identifiant = self.soumis()
        self.comme(self.directeur)
        mail.outbox.clear()
        self.client.post(f'/api/rapports/{identifiant}/valider/')
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['scout@test.ht'])
        self.assertIn('validé', mail.outbox[0].subject)

    def test_RG8_visible_des_clubs_seulement_une_fois_valide(self):
        identifiant = self.soumis()
        facture = self.abonner()['factures'][0]
        self.payer(facture)
        self.comme(self.client_ej)
        self.assertEqual(self.client.get('/api/rapports/').data['count'], 0)
        self.comme(self.directeur)
        self.client.post(f'/api/rapports/{identifiant}/valider/')
        self.comme(self.client_ej)
        self.assertEqual(self.client.get('/api/rapports/').data['count'], 1)


# ================================================================ EF 13, EF 14 — Abonnements et paiements
class Test_EF13_EF14_Commercial(AvecStatistiques):
    def test_EF13_1_abonnement_et_facture(self):
        """Test_EF13.1 : montant, échéance et facture calculés par le système (RG11)."""
        abonnement = self.abonner()
        self.assertEqual(abonnement['etat'], 'EN_ATTENTE')
        self.assertEqual(Decimal(abonnement['montant_htg']), Decimal('180000'))  # 15 000 HTG x 12 mois
        debut = date.today()
        self.assertEqual(abonnement['date_echeance'], debut.replace(year=debut.year + 1).isoformat())
        facture = abonnement['factures'][0]
        self.assertEqual(Decimal(facture['taxe']), Decimal('18000'))
        self.assertEqual(Decimal(facture['montant_ttc']), Decimal('198000'))
        self.assertEqual((facture['statut'], Decimal(facture['solde_du'])), ('IMPAYEE', Decimal('198000')))
        self.assertTrue(facture['numero_facture'].startswith(f'F{debut.year}-'))

    def test_EF13_2_suspension_apres_15_jours(self):
        """Test_EF13.2 et RG10."""
        abonnement = self.abonner()
        echeance = date.today()
        self.assertEqual(mettre_a_jour_abonnements(echeance + timedelta(days=15))['suspendus'], 0)
        self.assertEqual(mettre_a_jour_abonnements(echeance + timedelta(days=16))['suspendus'], 1)
        self.assertEqual(Abonnement.objects.get(pk=abonnement['id']).etat, EtatAbonnement.SUSPENDU)
        r = self.payer(abonnement['factures'][0])  # il redevient actif au paiement
        self.assertEqual(r.data['abonnement_etat'], 'ACTIF')

    def test_expiration_sans_renouvellement(self):
        abonnement = self.abonner()
        self.payer(abonnement['factures'][0])
        fin = date.fromisoformat(abonnement['date_echeance'])
        self.assertEqual(mettre_a_jour_abonnements(fin)['expires'], 0)
        self.assertEqual(mettre_a_jour_abonnements(fin + timedelta(days=1))['expires'], 1)

    def test_EF14_1_paiement_et_recu(self):
        """Test_EF14.1"""
        facture = self.abonner()['factures'][0]
        r = self.payer(facture, '250000.00')
        self.assertIn('dépasse le solde', str(r.data['montant_htg']))  # CU14 étape 4
        r = self.payer(facture, '98000.00')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['facture_statut'], r.data['abonnement_etat']), ('PARTIELLE', 'EN_ATTENTE'))
        self.assertEqual(Decimal(r.data['solde_du']), Decimal('100000'))
        self.assertEqual(r.data['encaisse_par'], self.agent.id)
        recu = self.client.post('/api/exports/', {'type': 'recu', 'id': r.data['id']}, format='json')
        self.assertEqual(recu.status_code, 200, recu.data)
        self.client.force_authenticate(None)
        pdf = self.client.get(recu.data['url'])
        self.assertTrue(pdf.content.startswith(b'%PDF'))

    def test_EF14_2_abonnement_actif_quand_la_facture_est_soldee(self):
        """Test_EF14.2"""
        facture = self.abonner()['factures'][0]
        self.payer(facture, '98000.00')
        r = self.payer(facture, '100000.00')
        self.assertEqual((r.data['facture_statut'], r.data['abonnement_etat']), ('PAYEE', 'ACTIF'))

    def test_RG9_acces_du_club_client(self):
        """Seulement si l'abonnement est actif, et seulement les données de sa formule."""
        self.comme(self.client_ej)
        self.assertEqual(self.client.get('/api/joueurs/').status_code, 403)
        facture = self.abonner(formule=self.essentiel)['factures'][0]
        self.comme(self.client_ej)
        self.assertEqual(self.client.get('/api/joueurs/').status_code, 403)  # en attente de paiement
        self.payer(facture)
        self.comme(self.client_ej)
        r = self.client.get('/api/joueurs/?page_size=100')
        self.assertEqual(r.status_code, 200)
        self.assertEqual({j['club_division'] for j in r.data['results']}, {'D1'})  # Essentiel : D1 seulement
        self.assertEqual(self.client.get(f'/api/joueurs/{self.joueur_d2.id}/').status_code, 404)
        self.assertEqual(r.data['results'][0]['telephone'], '')  # données personnelles masquées
        self.assertEqual(self.client.post('/api/clubs/', {'nom': 'X', 'ville': 'Y'}).status_code, 403)

    def test_ENF7_factures_et_paiements_jamais_supprimes(self):
        """Test_ENF7.0 : annulés avec motif."""
        facture = self.abonner()['factures'][0]
        paiement = self.payer(facture).data
        self.assertEqual(self.client.delete(f"/api/paiements/{paiement['id']}/").status_code, 405)
        self.assertEqual(self.client.delete(f"/api/factures/{facture['id']}/").status_code, 405)
        url = f"/api/paiements/{paiement['id']}/annuler/"
        self.assertEqual(self.client.post(url, {'motif': 'Erreur'}, format='json').status_code, 403)  # agent seul
        self.comme(self.directeur)  # avec l'accord de la direction
        self.assertIn('motif', self.client.post(url, {}, format='json').data)
        r = self.client.post(url, {'motif': 'Chèque sans provision'}, format='json')
        self.assertTrue(r.data['annule'])
        self.assertTrue(Paiement.objects.filter(pk=paiement['id']).exists())
        self.assertEqual(Facture.objects.get(pk=facture['id']).statut, 'IMPAYEE')
        self.assertEqual(Abonnement.objects.get(pk=facture['abonnement']).etat, EtatAbonnement.EN_ATTENTE)

    def test_renouvellement(self):
        abonnement = self.abonner()
        self.payer(abonnement['factures'][0])
        r = self.client.post(f"/api/abonnements/{abonnement['id']}/renouveler/")
        self.assertEqual(len(r.data['factures']), 2)
        nouvelle = next(f for f in r.data['factures'] if f['statut'] == 'IMPAYEE')
        self.assertEqual(nouvelle['periode_debut'], abonnement['date_echeance'])
        self.payer(nouvelle)
        fin = date.fromisoformat(abonnement['date_echeance'])
        self.assertEqual(Abonnement.objects.get(pk=abonnement['id']).date_echeance, fin.replace(year=fin.year + 1))


# ================================================================ EF 15, EF 16 — Export, audit, sauvegarde
class Test_EF15_EF16_Export_Audit(AvecStatistiques):
    def test_EF15_1_export_pdf_comparaison_multiple(self):
        """SRS §12.2 : l'export compare de deux à cinq joueurs différents."""
        self.comme(self.scout)
        autres = [self.bu_usc.id]
        r = self.client.post('/api/exports/', {'type': 'comparaison', 'id': self.bu_ej.id, 'autre': autres}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        for mauvais in ([], [self.bu_ej.id], [self.bu_usc.id] * 2, list(range(1000, 1005))):
            r = self.client.post('/api/exports/', {'type': 'comparaison', 'id': self.bu_ej.id, 'autre': mauvais},
                                 format='json')
            self.assertIn(r.status_code, (400, 404), mauvais)

    def test_EF15_1_export_pdf(self):
        """Test_EF15.1 et Test_ENF2.0 : fiche, comparaison et rapport, chacun en moins de 5 secondes."""
        rapport = RapportScouting.objects.create(joueur=self.bu_ej, scout=self.scout, forces='Rapide',
                                                 faiblesses='Tête', note=8, recommandation='RECRUTER', etat='VALIDE')
        demandes = [{'type': 'joueur', 'id': self.bu_ej.id},
                    {'type': 'comparaison', 'id': self.bu_ej.id, 'autre': self.bu_usc.id},
                    {'type': 'rapport', 'id': rapport.id}]
        for demande in demandes:
            self.comme(self.scout)
            debut = timezone.now()
            r = self.client.post('/api/exports/', demande, format='json')
            self.assertEqual(r.status_code, 200, r.data)
            self.assertTrue(r.data['fichier'].endswith('.pdf'))
            self.client.force_authenticate(None)  # le lien signé suffit, sans jeton
            pdf = self.client.get(r.data['url'])
            self.assertEqual(pdf['Content-Type'], 'application/pdf')
            self.assertTrue(pdf.content.startswith(b'%PDF'))
            self.assertLess((timezone.now() - debut).total_seconds(), 5)
        self.assertEqual(OperationAudit.objects.filter(action='EXPORT', utilisateur=self.scout).count(), 3)

    def test_EF15_1_lien_invalide_ou_document_interdit(self):
        self.assertEqual(self.client.get('/api/exports/telecharger/?ticket=faux').status_code, 403)
        self.comme(self.agent)
        r = self.client.post('/api/exports/', {'type': 'joueur', 'id': self.bu_ej.id}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_EF16_1_journal_des_operations(self):
        """Test_EF16.1 : qui, quoi, quand, depuis quel poste, valeur avant et après."""
        self.comme(self.analyste)
        club = self.client.post('/api/clubs/', {'nom': 'Lions du Cap', 'ville': 'Cap-Haïtien'}, format='json').data
        self.client.patch(f"/api/clubs/{club['id']}/", {'stade': 'Parc Saint-Victor'}, format='json')
        self.client.delete(f"/api/clubs/{club['id']}/")
        self.assertEqual(self.client.get('/api/audit/').status_code, 403)
        self.comme(self.admin)
        r = self.client.get(f'/api/audit/?utilisateur={self.analyste.id}&table=club')
        self.assertEqual([o['action'] for o in r.data['results']], ['SUPPRESSION', 'MODIFICATION', 'CREATION'])
        modification = r.data['results'][1]
        self.assertEqual((modification['valeur_avant']['stade'], modification['valeur_apres']['stade']),
                         ('', 'Parc Saint-Victor'))
        self.assertEqual(modification['adresse_ip'], '127.0.0.1')
        self.assertEqual(modification['utilisateur_nom'], 'analyste')
        demain = (timezone.localdate() + timedelta(days=1)).isoformat()
        self.assertEqual(self.client.get(f'/api/audit/?debut={demain}').data['count'], 0)
        self.assertGreaterEqual(self.client.get(f'/api/audit/?fin={demain}&action=CREATION').data['count'], 1)

    def test_EF16_2_sauvegarde_sur_demande(self):
        """Test_EF16.2 : la base est copiée sur le disque externe et le serveur cloud."""
        dossier = tempfile.mkdtemp(prefix='syscout_sauvegarde_')
        from pathlib import Path
        destinations = [Path(dossier) / 'disque_externe', Path(dossier) / 'cloud']
        try:
            with mock.patch.dict(settings.SYSCOUT, {'SAUVEGARDES': destinations}):
                self.comme(self.analyste)
                self.assertEqual(self.client.post('/api/sauvegarde/').status_code, 403)
                self.comme(self.admin)
                r = self.client.post('/api/sauvegarde/')
                self.assertEqual(r.status_code, 201, r.data)
                self.assertEqual([c['destination'] for c in r.data['copies']], ['disque_externe', 'cloud'])
                for destination, copie in zip(destinations, r.data['copies']):
                    contenu = (destination / copie['fichier']).read_text(encoding='utf-8')
                    self.assertIn('"joueurs.joueur"', contenu)
                self.assertEqual(self.client.get('/api/sauvegarde/').data[0]['nombre'], 1)
            self.assertTrue(OperationAudit.objects.filter(action='SAUVEGARDE').exists())
        finally:
            shutil.rmtree(dossier, ignore_errors=True)

    def test_ENF6_transaction_echouee_annulee_entierement(self):
        """Test_ENF6.0 : aucune donnée à moitié enregistrée."""
        self.comme(self.analyste)
        lignes = self.lignes_composition()
        lignes[3]['minute_entree'] = 400  # erreur détectée après le début du traitement
        avant = Match.objects.count()
        r = self.client.post('/api/matchs/', self.donnees_match(compositions=lignes), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Match.objects.count(), avant)


# ================================================================ Télestration (dessins sur la vidéo)
class Test_Telestration(Base):
    def setUp(self):
        self.match = self.creer_match()
        self.fleche = {'match': self.match.id, 'temps_video': 754, 'forme': 'FLECHE', 'couleur': '#ffd84d',
                       'points': [[20, 40], [62.5, 35]]}

    def test_dessiner_et_revoir(self):
        self.comme(self.analyste)
        r = self.client.post('/api/annotations/', self.fleche, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['auteur'], r.data['duree']), (self.analyste.id, 5))
        trait = {**self.fleche, 'forme': 'TRAIT', 'temps_video': 30, 'points': [[1, 1], [2, 3], [4, 8]]}
        self.assertEqual(self.client.post('/api/annotations/', trait, format='json').status_code, 201)
        self.comme(self.scout)  # les autres rôles sportifs voient les dessins, dans l'ordre de la vidéo
        liste = self.client.get(f'/api/annotations/?match={self.match.id}').data
        self.assertEqual([a['forme'] for a in liste], ['TRAIT', 'FLECHE'])
        self.assertEqual(self.client.post('/api/annotations/', self.fleche, format='json').status_code, 403)

    def test_controles(self):
        self.comme(self.analyste)
        for points in ([[20, 40]], [[20, 40], [120, 35]], 'abc', [[20, 40], [1, 2], [3, 4]]):
            r = self.client.post('/api/annotations/', {**self.fleche, 'points': points}, format='json')
            self.assertIn('points', r.data, points)
        texte = {**self.fleche, 'forme': 'TEXTE', 'points': [[50, 50]]}
        self.assertIn('texte', self.client.post('/api/annotations/', texte, format='json').data)
        r = self.client.post('/api/annotations/', {**texte, 'texte': 'Appel en profondeur', 'duree': 10}, format='json')
        self.assertEqual((r.status_code, r.data['duree']), (201, 10))
        self.assertIn('duree', self.client.post('/api/annotations/', {**self.fleche, 'duree': 0}, format='json').data)
        r = self.client.post('/api/annotations/', {**self.fleche, 'couleur': 'rouge'}, format='json')
        self.assertIn('couleur', r.data)
        sans_video = self.creer_match()
        Match.objects.filter(pk=sans_video.pk).update(video_url='')
        r = self.client.post('/api/annotations/', {**self.fleche, 'match': sans_video.id}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.get('/api/annotations/').status_code, 400)  # le match est exigé

    def test_seul_l_auteur_efface(self):
        self.comme(self.analyste)
        identifiant = self.client.post('/api/annotations/', self.fleche, format='json').data['id']
        self.comme(self.analyste2)
        self.assertEqual(self.client.delete(f'/api/annotations/{identifiant}/').status_code, 403)
        self.comme(self.analyste)
        self.assertEqual(self.client.delete(f'/api/annotations/{identifiant}/').status_code, 204)


# ================================================================ Apprentissage automatique
class Test_Apprentissage(AvecStatistiques):
    def test_algorithmes(self):
        from apprentissage import ml
        points, moyennes, ecarts = ml.centrer_reduire([[1, 10], [2, 10], [3, 10]])
        self.assertEqual(moyennes, [2, 10])
        self.assertAlmostEqual(sum(p[0] for p in points), 0)
        self.assertEqual([p[1] for p in points], [0, 0, 0])  # une colonne constante ne fait pas de division par zéro
        nuage = [[0, 0], [0.2, 0.1], [0.1, 0.3], [9, 9], [9.2, 8.8], [8.9, 9.1]]
        groupes, centres = ml.k_moyennes(nuage, 2)
        self.assertEqual(len(set(groupes[:3])), 1)
        self.assertEqual(len(set(groupes[3:])), 1)
        self.assertNotEqual(groupes[0], groupes[3])
        self.assertEqual(ml.k_moyennes(nuage, 2)[0], groupes)  # résultat reproductible

    def test_xg_appris(self):
        """Le modèle apprend qu'un tir proche et dans l'axe a plus de chances de finir en but."""
        from apprentissage import ml
        proches = [(92 + i % 4, 46 + i % 8, i % 3 != 0) for i in range(60)]   # 2 buts sur 3
        lointains = [(72 + i % 6, 15 + i % 70, i % 15 == 0) for i in range(120)]  # 1 but sur 15
        resultat = ml.entrainer_xg(proches + lointains)
        self.assertLess(resultat['perte'], resultat['perte_reference'])
        self.assertGreater(ml.predire_xg(resultat, 94, 50), ml.predire_xg(resultat, 75, 50))
        self.assertGreater(ml.predire_xg(resultat, 94, 50), 0.4)
        self.assertLess(ml.predire_xg(resultat, 75, 20), 0.2)

    def test_joueurs_similaires(self):
        self.comme(self.scout)
        r = self.client.get(f'/api/ia/similaires/?joueur={self.bu_ej.id}')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data['eligible'])
        self.assertEqual(r.data['compares'], 4)  # AIL et BU titulaires des deux clubs
        self.assertEqual(len(r.data['similaires']), 3)
        scores = [s['similarite'] for s in r.data['similaires']]
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertNotIn(self.bu_ej.id, [s['joueur'] for s in r.data['similaires']])
        self.assertTrue(r.data['profil'])
        remplacant = self.effectifs[self.ej.id][11]  # moins de 450 minutes (RG5)
        self.assertFalse(self.client.get(f'/api/ia/similaires/?joueur={remplacant.id}').data['eligible'])
        self.comme(self.agent)
        self.assertEqual(self.client.get(f'/api/ia/similaires/?joueur={self.bu_ej.id}').status_code, 403)

    def test_profils_de_jeu(self):
        self.comme(self.directeur)
        r = self.client.get('/api/ia/profils/?groupe=DEFENSEUR')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(sum(len(p['joueurs']) for p in r.data['profils']), 8)  # 4 défenseurs titulaires par club
        self.assertEqual(self.client.get('/api/ia/profils/?groupe=X').status_code, 400)

    def test_entrainement_du_modele_xg(self):
        self.comme(self.analyste)
        self.assertFalse(self.client.get('/api/ia/xg/').data['entraine'])
        self.assertEqual(self.client.post('/api/ia/xg/').status_code, 400)  # 5 tirs seulement : pas assez
        match = Match.objects.filter(etat=EtatMatch.STATS_PUBLIEES).first()
        tireur = self.bu_ej
        Evenement.objects.bulk_create(
            [Evenement(match=match, joueur=tireur, type_action='BUT' if i % 3 else 'TIR', minute=10, zone_x=93,
                       zone_y=50) for i in range(30)]
            + [Evenement(match=match, joueur=tireur, type_action='TIR', minute=20, zone_x=74, zone_y=20 + i)
               for i in range(40)])
        from core.services import calculer_xg
        avant = calculer_xg(93, 50)
        self.comme(self.scout)
        self.assertEqual(self.client.post('/api/ia/xg/').status_code, 403)
        self.comme(self.analyste)
        r = self.client.post('/api/ia/xg/')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data['entraine'])
        self.assertEqual(r.data['nb_tirs'], 75)
        self.assertGreater(r.data['gain_pct'], 0)
        self.assertNotEqual(calculer_xg(93, 50), avant)  # le codage utilise maintenant le modèle appris
        self.assertGreater(calculer_xg(93, 50), calculer_xg(74, 30))


# ================================================================ Match en direct : possession, statistiques, physique
class Test_Direct(Base):
    def setUp(self):
        self.match = self.creer_match(score=(1, 0))
        self.comme(self.analyste)
        self.client.post(f'/api/matchs/{self.match.id}/ouvrir-codage/')
        self.ej1, self.usc1 = self.effectifs[self.ej.id][10], self.effectifs[self.usc.id][10]

    def direct(self):
        r = self.client.get(f'/api/matchs/{self.match.id}/direct/')
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    def possession(self, club, temps):
        return self.client.post(f'/api/matchs/{self.match.id}/possession/',
                                {'club': club and club.id, 'temps_video': temps}, format='json')

    def test_statistiques_en_direct(self):
        """Le tableau se met à jour à chaque événement codé, sans attendre la validation du match."""
        d = self.direct()
        self.assertEqual((d['score'], d['nb_evenements'], d['possession']['methode']), ([0, 0], 0, None))
        self.assertTrue(d['en_direct'])
        self.coder(self.match, self.ej1, 'BUT', minute=12)
        self.coder(self.match, self.ej1, 'TIR', minute=20, resultat=False)
        for resultat in (True, True, False):
            self.coder(self.match, self.ej1, 'PASSE', minute=22, resultat=resultat)
        self.coder(self.match, self.usc1, 'PASSE', minute=25)
        d = self.direct()
        self.assertEqual((d['score'], d['minute']), ([1, 0], 25))
        dom = d['equipes']['domicile']
        self.assertEqual((dom['buts'], dom['tirs'], dom['tirs_cadres'], dom['passes']), (1, 2, 1, 3))
        self.assertEqual(dom['passes_reussies_pct'], 66.7)
        self.assertGreater(dom['xg'], 0)
        joueur = next(j for j in d['joueurs'] if j['joueur'] == self.ej1.id)
        self.assertEqual((joueur['buts'], joueur['passes'], joueur['passes_reussies']), (1, 3, 2))
        self.assertEqual(d['derniers'][0]['joueur_nom'], self.usc1.nom_complet)
        # sans chronométrage, la possession est estimée par la part des passes : 3 contre 1
        self.assertEqual((d['possession']['methode'], d['possession']['domicile']), ('passes', 75.0))
        self.comme(self.scout)  # les autres rôles sportifs suivent le match
        self.assertEqual(self.direct()['score'], [1, 0])

    def test_possession_chronometree(self):
        self.assertEqual(self.possession(self.ej, 0).status_code, 200)
        self.possession(self.usc, 60)        # domicile : 60 s
        self.possession(None, 90)            # extérieur : 30 s, puis ballon hors du jeu
        r = self.possession(self.ej, 120)    # les 30 s sans possession ne comptent pour personne
        self.assertEqual(r.data['en_cours'], self.ej.id)
        self.coder(self.match, self.ej1, 'PASSE', minute=2, temps_video=150)  # la période ouverte court jusqu'ici
        p = self.direct()['possession']
        self.assertEqual((p['methode'], p['secondes_domicile'], p['secondes_exterieur']), ('chronometre', 90, 30))
        self.assertEqual((p['domicile'], p['exterieur']), (75.0, 25.0))
        self.assertEqual(self.possession(self.d2, 200).status_code, 400)  # club étranger au match
        self.comme(self.analyste2)  # seul l'analyste qui code chronomètre
        self.assertEqual(self.possession(self.usc, 200).status_code, 400)

    def test_donnees_physiques(self):
        url = f'/api/matchs/{self.match.id}/physique/'
        donnees = [{'joueur': self.ej1.id, 'distance_m': 10200, 'distance_sprint_m': 640, 'sprints': 21,
                    'vitesse_max_kmh': 31.4, 'source': 'GPS'},
                   {'joueur': self.usc1.id, 'distance_m': 9800, 'sprints': 15}]
        r = self.client.put(url, {'donnees': donnees}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(r.data), 2)
        r = self.client.put(url, {'donnees': [{'joueur': self.ej1.id, 'distance_m': 10400}]}, format='json')
        self.assertEqual(len(r.data), 2)  # mise à jour, pas de doublon
        d = self.direct()
        joueur = next(j for j in d['joueurs'] if j['joueur'] == self.ej1.id)
        self.assertEqual((joueur['physique']['distance_m'], joueur['physique']['vitesse_max_kmh']), (10400, 31.4))
        self.assertEqual(d['equipes']['domicile']['distance_m'], 10400)
        fiche = self.client.get(f'/api/joueurs/{self.ej1.id}/radar/').data['physique']
        self.assertEqual((fiche['matchs_mesures'], fiche['distance_m_p90'], fiche['sprints_p90']), (1, 10400.0, 21.0))
        for ligne in ({'joueur': self.joueur_d2.id, 'distance_m': 9000},          # hors composition (RG3)
                      {'joueur': self.ej1.id, 'vitesse_max_kmh': 80},             # valeur impossible
                      {'joueur': self.ej1.id, 'distance_m': 500, 'distance_sprint_m': 900}):
            self.assertEqual(self.client.put(url, {'donnees': [ligne]}, format='json').status_code, 400, ligne)
        self.comme(self.scout)
        self.assertEqual(self.client.put(url, {'donnees': donnees}, format='json').status_code, 403)
        self.assertEqual(len(self.client.get(url).data), 2)


# ================================================================ Capteur GPS
class Test_Capteur_GPS(Base):
    @staticmethod
    def trace():
        """Marche 60 s à 1,5 m/s, course 30 s à 4 m/s, puis deux sprints de 5 s à 8 m/s séparés par 20 s de marche."""
        points, t, metres = [], 0, 0.0
        for duree, vitesse in ((60, 1.5), (30, 4.0), (5, 8.0), (20, 1.5), (5, 8.0), (10, 1.5)):
            for _ in range(duree):
                points.append({'t': t, 'lat': 18.2345 + metres / 111194.93, 'lon': -72.5350})
                t, metres = t + 1, metres + vitesse
        points.append({'t': t, 'lat': 18.2345 + metres / 111194.93, 'lon': -72.5350})
        return points, metres

    def test_trace_vers_donnees_physiques(self):
        from apprentissage import ml
        self.assertAlmostEqual(ml.haversine(18.0, -72.0, 19.0, -72.0), 111194.9, delta=1)
        points, metres = self.trace()
        r = ml.analyser_trace([(p['t'], p['lat'], p['lon']) for p in points])
        self.assertAlmostEqual(r['distance_m'], metres, delta=2)   # 335 m
        self.assertEqual(r['sprints'], 2)
        self.assertAlmostEqual(r['distance_sprint_m'], 80, delta=10)
        self.assertAlmostEqual(r['vitesse_max_kmh'], 28.8, delta=0.5)
        self.assertGreaterEqual(r['seuil_sprint_kmh'], 19.8)
        # un saut du GPS (2 km en une seconde) est écarté et ne fausse ni la distance ni la vitesse maximale
        avec_saut = points[:40] + [{'t': 39.5, 'lat': 18.2525, 'lon': -72.5350}] + points[40:]
        r2 = ml.analyser_trace([(p['t'], p['lat'], p['lon']) for p in avec_saut])
        self.assertEqual(r2['mesures_ecartees'], 2)
        self.assertLess(r2['vitesse_max_kmh'], 30)
        # un joueur qui ne fait que marcher n'a aucun sprint, quel que soit le regroupement
        marche = [(t, 18.2345 + t * 1.4 / 111194.93, -72.535) for t in range(120)]
        self.assertEqual(ml.analyser_trace(marche)['sprints'], 0)

    def test_envoi_de_la_trace(self):
        match = self.creer_match()
        joueur = self.effectifs[self.ej.id][10]
        points, metres = self.trace()
        self.comme(self.analyste)
        r = self.client.post(f'/api/matchs/{match.id}/gps/', {'joueur': joueur.id, 'points': points}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['sprints'], 2)
        mesure = self.client.get(f'/api/matchs/{match.id}/physique/').data[0]
        self.assertEqual((mesure['joueur'], mesure['source'], mesure['sprints']), (joueur.id, 'GPS', 2))
        self.assertAlmostEqual(mesure['distance_m'], metres, delta=2)
        url = f'/api/matchs/{match.id}/gps/'
        self.assertEqual(self.client.post(url, {'joueur': joueur.id, 'points': points[:2]}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {'joueur': self.joueur_d2.id, 'points': points}, format='json').status_code, 400)
        mauvais = [{'t': 0, 'lat': 200, 'lon': 0}] * 5
        self.assertEqual(self.client.post(url, {'joueur': joueur.id, 'points': mauvais}, format='json').status_code, 400)
        self.comme(self.scout)
        self.assertEqual(self.client.post(url, {'joueur': joueur.id, 'points': points}, format='json').status_code, 403)


# ================================================================ Suivi d'un joueur sur la vidéo (télestration)
class Test_Suivi_Video(Base):
    COINS = [[10, 20], [90, 20], [90, 80], [10, 80]]  # le terrain entier vu bien en face

    def test_de_l_image_au_terrain(self):
        from apprentissage import ml
        h = ml.homographie(self.COINS, [(0, 0), (105, 0), (105, 68), (0, 68)])
        x, y = ml.projeter(h, 50, 50)
        self.assertAlmostEqual(x, 52.5, places=3)   # le centre de l'image tombe sur le rond central
        self.assertAlmostEqual(y, 34.0, places=3)
        # vue en perspective : le bord lointain du terrain paraît plus court sur l'image
        perspective = [[30, 20], [70, 20], [95, 80], [5, 80]]
        h = ml.homographie(perspective, [(0, 0), (105, 0), (105, 68), (0, 68)])
        for coin, attendu in zip(perspective, [(0, 0), (105, 0), (105, 68), (0, 68)]):
            projete = ml.projeter(h, *coin)
            self.assertAlmostEqual(projete[0], attendu[0], places=3)
            self.assertAlmostEqual(projete[1], attendu[1], places=3)
        self.assertIsNone(ml.homographie([[10, 10], [20, 20], [30, 30], [40, 40]], [(0, 0), (1, 0), (1, 1), (0, 1)]))

    def test_suivre_un_joueur(self):
        match = self.creer_match()
        joueur = self.effectifs[self.ej.id][10]
        self.comme(self.analyste)
        url = f'/api/matchs/{match.id}/suivi/'
        # le joueur traverse le terrain dans sa longueur en 30 secondes : 105 m à 12,6 km/h
        points = [{'t': 100 + i * 0.5, 'x': 10 + 80 * i / 60, 'y': 50} for i in range(61)]
        corps = {'joueur': joueur.id, 'reference': 'TERRAIN', 'coins': self.COINS, 'points': points}
        r = self.client.post(url, corps, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertAlmostEqual(r.data['sequence']['distance_m'], 105, delta=6)
        self.assertAlmostEqual(r.data['sequence']['vitesse_max_kmh'], 12.6, delta=1)
        self.assertEqual(r.data['sequence']['sprints'], 0)
        self.assertTrue(r.data['enregistre'])
        r = self.client.post(url, corps, format='json')  # une seconde séquence s'ajoute à la première
        self.assertAlmostEqual(r.data['cumul']['distance_m'], 210, delta=12)
        mesure = self.client.get(f'/api/matchs/{match.id}/physique/').data[0]
        self.assertEqual((mesure['joueur'], mesure['source']), (joueur.id, 'VIDEO'))
        self.assertAlmostEqual(mesure['distance_m'], 210, delta=12)
        trace = self.client.get(f'/api/annotations/?match={match.id}').data
        self.assertEqual((len(trace), trace[0]['forme'], trace[0]['temps_video']), (2, 'TRAIT', 100))  # tracé rejouable
        # un relevé GPS existant n'est pas écrasé par le suivi vidéo
        autre = self.effectifs[self.ej.id][9]
        self.client.put(f'/api/matchs/{match.id}/physique/',
                        {'donnees': [{'joueur': autre.id, 'distance_m': 9900, 'source': 'GPS'}]}, format='json')
        r = self.client.post(url, {**corps, 'joueur': autre.id}, format='json')
        self.assertFalse(r.data['enregistre'])
        for mauvais in ({**corps, 'coins': self.COINS[:3]}, {**corps, 'points': points[:2]},
                        {**corps, 'reference': 'X'}, {**corps, 'joueur': self.joueur_d2.id},
                        {**corps, 'coins': [[10, 10], [20, 20], [30, 30], [40, 40]]}):
            self.assertEqual(self.client.post(url, mauvais, format='json').status_code, 400)
        self.comme(self.scout)
        self.assertEqual(self.client.post(url, corps, format='json').status_code, 403)


# ================================================================ Compléments du SEL
class Test_Complements_SEL(Base):
    def test_nombre_de_comptes_de_la_formule(self):
        """Formule.nombreComptes : la formule Essentiel de ce jeu d'essai prévoit 1 compte par club."""
        self.payer(self.abonner(formule=self.essentiel)['factures'][0])
        self.comme(self.admin)
        nouveau = {'nom_utilisateur': 'client2', 'nom': 'Casimir', 'prenom': 'Yves', 'role': 'CLIENT',
                   'club': self.ej.id}
        r = self.client.post('/api/utilisateurs/', nouveau, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('1 compte', str(r.data['club']))
        self.client.delete(f'/api/utilisateurs/{self.client_ej.id}/')  # un compte désactivé libère sa place
        self.assertEqual(self.client.post('/api/utilisateurs/', nouveau, format='json').status_code, 201)

    def test_restauration_d_une_sauvegarde(self):
        """SEL 3.6.6 : restauration possible à partir d'une sauvegarde."""
        from pathlib import Path
        from django.core.management import call_command
        from django.core.management.base import CommandError
        from .services import sauvegarder
        dossier = tempfile.mkdtemp(prefix='syscout_restauration_')
        try:
            with mock.patch.dict(settings.SYSCOUT, {'SAUVEGARDES': [Path(dossier) / 'disque_externe']}):
                sauvegarder()
                Joueur.objects.filter(club_actuel=self.d2).delete()
                Club.objects.filter(pk=self.d2.pk).delete()
                with self.assertRaises(CommandError):  # sans confirmation, rien n'est remplacé
                    call_command('restaurer')
                self.assertFalse(Club.objects.filter(pk=self.d2.pk).exists())
                call_command('restaurer', oui=True, verbosity=0)
            self.assertTrue(Club.objects.filter(pk=self.d2.pk, nom='Colibri de Hinche').exists())
            self.assertTrue(Joueur.objects.filter(pk=self.joueur_d2.pk).exists())
            self.assertTrue(Utilisateur.objects.get(nom_utilisateur='analyste').check_password(MDP))
        finally:
            shutil.rmtree(dossier, ignore_errors=True)

    def test_photo_du_joueur_et_logo_du_club(self):
        """CU03 et CU05 : l'acteur charge le logo du club et la photo du joueur."""
        png = (b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
               b'\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\x89\x99=\x1d\x00\x00\x00\x00IEND\xaeB`\x82')
        self.comme(self.analyste)
        joueur = self.effectifs[self.ej.id][0]
        r = self.client.patch(f'/api/joueurs/{joueur.id}/',
                              {'photo': SimpleUploadedFile('photo.png', png, content_type='image/png')},
                              format='multipart')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('/media/photos/photo', r.data['photo'])
        r = self.client.patch(f'/api/clubs/{self.ej.id}/',
                              {'logo': SimpleUploadedFile('logo.png', png, content_type='image/png')},
                              format='multipart')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('/media/logos/logo', r.data['logo'])
        r = self.client.patch(f'/api/joueurs/{joueur.id}/',
                              {'photo': SimpleUploadedFile('faux.png', b'pas une image', content_type='image/png')},
                              format='multipart')
        self.assertIn('photo', r.data)  # un fichier qui n'est pas une image est refusé


# ================================================================ Équipe de l'entraîneur et assistant
class Test_Equipe_Assistant(AvecStatistiques):
    def test_bilan_de_l_equipe(self):
        """Cinq matchs gagnés 1-0 par le club à domicile dans le jeu d'essai."""
        self.comme(self.scout)
        r = self.client.get(f'/api/equipes/{self.ej.id}/')
        self.assertEqual(r.status_code, 200, r.data)
        b = r.data['bilan']
        self.assertEqual((b['joues'], b['victoires'], b['buts_pour'], b['buts_contre'], b['points']), (5, 5, 5, 0, 15))
        self.assertEqual(r.data['forme'], ['V'] * 5)
        self.assertEqual(r.data['meilleur_buteur']['joueur'], self.bu_ej.id)
        self.assertEqual(len(r.data['effectif']), 13)
        self.assertEqual(self.client.get(f'/api/equipes/{self.usc.id}/').data['bilan']['defaites'], 5)
        self.comme(self.agent)
        self.assertEqual(self.client.get(f'/api/equipes/{self.ej.id}/').status_code, 403)

    def test_equipes_du_club_client(self):
        self.payer(self.abonner(formule=self.essentiel)['factures'][0])
        self.comme(self.client_ej)
        r = self.client.get('/api/equipes/')
        self.assertEqual(r.data['mon_club'], self.ej.id)
        self.assertEqual(r.data['clubs'][0]['id'], self.ej.id)  # son club en premier
        self.assertNotIn(self.d2.id, [c['id'] for c in r.data['clubs']])  # D2 hors formule Essentiel (RG9)
        self.assertEqual(self.client.get(f'/api/equipes/{self.d2.id}/').status_code, 404)

    def test_assistant(self):
        self.comme(self.directeur)
        demander = lambda q: self.client.post('/api/assistant/', {'question': q}, format='json').data  # noqa: E731
        r = demander('Qui sont les meilleurs buteurs ?')
        self.assertIn(self.bu_ej.nom_complet, r['reponse'])
        self.assertEqual(r['liens'][0]['params']['id'], self.bu_ej.id)
        r = demander(f'Parle-moi de {self.bu_ej.prenom} {self.bu_ej.nom}')
        self.assertIn('5 but(s)', r['reponse'])
        self.assertEqual(r['liens'][0]['ecran'], 'JoueurDetail')
        r = demander('bilan de étoile de jacmel fc')
        self.assertIn('5 victoire(s)', r['reponse'])
        self.assertEqual(r['liens'][0], {'ecran': 'Equipe', 'params': {'id': self.ej.id}, 'titre': self.ej.nom})
        self.assertIn('indice', demander('meilleurs défenseurs')['reponse'])
        self.assertIn('Derniers résultats', demander('derniers résultats')['reponse'])
        self.assertIn('Essayez par exemple', demander('quel temps fait-il ?')['reponse'])
        self.assertIn('Essayez par exemple', demander('')['reponse'])
        self.comme(self.agent)
        self.assertEqual(self.client.post('/api/assistant/', {'question': 'buteurs'}, format='json').status_code, 403)


# ================================================================ Outils vidéo avancés
class Test_Outils_Video(Base):
    def test_zone_ligne_projecteur(self):
        match = self.creer_match()
        self.comme(self.analyste)
        for forme in ('ZONE', 'LIGNE', 'SPOT'):
            corps = {'match': match.id, 'temps_video': 10, 'forme': forme, 'points': [[20, 30], [60, 70]]}
            self.assertEqual(self.client.post('/api/annotations/', corps, format='json').status_code, 201, forme)
            r = self.client.post('/api/annotations/', {**corps, 'points': [[20, 30]]}, format='json')
            self.assertIn('points', r.data)

    def test_fleche_courbe_ovale_et_etiquette(self):
        match = self.creer_match()
        self.comme(self.analyste)
        base = {'match': match.id, 'temps_video': 10}
        courbe = {**base, 'forme': 'COURBE', 'points': [[20, 30], [40, 20], [60, 45]]}
        self.assertEqual(self.client.post('/api/annotations/', courbe, format='json').status_code, 201)
        self.assertIn('points', self.client.post('/api/annotations/', {**courbe, 'points': [[20, 30], [60, 45]]},
                                                 format='json').data)
        ovale = {**base, 'forme': 'OVALE', 'points': [[20, 60], [45, 80]]}
        self.assertEqual(self.client.post('/api/annotations/', ovale, format='json').status_code, 201)
        etiquette = {**base, 'forme': 'JOUEUR', 'points': [[50, 50]]}
        self.assertIn('texte', self.client.post('/api/annotations/', etiquette, format='json').data)
        r = self.client.post('/api/annotations/', {**etiquette, 'texte': '10 RODRIGUEZ', 'vitesse': 24.26},
                             format='json')
        self.assertEqual((r.status_code, r.data['mesures']), (201, [24.3]))
        self.assertNotIn('vitesse', r.data)
        self.assertIn('vitesse', self.client.post('/api/annotations/', {**etiquette, 'texte': 'x', 'vitesse': 80},
                                                  format='json').data)

    def test_distances_en_metres(self):
        """Image calibrée sur le terrain : liaison entre joueurs, triangle et flèche affichent leurs mètres."""
        match = self.creer_match()
        self.comme(self.analyste)
        calibrage = {'coins': [[10, 20], [90, 20], [90, 80], [10, 80]], 'reference': 'TERRAIN'}  # terrain vu de face
        base = {'match': match.id, 'temps_video': 10, **calibrage}
        # du point de corner au milieu de la ligne de touche, puis au centre du but adverse
        chaine = {**base, 'forme': 'CHAINE', 'points': [[10, 20], [50, 20], [90, 50]]}
        r = self.client.post('/api/annotations/', chaine, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['mesures'], [52.5, 62.5])
        triangle = self.client.post('/api/annotations/', {**chaine, 'forme': 'POLY'}, format='json').data
        self.assertEqual(triangle['mesures'], [52.5, 62.5, 110.4])  # le triangle se referme sur son premier point
        fleche = {**base, 'forme': 'MESURE', 'points': [[10, 50], [90, 50]]}
        self.assertEqual(self.client.post('/api/annotations/', fleche, format='json').data['mesures'], [105.0])
        # sans calibrage, le dessin s'enregistre sans distance
        sans = {'match': match.id, 'temps_video': 10, 'forme': 'MESURE', 'points': [[10, 50], [90, 50]]}
        self.assertEqual(self.client.post('/api/annotations/', sans, format='json').data['mesures'], [])
        # 4 coins alignés : le calibrage est refusé
        alignes = {**fleche, 'coins': [[10, 10], [20, 20], [30, 30], [40, 40]]}
        self.assertIn('coins', self.client.post('/api/annotations/', alignes, format='json').data)
        self.assertIn('points', self.client.post('/api/annotations/', {**chaine, 'points': [[10, 20]]},
                                                 format='json').data)

    def test_arrivee_des_passes(self):
        """Carte des passes : une passe ou un centre garde son point d'arrivée, les autres actions non."""
        match = self.creer_match()
        self.comme(self.analyste)
        self.client.post(f'/api/matchs/{match.id}/ouvrir-codage/')
        passeur = self.effectifs[self.ej.id][7]
        r = self.coder(match, passeur, 'PASSE', zone_x=40, zone_y=30, fin_x=62.5, fin_y=48)
        self.assertEqual((r.status_code, r.data['fin_x'], r.data['fin_y']), (201, 62.5, 48.0))
        self.assertIsNone(self.coder(match, passeur, 'PASSE').data['fin_x'])  # l'arrivée reste facultative
        self.assertIn('fin_x', self.coder(match, passeur, 'CENTRE', fin_x=90).data)
        self.assertIn('fin_x', self.coder(match, passeur, 'PASSE', fin_x=120, fin_y=50).data)
        tir = self.coder(match, passeur, 'TIR', fin_x=99, fin_y=50)
        self.assertEqual((tir.status_code, tir.data['fin_x'], tir.data['fin_y']), (201, None, None))
        # une passe recodée en dribble perd son point d'arrivée
        r = self.client.patch(f"/api/evenements/{r.data['id']}/", {'type_action': 'DRIBBLE'}, format='json')
        self.assertEqual((r.status_code, r.data['fin_x']), (200, None))

    def test_playlist_enregistree(self):
        match = self.creer_match()
        self.comme(self.scout)
        corps = {'match': match.id, 'nom': 'Tirs ratés', 'filtres': {'type': 'TIR', 'resultat': False}}
        r = self.client.post('/api/playlists/', corps, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['auteur'], self.scout.id)
        self.assertIn('filtres', self.client.post('/api/playlists/', {**corps, 'filtres': {'x': 1}}, format='json').data)
        self.comme(self.directeur)  # visible des autres, mais seul son auteur la supprime
        self.assertEqual(len(self.client.get(f'/api/playlists/?match={match.id}').data), 1)
        self.assertEqual(self.client.delete(f"/api/playlists/{r.data['id']}/").status_code, 403)
        self.comme(self.scout)
        self.assertEqual(self.client.delete(f"/api/playlists/{r.data['id']}/").status_code, 204)

    def test_second_angle_de_camera(self):
        match = self.creer_match(etat=EtatMatch.VIDEO_IMPORTEE)
        self.comme(self.analyste)
        r = self.client.patch(f'/api/matchs/{match.id}/', {'video_url_2': 'https://exemple.ht/angle2.mp4'},
                              format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['video_url_2'], 'https://exemple.ht/angle2.mp4')


# ================================================================ Accueil enrichi et cartes du joueur
class Test_Accueil_Cartes(AvecStatistiques):
    def test_carte_des_actions_du_joueur(self):
        self.comme(self.scout)
        r = self.client.get(f'/api/joueurs/{self.bu_ej.id}/carte/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(r.data['actions']), 5)  # ses 5 buts du jeu d'essai
        self.assertEqual((r.data['tirs']['nombre'], r.data['tirs']['buts'], r.data['tirs']['xg']), (5, 5, 2.0))
        self.assertEqual({(a['zone_x'], a['zone_y']) for a in r.data['actions']}, {(90.0, 50.0)})
        self.assertEqual(self.client.get(f'/api/joueurs/{self.bu_ej.id}/carte/?type=PASSE').data['actions'], [])
        self.comme(self.agent)
        self.assertEqual(self.client.get(f'/api/joueurs/{self.bu_ej.id}/carte/').status_code, 403)

    def test_accueil_resultats_et_meilleurs(self):
        self.comme(self.directeur)
        r = self.client.get('/api/tableau-de-bord/').data
        self.assertEqual(len(r['resultats']), 5)
        self.assertEqual(r['resultats'][0]['score'], '1 – 0')
        self.assertEqual(r['meilleurs'][0]['joueur'], self.bu_ej.id)
        self.comme(self.agent)  # l'agent commercial ne reçoit pas de données sportives
        r = self.client.get('/api/tableau-de-bord/').data
        self.assertEqual((r['resultats'], r['meilleurs']), ([], []))


# ================================================================ Classement, journal du joueur, rapport de match
class Test_Classement_Journal_Rapport(AvecStatistiques):
    def test_classement_de_la_competition(self):
        """Competition.afficherClassement() : 5 victoires 1-0 du club à domicile dans le jeu d'essai."""
        self.comme(self.scout)
        r = self.client.get(f'/api/competitions/{self.ligue.id}/classement/')
        self.assertEqual(r.status_code, 200, r.data)
        premier, second = r.data['classement']
        self.assertEqual((premier['club'], premier['rang'], premier['points'], premier['difference']),
                         (self.ej.id, 1, 15, 5))
        self.assertEqual((second['club'], second['points'], second['defaites'], second['forme']),
                         (self.usc.id, 0, 5, ['D'] * 5))
        self.assertEqual(r.data['matchs_joues'], 5)
        # un nul rapporte 1 point à chacun ; à égalité de points, la différence de buts départage
        Match.objects.filter(competition=self.ligue).update(score_domicile=2, score_exterieur=2)
        r = self.client.get(f'/api/competitions/{self.ligue.id}/classement/')
        self.assertEqual([l['points'] for l in r.data['classement']], [5, 5])

    def test_journal_des_matchs_du_joueur(self):
        self.comme(self.scout)
        r = self.client.get(f'/api/joueurs/{self.bu_ej.id}/matchs/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(r.data['matchs']), 5)
        ligne = r.data['matchs'][0]
        self.assertEqual((ligne['journee'], ligne['buts'], ligne['tirs'], ligne['minutes_jouees'], ligne['score']),
                         (5, 1, 1, 90, '1 – 0'))
        self.assertEqual(ligne['adversaire'], self.usc.nom)
        adverse = self.client.get(f'/api/joueurs/{self.bu_usc.id}/matchs/').data['matchs'][0]
        self.assertEqual((adverse['score'], adverse['domicile'], adverse['buts']), ('0 – 1', False, 0))

    def test_rapport_de_match_pdf(self):
        match = Match.objects.filter(competition=self.ligue).first()
        self.comme(self.directeur)
        r = self.client.post('/api/exports/', {'type': 'match', 'id': match.id}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.client.force_authenticate(None)
        document = self.client.get(r.data['url'])
        self.assertTrue(document.content.startswith(b'%PDF'))
        self.comme(self.agent)
        self.assertEqual(self.client.post('/api/exports/', {'type': 'match', 'id': match.id}, format='json').status_code, 403)
        self.comme(self.directeur)
        self.assertEqual(self.client.post('/api/exports/', {'type': 'match', 'id': 0}, format='json').status_code, 404)


# ================================================================ Demande d'inscription
class Test_Inscription(Base):
    DEMANDE = {'nom': 'Désir', 'prenom': 'Ricardo', 'courriel': 'r.desir@test.ht', 'nom_utilisateur': 'rdesir',
               'mot_de_passe': 'Bonjour2026'}

    def connecter(self):
        return self.client.post('/api/auth/connexion/', {'nom_utilisateur': 'rdesir', 'mot_de_passe': 'Bonjour2026'},
                                format='json')

    def test_demande_puis_activation_par_l_administrateur(self):
        r = self.client.post('/api/auth/inscription/', self.DEMANDE, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(mail.outbox[-1].to, ['admin@test.ht'])  # l'administrateur est prévenu
        r = self.connecter()  # tant que le compte n'est pas activé, pas d'accès
        self.assertEqual(r.status_code, 403)
        self.assertIn('attend la validation', r.data['detail'])
        compte = Utilisateur.objects.get(nom_utilisateur='rdesir')
        self.assertFalse(compte.is_active)
        self.assertNotIn('Bonjour2026', compte.password)
        self.comme(self.admin)  # l'administrateur attribue le rôle et active
        r = self.client.patch(f'/api/utilisateurs/{compte.id}/', {'role': 'ANALYSTE', 'is_active': True}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data['demande_inscription'])
        self.client.force_authenticate(None)
        r = self.connecter()
        self.assertEqual((r.status_code, r.data['utilisateur']['role']), (200, 'ANALYSTE'))

    def test_controles_de_la_demande(self):
        cas = (({'mot_de_passe': 'court1'}, 'mot_de_passe'), ({'mot_de_passe': 'sanschiffres'}, 'mot_de_passe'),
               ({'nom_utilisateur': 'scout'}, 'nom_utilisateur'), ({'courriel': 'scout@test.ht'}, 'courriel'),
               ({'courriel': ''}, 'courriel'), ({'nom': ''}, 'nom'))
        for changement, champ in cas:
            r = self.client.post('/api/auth/inscription/', {**self.DEMANDE, **changement}, format='json')
            self.assertEqual(r.status_code, 400, changement)
            self.assertIn(champ, r.data, changement)
        # on ne choisit pas son rôle soi-même
        r = self.client.post('/api/auth/inscription/', {**self.DEMANDE, 'role': 'ADMIN', 'is_active': True}, format='json')
        self.assertEqual(r.status_code, 201)
        compte = Utilisateur.objects.get(nom_utilisateur='rdesir')
        self.assertEqual((compte.role, compte.is_active, compte.is_staff), ('SCOUT', False, False))


class Test_Page_Accueil(Base):
    def test_formules_publiques_sans_compte(self):
        r = self.client.get('/api/formules-publiques/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual([f['nom'] for f in r.data], ['Essentiel', 'Pro'])  # par prix croissant
        self.assertEqual(Decimal(r.data[1]['prix_mensuel_htg']), Decimal('15000'))
        self.assertEqual(self.client.get('/api/formules/').status_code, 401)  # la gestion reste réservée
        self.assertEqual(self.client.post('/api/formules-publiques/', {}).status_code, 405)

    def test_chiffres_publics_sans_compte(self):
        """Page d'accueil : chiffres agrégés de la plateforme, sans aucune donnée personnelle."""
        r = self.client.get('/api/chiffres-publics/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.data['saison'], r.data['joueurs'], r.data['matchs_codes']), ('2026-2027', 27, 0))
        self.assertEqual({c['sigle'] for c in r.data['clubs']}, {'EJ', 'USC'})  # les clubs des compétitions de la saison
        self.assertEqual(r.data['competitions'], [{'nom': 'Ligue Haïtienne D1', 'niveau': 'D1', 'clubs': 2}])
        self.assertIsNone(r.data['moyennes']['xg_p90'])  # aucun joueur classé pour l'instant
        self.assertNotIn('telephone', str(r.data))


# ================================================================ Direct en temps réel (SRS HAITI SCOUT AI)
class Test_NFR008_Synchronisation_sans_doublon(Base):
    def test_meme_cle_meme_evenement(self):
        """Un événement renvoyé après une coupure réseau, avec la même clé, n'est enregistré qu'une fois."""
        match = self.creer_match()
        self.comme(self.analyste)
        self.client.post(f'/api/matchs/{match.id}/ouvrir-codage/')
        joueur, cle = self.effectifs[self.ej.id][7], str(uuid.uuid4())
        premier = self.coder(match, joueur, 'PASSE', cle_idempotence=cle)
        self.assertEqual(premier.status_code, 201, premier.data)
        renvoi = self.coder(match, joueur, 'PASSE', cle_idempotence=cle)
        self.assertEqual((renvoi.status_code, renvoi.data['id']), (200, premier.data['id']))
        self.assertEqual(Evenement.objects.filter(match=match).count(), 1)
        self.assertEqual(self.coder(match, joueur, 'PASSE').status_code, 201)  # la clé reste facultative
        self.assertIn('cle_idempotence', self.coder(match, joueur, 'PASSE', cle_idempotence='abc').data)
        autre = self.creer_match(journee=2)
        self.assertIn('cle_idempotence', self.coder(autre, joueur, 'PASSE', cle_idempotence=cle).data)
        r = self.client.patch(f"/api/evenements/{premier.data['id']}/", {'cle_idempotence': str(uuid.uuid4())},
                              format='json')
        self.assertEqual(r.status_code, 400)


class Test_FR057_Verification_IA(Base):
    """SRS HAITI SCOUT AI §10 (Human-in-the-Loop) : l'IA propose, l'analyste confirme, corrige ou rejette."""

    def setUp(self):
        self.match = self.creer_match(score=(0, 0))
        self.comme(self.analyste)
        self.client.post(f'/api/matchs/{self.match.id}/ouvrir-codage/')
        self.buteur = self.effectifs[self.ej.id][10]

    def proposer(self, **extra):
        corps = {'match': self.match.id, 'type_action': 'BUT', 'minute': 12, 'temps_video': 720, 'zone_x': 90,
                 'zone_y': 50, 'joueur': self.buteur.id, 'confiance': 0.91, 'modele': 'yolo-essai', **extra}
        return self.client.post('/api/propositions-ia/', {k: v for k, v in corps.items() if v is not None},
                                format='json')

    def decider(self, proposition, decision, **extra):
        return self.client.post(f"/api/propositions-ia/{proposition['id']}/valider/",
                                {'decision': decision, **extra}, format='json')

    def direct(self):
        return self.client.get(f'/api/matchs/{self.match.id}/direct/').data

    def test_FR057_proposition_hors_des_statistiques(self):
        r = self.proposer()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['statut'], r.data['club'], r.data['evenement']), ('PENDING', self.ej.id, None))
        self.assertFalse(Evenement.objects.filter(match=self.match).exists())
        d = self.direct()
        self.assertEqual((d['score'], d['propositions']['en_attente']), ([0, 0], 1))
        for role in (self.scout, self.directeur, self.client_ej):  # donnée non vérifiée : pas pour eux
            self.comme(role)
            self.assertEqual(self.client.get(f'/api/propositions-ia/?match={self.match.id}').status_code, 403)

    def test_AC008_confirmer(self):
        proposition = self.proposer().data
        r = self.decider(proposition, 'confirmer')
        self.assertEqual((r.status_code, r.data['statut']), (200, 'APPROVED'), r.data)
        evenement = Evenement.objects.get(pk=r.data['evenement'])
        self.assertEqual((evenement.source, evenement.statut_validation, evenement.confiance), ('AI', 'APPROVED', 0.91))
        self.assertEqual(evenement.valeur_xg, calculer_xg(90, 50))  # contrôlé et complété comme une saisie
        trace = r.data['historique'][0]
        self.assertEqual((trace['statut_avant'], trace['statut_apres'], trace['validateur']),
                         ('PENDING', 'APPROVED', self.analyste.id))
        d = self.direct()
        self.assertEqual((d['score'], d['sources']['ia_confirmes'], d['propositions']['en_attente']), ([1, 0], 1, 0))
        self.assertIn('déjà traitée', str(self.decider(proposition, 'rejeter').data))

    def test_AC008_corriger_un_joueur_non_identifie(self):
        """Une piste de suivi n'est pas une identité : l'analyste choisit le joueur, l'ancienne valeur est gardée."""
        proposition = self.proposer(joueur=None, piste='T07', club=self.ej.id, type_action='TIR').data
        self.assertIn('joueur', self.decider(proposition, 'confirmer').data)
        r = self.decider(proposition, 'corriger', joueur=self.buteur.id, resultat=False, commentaire='Maillot 11')
        self.assertEqual((r.status_code, r.data['statut']), (200, 'CORRECTED'), r.data)
        trace = r.data['historique'][0]
        self.assertEqual((trace['avant']['joueur'], trace['avant']['piste'], trace['apres']['joueur']),
                         (None, 'T07', self.buteur.id))
        self.assertEqual((trace['avant']['resultat'], trace['apres']['resultat'], trace['commentaire']),
                         (True, False, 'Maillot 11'))
        self.assertEqual(Evenement.objects.get(pk=r.data['evenement']).statut_validation, 'CORRECTED')
        # « corriger » sans rien changer reste une confirmation
        autre = self.proposer(type_action='PASSE').data
        self.assertEqual(self.decider(autre, 'corriger').data['statut'], 'APPROVED')

    def test_AC008_rejeter(self):
        proposition = self.proposer().data
        r = self.decider(proposition, 'rejeter', commentaire='Hors-jeu, but refusé')
        self.assertEqual((r.status_code, r.data['statut'], r.data['evenement']), (200, 'REJECTED', None))
        self.assertEqual(r.data['historique'][0]['commentaire'], 'Hors-jeu, but refusé')
        self.assertEqual(self.direct()['score'], [0, 0])
        self.assertIn('decision', self.decider(self.proposer().data, 'valider').data)

    def test_decision_par_l_analyste_qui_code(self):
        proposition = self.proposer().data
        self.comme(self.analyste2)
        self.assertEqual(self.decider(proposition, 'confirmer').status_code, 400)
        self.assertEqual(PropositionIA.objects.get(pk=proposition['id']).statut, 'PENDING')

    def test_controles_de_la_proposition(self):
        self.assertIn('joueur', self.proposer(joueur=self.joueur_d2.id).data)  # RG3
        self.assertIn('club', self.proposer(joueur=None, club=self.d2.id).data)
        self.assertIn('confiance', self.proposer(confiance=1.4).data)
        self.assertIn('confiance', self.proposer(confiance=None).data)
        self.assertIn('minute', self.proposer(minute=130).data)
        clos = self.creer_match(etat=EtatMatch.STATS_PUBLIEES, journee=2)
        self.assertIn('match', self.proposer(match=clos.id).data)
        self.comme(self.scout)
        self.assertEqual(self.proposer().status_code, 403)

    def test_lot_et_renvoi_sans_doublon(self):
        lot = [{'match': self.match.id, 'type_action': 'PASSE', 'minute': m, 'temps_video': m * 60, 'confiance': 0.7,
                'piste': f'T{m}', 'cle_idempotence': str(uuid.uuid4())} for m in (3, 4)]
        r = self.client.post('/api/propositions-ia/', lot, format='json')
        self.assertEqual((r.status_code, len(r.data)), (201, 2), r.data)
        self.assertEqual(self.client.post('/api/propositions-ia/', lot, format='json').status_code, 200)
        self.assertEqual(PropositionIA.objects.filter(match=self.match).count(), 2)
        mauvais = [{**lot[0], 'cle_idempotence': str(uuid.uuid4())}, {**lot[1], 'minute': 500, 'cle_idempotence': None}]
        r = self.client.post('/api/propositions-ia/', mauvais, format='json')
        self.assertIn('proposition 2', r.data)
        self.assertEqual(PropositionIA.objects.filter(match=self.match).count(), 2)  # le lot entier est refusé

    def test_match_valide_avec_propositions_non_verifiees(self):
        self.coder(self.match, self.buteur, 'PASSE')
        self.proposer()
        r = self.client.post(f'/api/matchs/{self.match.id}/valider/')
        self.assertEqual((r.status_code, r.data['propositions_non_verifiees']), (200, 1), r.data)
        proposition = PropositionIA.objects.get(match=self.match)
        self.assertEqual((proposition.statut, proposition.validations.get().statut_apres), ('UNVERIFIED', 'UNVERIFIED'))
        self.assertEqual(Evenement.objects.filter(match=self.match).count(), 1)  # le but proposé n'est pas compté

    def test_correction_d_un_evenement_historisee(self):
        proposition = self.proposer(type_action='PASSE').data
        evenement = self.decider(proposition, 'confirmer').data['evenement']
        r = self.client.patch(f'/api/evenements/{evenement}/', {'minute': 14, 'commentaire': 'Horloge'}, format='json')
        self.assertEqual((r.status_code, r.data['statut_validation']), (200, 'CORRECTED'), r.data)
        trace = ValidationEvenement.objects.filter(evenement_id=evenement).first()
        self.assertEqual((trace.avant['minute'], trace.apres['minute'], trace.commentaire), (12, 14, 'Horloge'))
        humain = self.coder(self.match, self.buteur, 'DUEL').data  # une saisie de l'analyste reste « confirmée »
        r = self.client.patch(f"/api/evenements/{humain['id']}/", {'resultat': False}, format='json')
        self.assertEqual((r.data['source'], r.data['statut_validation']), ('HUMAN', 'APPROVED'))
        self.assertTrue(ValidationEvenement.objects.filter(evenement_id=humain['id']).exists())
        # supprimer l'événement venu de l'IA revient à rejeter la proposition
        self.assertEqual(self.client.delete(f'/api/evenements/{evenement}/').status_code, 204)
        self.assertEqual(PropositionIA.objects.get(pk=proposition['id']).statut, 'REJECTED')


class Test_SRS4_Roles_du_club(Base):
    """SRS HAITI SCOUT AI §4 : administrateur de club, entraîneur et joueur, limités à leur club et à son
    abonnement (formule Pro du jeu d'essai : D1 et D2, 5 comptes pour le personnel du club)."""

    def setUp(self):
        self.payer(self.abonner()['factures'][0])
        self.admin_club = self.compte('adminej', Role.CLUB_ADMIN)
        self.coach = self.compte('coachej', Role.COACH)

    def compte(self, identifiant, role, club=None, **extra):
        return Utilisateur.objects.create_user(identifiant, MDP, nom=identifiant.title(), prenom='Test', role=role,
                                               club=club or self.ej, **extra)

    def nouveau(self, identifiant, role, **extra):
        return self.client.post('/api/utilisateurs/', {'nom': identifiant.title(), 'prenom': 'Test', 'role': role,
                                                       'nom_utilisateur': identifiant, **extra}, format='json')

    def test_admin_de_club_gere_les_membres_de_son_club(self):
        self.comme(self.admin_club)
        r = self.nouveau('coach2', 'COACH', club=self.usc.id)
        self.assertEqual((r.status_code, r.data['club']), (201, self.ej.id), r.data)  # toujours son propre club
        self.assertIn('role', self.nouveau('analyste9', 'ANALYSTE').data)
        self.assertIn('role', self.nouveau('admin9', 'ADMIN').data)
        joueur = self.effectifs[self.ej.id][3]
        r = self.nouveau('joueur1', 'JOUEUR', joueur=joueur.id)
        self.assertEqual((r.status_code, r.data['joueur_nom']), (201, joueur.nom_complet), r.data)
        self.assertIn('déjà un compte', str(self.nouveau('joueur2', 'JOUEUR', joueur=joueur.id).data))
        self.assertIn('ne joue pas', str(self.nouveau('joueur3', 'JOUEUR', joueur=self.effectifs[self.usc.id][0].id).data))
        self.assertIn('joueur', self.nouveau('joueur4', 'JOUEUR').data)
        # il ne voit et ne gère que les entraîneurs et joueurs de son club
        noms = {u['nom_utilisateur'] for u in self.client.get('/api/utilisateurs/').data['results']}
        self.assertEqual(noms, {'coachej', 'coach2', 'joueur1'})
        self.assertEqual(self.client.patch(f'/api/utilisateurs/{self.client_ej.id}/', {'nom': 'X'}).status_code, 404)
        # la formule compte le personnel (client, administrateur, entraîneurs : 4 sur 5), pas les joueurs
        self.assertEqual(self.nouveau('coach3', 'COACH').status_code, 201)
        self.assertIn('club', self.nouveau('coach4', 'COACH').data)
        self.assertEqual(self.nouveau('joueur5', 'JOUEUR', joueur=self.effectifs[self.ej.id][4].id).status_code, 201)
        self.comme(self.coach)
        self.assertEqual(self.client.get('/api/utilisateurs/').status_code, 403)

    def test_FR011_admin_de_club_gere_les_joueurs_de_son_club(self):
        self.comme(self.admin_club)
        fiche = {'nom': 'Joseph', 'prenom': 'Wilson', 'date_naissance': '2001-03-12', 'poste': 'BU',
                 'pied_fort': 'D', 'club_actuel': self.ej.id}
        self.assertEqual(self.client.post('/api/joueurs/', fiche).status_code, 201)
        self.assertEqual(self.client.post('/api/joueurs/', {**fiche, 'nom': 'Autre', 'club_actuel': self.usc.id}).status_code, 403)
        sien, autre = self.effectifs[self.ej.id][0], self.effectifs[self.usc.id][0]
        self.assertEqual(self.client.patch(f'/api/joueurs/{sien.id}/', {'taille': 181}).status_code, 200)
        self.assertEqual(self.client.patch(f'/api/joueurs/{autre.id}/', {'taille': 181}).status_code, 403)
        self.assertEqual(self.client.patch(f'/api/joueurs/{sien.id}/', {'club_actuel': self.usc.id}).status_code, 403)
        self.assertEqual(self.client.delete(f'/api/joueurs/{sien.id}/').status_code, 403)

    def test_entraineur_consulte_les_analyses(self):
        self.comme(self.coach)
        self.assertEqual(self.client.post('/api/joueurs/', {}).status_code, 403)  # consultation seulement
        self.assertEqual(self.client.get('/api/rapports/').status_code, 200)
        self.assertEqual(self.client.get('/api/matchs/').status_code, 200)
        sien, autre = self.effectifs[self.ej.id][0], self.effectifs[self.usc.id][0]
        # données personnelles : celles de ses joueurs seulement
        self.assertEqual(self.client.get(f'/api/joueurs/{sien.id}/').data['telephone'], '+509 3700 0000')
        self.assertEqual(self.client.get(f'/api/joueurs/{autre.id}/').data['telephone'], '')
        cartes = {c['libelle'] for c in self.client.get('/api/tableau-de-bord/').data['cartes']}
        self.assertTrue({'Joueurs suivis', 'Formule', 'Shortlists'} <= cartes)

    def test_joueur_ne_voit_que_sa_fiche(self):
        moi, autre = self.effectifs[self.ej.id][3], self.effectifs[self.ej.id][4]
        self.comme(self.compte('joueurej', Role.JOUEUR, joueur=moi))
        r = self.client.get('/api/joueurs/')
        self.assertEqual([j['id'] for j in r.data['results']], [moi.id])
        self.assertEqual(self.client.get(f'/api/joueurs/{autre.id}/').status_code, 404)
        r = self.client.get(f'/api/joueurs/{moi.id}/radar/')
        self.assertEqual((r.status_code, r.data['joueur']['telephone'], r.data['dernier_rapport']),
                         (200, '+509 3700 0000', None))
        for adresse in ('/api/matchs/', '/api/rapports/', '/api/statistiques/', '/api/utilisateurs/', '/api/shortlists/'):
            self.assertEqual(self.client.get(adresse).status_code, 403, adresse)
        cartes = self.client.get('/api/tableau-de-bord/').data['cartes']
        self.assertIn({'libelle': 'Ma fiche', 'valeur': moi.nom_complet, 'ecran': 'MaFiche'}, cartes)
        self.assertEqual(self.client.post('/api/exports/', {'type': 'joueur', 'id': moi.id}, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/exports/', {'type': 'joueur', 'id': autre.id}, format='json').status_code, 404)

    def test_RG9_sans_abonnement_actif(self):
        for role in (Role.COACH, Role.CLUB_ADMIN):
            self.comme(self.compte(f'usc_{role.lower()}', role, club=self.usc))
            self.assertEqual(self.client.get('/api/joueurs/').status_code, 403)
        self.comme(self.compte('usc_joueur', Role.JOUEUR, club=self.usc, joueur=self.effectifs[self.usc.id][0]))
        self.assertEqual(self.client.get('/api/joueurs/').status_code, 403)


class Test_MOD08_Analyse_tactique(Base):
    """SRS HAITI SCOUT AI §11 : indicateurs tactiques calculés sur les événements officiels, avec leurs limites."""

    def setUp(self):
        self.match = self.creer_match(etat=EtatMatch.EN_CODAGE)
        self.ej_joueurs, self.usc_joueurs = self.effectifs[self.ej.id], self.effectifs[self.usc.id]

    def action(self, joueur, type_action, x, y=50, minute=10, temps=None, **extra):
        return Evenement.objects.create(match=self.match, joueur=joueur, type_action=type_action, zone_x=x, zone_y=y,
                                        minute=minute, temps_video=temps if temps is not None else minute * 60, **extra)

    def tactique(self, utilisateur=None, **parametres):
        self.comme(utilisateur or self.scout)
        return self.client.get(f'/api/matchs/{self.match.id}/tactique/', parametres)

    def test_formation_declaree_et_observee(self):
        """Titulaires d'EJ : G, 4 défenseurs, 4 milieux, 2 attaquants (jeu d'essai)."""
        lignes = {1: 20, 2: 20, 3: 20, 4: 20, 5: 50, 6: 50, 7: 50, 8: 50, 9: 80, 10: 80}
        for rang, x in lignes.items():
            for _ in range(4):
                self.action(self.ej_joueurs[rang], 'PASSE', x, y=10 + 8 * rang)
        r = self.tactique()
        self.assertEqual(r.status_code, 200, r.data)
        ej = r.data['equipes']['domicile']
        self.assertEqual(ej['formation']['declaree'], '4-4-2')
        self.assertEqual(ej['formation']['observee']['schema'], '4-4-2')
        # actions du 10e au 90e centile : y de 25,2 à 82,8 (57,6 % de 68 m), x de 20 à 80 (60 % de 105 m) ;
        # ligne défensive à 20 % de 105 m
        self.assertEqual(ej['bloc'], {'largeur_m': 39.2, 'longueur_m': 63.0, 'hauteur_defense_m': 21.0})
        position = next(p for p in ej['positions_moyennes'] if p['joueur'] == self.ej_joueurs[5].id)
        self.assertEqual((position['x'], position['actions'], position['fiable']), (50.0, 4, False))
        self.assertIn('peu fiables', ' '.join(ej['avertissements']))  # 40 actions seulement
        self.assertIsNone(r.data['equipes']['exterieur']['formation']['observee'])  # USC n'a rien de codé
        self.assertEqual(sum(ej['carte_activite']['cases']), 40)
        self.assertIn('pressing', r.data['definitions'])

    def test_passes_progressives(self):
        passeur = self.ej_joueurs[6]
        cas = [(10, 45, True), (10, 35, True), (40, 60, True), (60, 70, True), (10, 45, False)]
        for depart, arrivee, reussie in cas:
            self.action(passeur, 'PASSE', depart, fin_x=arrivee, fin_y=50, resultat=reussie)
        self.action(passeur, 'PASSE', 10)  # réussie, mais sans point d'arrivée
        progressives = self.tactique().data['equipes']['domicile']['passes_progressives']
        self.assertEqual((progressives['nombre'], progressives['passes_classables'], progressives['passes_reussies']),
                         (3, 4, 5))
        # 36,8 m dans sa moitié (≥ 30), 21 m d'une moitié à l'autre (≥ 15), 10,5 m chez l'adversaire (≥ 10)
        self.assertEqual([p['gain_m'] for p in progressives['detail']], [36.8, 21.0, 10.5])

    def test_pressing_et_transitions(self):
        for _ in range(6):  # USC fait circuler dans ses 60 % défensifs
            self.action(self.usc_joueurs[5], 'PASSE', 30)
        self.action(self.ej_joueurs[9], 'DUEL', 70)
        self.action(self.ej_joueurs[9], 'FAUTE', 75)
        self.action(self.ej_joueurs[2], 'INTERCEPTION', 20)  # dans sa propre moitié : pas du pressing
        self.action(self.ej_joueurs[9], 'RECUPERATION', 65, temps=100)
        self.action(self.ej_joueurs[10], 'TIR', 90, temps=110)  # 10 s après : transition rapide
        self.action(self.ej_joueurs[3], 'RECUPERATION', 30, temps=300)
        ej = self.tactique().data['equipes']['domicile']
        self.assertEqual(ej['pressing'], {'ppda': 3.0, 'passes_adverses': 6, 'actions_defensives': 2})
        self.assertEqual(ej['transitions'], {'recuperations': 3, 'recuperations_hautes': 1, 'suivies_d_un_tir': 1})

    def test_periode_et_droits(self):
        self.action(self.ej_joueurs[5], 'PASSE', 50, minute=10)
        self.action(self.ej_joueurs[5], 'PASSE', 50, minute=70)
        self.assertEqual(self.tactique(fin=45).data['equipes']['domicile']['actions'], 1)
        self.assertEqual(self.tactique(debut=46).data['equipes']['domicile']['actions'], 1)
        self.assertEqual(self.tactique(fin='x').status_code, 400)
        self.assertEqual(self.tactique(self.agent).status_code, 403)


class FauxRTSP:
    """Petit serveur local qui répond à la requête OPTIONS comme une caméra IP."""

    def __init__(self, reponse=b'RTSP/1.0 200 OK\r\nCSeq: 1\r\nPublic: DESCRIBE, SETUP, PLAY\r\n\r\n'):
        self.reponse = reponse
        self.prise = socket.create_server(('127.0.0.1', 0))
        self.port = self.prise.getsockname()[1]
        threading.Thread(target=self.servir, daemon=True).start()

    def servir(self):
        while True:
            try:
                connexion, _ = self.prise.accept()
            except OSError:
                return
            with connexion:
                connexion.recv(1024)
                connexion.sendall(self.reponse)

    def fermer(self):
        self.prise.close()


class FauxHLS(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path == '/live.m3u8':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'#EXTM3U\n')
        else:
            self.send_error(404)

    def log_message(self, *args):
        pass


def port_ferme():
    with socket.create_server(('127.0.0.1', 0)) as prise:
        return prise.getsockname()[1]


class Test_FR040_Cameras(Base):
    """SRS HAITI SCOUT AI, MOD-05 : caméras des stades, état du flux, calibrage et connexion à un match."""

    def setUp(self):
        self.rtsp = FauxRTSP()
        self.addCleanup(self.rtsp.fermer)
        self.http = http.server.ThreadingHTTPServer(('127.0.0.1', 0), FauxHLS)
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        self.addCleanup(self.http.server_close)
        self.addCleanup(self.http.shutdown)

    def camera(self, **extra):
        self.comme(self.admin)
        corps = {'nom': 'Tribune centrale', 'stade': 'Parc Pinchinat', 'protocole': 'RTSP',
                 'url_flux': f'rtsp://admin:secret@127.0.0.1:{self.rtsp.port}/stream1', 'largeur': 1920,
                 'hauteur': 1080, 'fps': 50, **extra}
        return self.client.post('/api/cameras/', corps, format='json')

    def test_FR040_FR042_configurer_une_camera(self):
        self.comme(self.analyste)  # l'analyste vérifie et calibre, mais n'installe pas
        self.assertEqual(self.client.post('/api/cameras/', {}, format='json').status_code, 403)
        r = self.camera()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['etat'], r.data['fps'], r.data['largeur']), ('NON_TESTEE', 50, 1920))
        self.assertNotIn('secret', str(r.data))  # le mot de passe du flux ne se relit pas…
        self.assertIn('admin:***@127.0.0.1', r.data['url_flux_affichee'])
        self.assertNotIn('secret', str(OperationAudit.objects.filter(table_concernee='camera').last().valeur_apres))
        self.assertIn('url_flux', self.camera(nom='B', url_flux='https://exemple.ht/live.m3u8').data)  # pas du RTSP
        self.assertIn('url_flux', self.camera(nom='C', url_flux='rtsp://127.0.0.1:99999/x').data)
        self.assertIn('fps', self.camera(nom='D', fps=5).data)
        self.assertEqual(self.camera().status_code, 400)  # même nom dans le même stade
        self.comme(self.scout)
        self.assertEqual(self.client.get('/api/cameras/').status_code, 403)

    def test_FR041_etat_et_qualite_du_flux(self):
        camera = self.camera().data
        self.comme(self.analyste)
        r = self.client.post(f"/api/cameras/{camera['id']}/verifier/")
        self.assertEqual((r.status_code, r.data['etat']), (200, 'EN_LIGNE'), r.data)
        self.assertIsInstance(r.data['latence_ms'], int)
        self.assertEqual(self.client.get(f"/api/cameras/{camera['id']}/etat/").data['etat'], 'EN_LIGNE')
        refus = FauxRTSP(b'RTSP/1.0 401 Unauthorized\r\nCSeq: 1\r\n\r\n')
        self.addCleanup(refus.fermer)
        cas = [(f'rtsp://127.0.0.1:{refus.port}/s', 'ERREUR', 'mot de passe'),
               (f'rtsp://127.0.0.1:{port_ferme()}/s', 'HORS_LIGNE', 'Connexion impossible')]
        for rang, (url, etat, message) in enumerate(cas):
            autre = self.camera(nom=f'Angle {rang}', url_flux=url).data
            self.comme(self.analyste)
            r = self.client.post(f"/api/cameras/{autre['id']}/verifier/")
            self.assertEqual(r.data['etat'], etat, r.data)
            self.assertIn(message, r.data['message_etat'])
        port = self.http.server_address[1]
        hls = self.camera(nom='Web', protocole='HLS', url_flux=f'http://127.0.0.1:{port}/live.m3u8').data
        self.assertEqual(hls['url_lecture'], f'http://127.0.0.1:{port}/live.m3u8')  # lisible tel quel
        self.assertEqual(self.client.post(f"/api/cameras/{hls['id']}/verifier/").data['etat'], 'EN_LIGNE')
        r = self.client.patch(f"/api/cameras/{hls['id']}/", {'url_flux': f'http://127.0.0.1:{port}/absent.m3u8'},
                              format='json')
        self.assertEqual(r.data['etat'], 'NON_TESTEE')  # nouvelle adresse : à vérifier de nouveau
        r = self.client.post(f"/api/cameras/{hls['id']}/verifier/")
        self.assertEqual((r.data['etat'], r.data['message_etat']), ('ERREUR', 'Le serveur vidéo répond 404.'))

    def test_FR043_calibrage(self):
        camera = self.camera().data
        self.comme(self.analyste)
        aligne = {'reference': 'TERRAIN', 'coins': [[10, 10], [20, 20], [30, 30], [40, 40]]}
        self.assertIn('coins', self.client.post(f"/api/cameras/{camera['id']}/calibrer/", aligne, format='json').data)
        self.assertIn('reference', self.client.post(f"/api/cameras/{camera['id']}/calibrer/",
                                                    {**aligne, 'reference': 'X'}, format='json').data)
        bon = {'reference': 'MOITIE', 'coins': [[12, 20], [88, 21], [97, 85], [3, 84]]}
        r = self.client.post(f"/api/cameras/{camera['id']}/calibrer/", bon, format='json')
        self.assertEqual((r.status_code, r.data['calibrage']), (200, bon), r.data)

    def test_FR031_connecter_une_camera_au_match(self):
        match = self.creer_match(etat=EtatMatch.PLANIFIE)
        Match.objects.filter(pk=match.pk).update(video_url='', stade='Parc Pinchinat')
        lecture = 'https://cdn.exemple.ht/pinchinat/live.m3u8'
        camera = self.camera(url_lecture=lecture).data
        self.comme(self.analyste)
        r = self.client.post('/api/enregistrements/', {'match': match.id, 'camera': camera['id']}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        match.refresh_from_db()
        self.assertEqual((match.video_url, match.etat), (lecture, 'VIDEO_IMPORTEE'))  # le codage peut commencer
        tableau = self.client.get(f'/api/matchs/{match.id}/direct/').data
        self.assertEqual([(c['nom'], c['etat']) for c in tableau['cameras']], [('Tribune centrale', 'EN_LIGNE')])
        autre = self.creer_match(etat=EtatMatch.PLANIFIE, journee=2)
        r2 = self.client.post('/api/enregistrements/', {'match': autre.id, 'camera': camera['id']}, format='json')
        self.assertIn('filme déjà', str(r2.data))
        r = self.client.post(f"/api/enregistrements/{r.data['id']}/arreter/")
        self.assertIsNotNone(r.data['fin'])
        self.assertEqual(self.client.get(f'/api/matchs/{match.id}/direct/').data['cameras'], [])
        # caméra d'un autre stade, puis caméra éteinte : refusées ; l'état mesuré reste enregistré
        ailleurs = self.camera(nom='Sylvio Cator', stade='Stade Sylvio Cator').data
        self.comme(self.analyste)
        r = self.client.post('/api/enregistrements/', {'match': match.id, 'camera': ailleurs['id']}, format='json')
        self.assertIn('Sylvio Cator', str(r.data))
        eteinte = self.camera(nom='Virage', url_flux=f'rtsp://127.0.0.1:{port_ferme()}/s').data
        self.comme(self.analyste)
        r = self.client.post('/api/enregistrements/', {'match': match.id, 'camera': eteinte['id']}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('injoignable', str(r.data))
        self.assertEqual(Camera.objects.get(pk=eteinte['id']).etat, 'HORS_LIGNE')


class Test_FR035_Direct_WebSocket(TransactionTestCase):
    """FR-035 : le direct est poussé aux écrans par WebSocket dès qu'un événement est codé.
    TransactionTestCase : le consommateur lit la base hors de la transaction du test."""

    def setUp(self):
        Base.setUpTestData.__func__(self)
        self.match = Base.creer_match(self, etat=EtatMatch.EN_CODAGE)
        Match.objects.filter(pk=self.match.pk).update(verrouille_par=self.analyste, verrouille_le=timezone.now())
        self.client = APIClient()
        self.client.force_authenticate(self.analyste)

    def ecouter(self, utilisateur, scenario):
        """Ouvre le WebSocket du match, s'identifie avec le jeton de `utilisateur`, puis joue `scenario`."""
        from config.asgi import application
        jeton = Token.objects.create(user=utilisateur).key if utilisateur else 'inconnu'

        async def deroule():
            ws = WebsocketCommunicator(application, f'/ws/matches/{self.match.id}/live/')
            connecte, _ = await ws.connect()
            self.assertTrue(connecte)
            await ws.send_json_to({'type': 'auth', 'jeton': jeton})
            try:
                return await scenario(ws)
            finally:
                await ws.disconnect()

        return async_to_sync(deroule)()

    def test_FR035_but_pousse_aux_ecrans(self):
        buteur = self.effectifs[self.ej.id][10]

        async def scenario(ws):
            instantane = await ws.receive_json_from(timeout=5)
            self.assertEqual((instantane['type'], instantane['version'], instantane['tableau']['score']),
                             ('match.snapshot', 1, [0, 0]))
            r = await database_sync_to_async(Base.coder)(self, self.match, buteur, 'BUT',
                                                         cle_idempotence=str(uuid.uuid4()))
            self.assertEqual(r.status_code, 201, r.data)
            cree = await ws.receive_json_from(timeout=5)
            self.assertEqual((cree['type'], cree['donnees']['id'], cree['cle_idempotence']),
                             ('match.event.created', r.data['id'], r.data['cle_idempotence']))
            self.assertEqual(cree['tableau']['score'], [1, 0])
            score = await ws.receive_json_from(timeout=5)
            self.assertEqual(score['type'], 'match.score.updated')
            self.assertNotEqual(score['id'], cree['id'])  # chaque message a son identifiant
            await database_sync_to_async(self.client.delete)(f"/api/evenements/{r.data['id']}/")
            efface = await ws.receive_json_from(timeout=5)
            self.assertEqual((efface['type'], efface['donnees'], efface['tableau']['score']),
                             ('match.event.deleted', {'id': r.data['id']}, [0, 0]))
            # la réponse au ping et la diffusion arrivent par deux files : leur ordre n'est pas garanti
            await ws.send_json_to({'type': 'ping'})
            recus = {(await ws.receive_json_from(timeout=5))['type'] for _ in range(2)}
            self.assertEqual(recus, {'match.score.updated', 'pong'})

        self.ecouter(self.scout, scenario)

    def test_acces_refuse(self):
        def ferme(code):
            async def scenario(ws):
                sortie = await ws.receive_output(timeout=5)
                self.assertEqual((sortie['type'], sortie['code']), ('websocket.close', code))
            return scenario

        self.ecouter(None, ferme(4401))  # jeton inconnu
        self.ecouter(self.agent, ferme(4403))  # rôle commercial
        self.ecouter(self.client_ej, ferme(4403))  # club client sans abonnement actif (RG9)
        Match.objects.filter(pk=self.match.pk).delete()
        self.ecouter(self.scout, ferme(4404))


class Test_FR052_Pistes_IA(Base):
    """SRS §9.1 et §15 : une piste est un identifiant temporaire, pas un joueur ; elle ne touche pas aux statistiques."""

    def setUp(self):
        self.match = self.creer_match(score=(0, 0))
        self.comme(self.analyste)
        self.client.post(f'/api/matchs/{self.match.id}/ouvrir-codage/')
        self.joueur = self.effectifs[self.ej.id][10]

    def envoyer(self, points):
        return self.client.post('/api/pistes-ia/', points, format='json')

    def point(self, t, piste='T7', **extra):
        return {'match': self.match.id, 'piste': piste, 'temps_video': t, 'x': 40, 'y': 55, 'confiance': 0.8,
                'modele': 'bytetrack-essai', **extra}

    def test_FR052_lot_et_renvoi_sans_doublon(self):
        lot = [self.point(t) for t in (0, 0.5, 1)]
        r = self.envoyer(lot)
        self.assertEqual((r.status_code, r.data['enregistres']), (201, 3), r.data)
        r = self.envoyer(lot + [self.point(1.5)])
        self.assertEqual((r.data['enregistres'], r.data['ignores']), (1, 3))
        self.assertEqual(len(self.client.get(f'/api/pistes-ia/?match={self.match.id}&piste=T7').data), 4)

    def test_FR052_lot_refuse_en_entier(self):
        r = self.envoyer([self.point(0), self.point(1, x=140)])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.get(f'/api/pistes-ia/?match={self.match.id}').data, [])

    def test_FR052_piste_sans_identite_puis_identifiee(self):
        self.envoyer([self.point(0), self.point(1)])
        pistes = self.client.get(f'/api/pistes-ia/?match={self.match.id}').data
        self.assertTrue(all(p['joueur'] is None for p in pistes))
        r = self.client.post('/api/pistes-ia/identifier/',
                             {'match': self.match.id, 'piste': 'T7', 'joueur': self.joueur.id}, format='json')
        self.assertEqual((r.status_code, r.data['points']), (200, 2), r.data)
        pistes = self.client.get(f'/api/pistes-ia/?match={self.match.id}&joueur={self.joueur.id}').data
        self.assertEqual(len(pistes), 2)
        self.assertEqual(self.client.post('/api/pistes-ia/identifier/', {'match': self.match.id, 'piste': 'T9',
                                          'joueur': self.joueur.id}, format='json').status_code, 400)

    def test_FR052_reserve_aux_analystes(self):
        for compte in (self.scout, self.agent):
            self.comme(compte)
            self.assertEqual(self.client.get(f'/api/pistes-ia/?match={self.match.id}').status_code, 403)
            self.assertEqual(self.envoyer([self.point(0)]).status_code, 403)

    def test_FR055_heatmap_signale_ses_limites(self):
        self.envoyer([self.point(t, x=10, y=10) for t in range(3)] + [self.point(5, x=100, y=100)])
        d = self.client.get(f'/api/pistes-ia/heatmap/?match={self.match.id}').data
        self.assertEqual((d['points'], d['grille'][1][2], d['grille'][11][19], d['maximum']), (4, 3, 1, 3))
        self.assertEqual((d['statut'], d['pistes_sans_identite']), ('UNVERIFIED', 1))
        self.assertTrue(any('Peu de points' in a for a in d['avertissements']))
        vide = self.client.get(f'/api/pistes-ia/heatmap/?match={self.match.id}&confiance_min=0.99').data
        self.assertEqual((vide['points'], vide['confiance_moyenne']), (0, None))


class Test_Sante(APITestCase):
    def test_sante_sans_connexion(self):
        r = self.client.get('/sante/')
        self.assertEqual((r.status_code, r.json()), (200, {'etat': 'ok'}))


class Test_Matchs_En_Direct_Publics(Base):
    """Page d'accueil : score et minute des matchs codés en ce moment, sans compte, sans autre donnée."""

    def test_liste_publique_des_matchs_suivis(self):
        match = self.creer_match(score=(0, 0))
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/matchs-en-direct/').json(), [])  # rien n'est codé
        self.comme(self.analyste)
        self.client.post(f'/api/matchs/{match.id}/ouvrir-codage/')
        self.client.force_authenticate(None)
        r = self.client.get('/api/matchs-en-direct/')
        self.assertEqual(r.status_code, 200)
        (m,) = r.json()
        self.assertEqual((m['id'], m['score'], m['minute']), (match.id, [0, 0], 0))
        self.assertEqual(set(m), {'id', 'competition', 'journee', 'stade', 'domicile', 'exterieur', 'score', 'minute'})
        Match.objects.filter(pk=match.id).update(verrouille_le=timezone.now() - timezone.timedelta(hours=3))
        self.assertEqual(self.client.get('/api/matchs-en-direct/').json(), [])  # codage abandonné
