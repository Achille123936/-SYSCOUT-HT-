"""Jeu de données de démonstration (clubs, joueurs et matchs fictifs) : python manage.py seed"""
import random
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.models import (GROUPE_POSTE, Abonnement, Club, Competition, Composition, EtatAbonnement, EtatMatch,
                         EtatRapport, Evenement, Formule, HistoriqueClub, Joueur, Match, RapportScouting, Role, Saison,
                         Shortlist, TypeAction, Utilisateur)
from core.services import ajouter_mois, apres_paiement, calculer_xg, generer_facture, recalculer_saison
from core.models import Paiement

MOT_DE_PASSE = 'Syscout2026'

CLUBS = [  # nom, sigle, ville, département, stade, division
    ('Étoile de Jacmel FC', 'EJ', 'Jacmel', 'Sud-Est', 'Parc Pinchinat', 'D1'),
    ('Union Sportive des Cayes', 'USC', 'Les Cayes', 'Sud', 'Parc Larco', 'D1'),
    ('Lions du Cap', 'LDC', 'Cap-Haïtien', 'Nord', 'Parc Saint-Victor', 'D1'),
    ('Flamme des Gonaïves', 'FDG', 'Gonaïves', 'Artibonite', 'Parc Vincent', 'D1'),
    ('Soleil de Pétion-Ville', 'SPV', 'Pétion-Ville', 'Ouest', 'Stade de la Montagne', 'D1'),
    ('Vague de Saint-Marc', 'VSM', 'Saint-Marc', 'Artibonite', 'Parc Levelt', 'D1'),
    ('Colibri de Hinche', 'CDH', 'Hinche', 'Centre', 'Parc Charlemagne', 'D2'),
    ('Mapou de Jérémie', 'MDJ', 'Jérémie', "Grand'Anse", 'Parc Dumas', 'D2'),
    ('Académie Timoun Foutbòl', 'ATF', 'Port-au-Prince', 'Ouest', 'Terrain Sainte-Thérèse', 'ACADEMIE'),
]
PRENOMS = ['Ricardo', 'Mackenson', 'Jean-Marc', 'Peterson', 'Kervens', 'Steeve', 'Fritz', 'Daniel', 'Jameson',
           'Frantzy', 'Evens', 'Woodly', 'Stanley', 'Wesley', 'Jhon', 'Bradley', 'Djimy', 'Roody', 'Samuel', 'Alex',
           'Mikael', 'Schneider', 'Louicius', 'Duckens', 'Bryan', 'Carl', 'Derrick', 'Ronaldo', 'Garven', 'Josué',
           'Emmanuel', 'Nathan', 'Christopher', 'Andy', 'Belmar', 'Clifford', 'Dieuvens', 'Fabrice', 'Guerby', 'Hervé']
NOMS = ['Désir', 'Dorval', 'Pierre', 'Alexis', 'Lafleur', 'Michel', 'Jean-Louis', 'Saint-Fleur', 'Toussaint', 'Noël',
        'Rémy', 'Céus', 'Baptiste', 'Charles', 'Estimé', 'François', 'Guerrier', 'Hilaire', 'Innocent', 'Jacques',
        'Louis', 'Métellus', 'Nazon', 'Octave', 'Paul', 'Renaud', 'Sanon', 'Thélusma', 'Valcin', 'Zéphirin',
        'Bien-Aimé', 'Cadet', 'Dorcé', 'Exantus', 'Fleurimond', 'Germain', 'Hyppolite', 'Isidor', 'Joachim', 'Lubin']
EFFECTIF = ['G', 'G', 'DC', 'DC', 'DC', 'DL', 'DL', 'MD', 'MD', 'MC', 'MC', 'MO', 'AIL', 'AIL', 'BU', 'BU']
ONZE = ['G', 'DC', 'DC', 'DL', 'DL', 'MD', 'MC', 'MC', 'MO', 'AIL', 'BU']

# événements par 90 minutes selon le groupe de postes
RYTHME = {
    'GARDIEN': {'PASSE': 10, 'RECUPERATION': 3, 'INTERCEPTION': 0.5, 'DUEL': 0.5},
    'DEFENSEUR': {'PASSE': 18, 'DUEL': 4, 'INTERCEPTION': 2.5, 'RECUPERATION': 3, 'FAUTE': 0.6, 'CENTRE': 0.7,
                  'DRIBBLE': 0.3},
    'MILIEU': {'PASSE': 23, 'DUEL': 3.5, 'INTERCEPTION': 1.3, 'RECUPERATION': 2.5, 'TIR': 0.7, 'DRIBBLE': 0.9,
               'FAUTE': 0.7, 'CENTRE': 0.6},
    'ATTAQUANT': {'PASSE': 11, 'DUEL': 3, 'TIR': 1.5, 'DRIBBLE': 1.6, 'RECUPERATION': 1, 'CENTRE': 1, 'FAUTE': 0.5},
}
ZONE_X = {'GARDIEN': (3, 14), 'DEFENSEUR': (15, 48), 'MILIEU': (35, 72), 'ATTAQUANT': (55, 92)}
BUTEURS = {'GARDIEN': 0, 'DEFENSEUR': 0.7, 'MILIEU': 2.5, 'ATTAQUANT': 6}


class Command(BaseCommand):
    help = 'Remplit la base avec des données de démonstration (efface les données existantes).'

    @transaction.atomic
    def handle(self, *args, **options):
        call_command('flush', interactive=False, verbosity=0)
        self.alea = random.Random(2026)
        self.alea_passes = random.Random(2027)  # tirage à part : les autres données de démonstration ne bougent pas
        self.niveau = {}
        self.utilisateurs()
        self.clubs_et_joueurs()
        self.matchs()
        nombre = recalculer_saison(self.saison)
        self.scouting()
        self.commercial()
        self.stdout.write(self.style.SUCCESS(
            f'{Club.objects.count()} clubs, {Joueur.objects.count()} joueurs, {Match.objects.count()} matchs, '
            f'{Evenement.objects.count()} événements, {nombre} statistiques.'))
        self.stdout.write(f'Comptes (mot de passe « {MOT_DE_PASSE} ») : admin, jpierre, mlindor, dsportif, agent, '
                          'client_ej, client_usc')

    def utilisateurs(self):
        def creer(identifiant, prenom, nom, role, **extra):
            return Utilisateur.objects.create_user(
                identifiant, MOT_DE_PASSE, prenom=prenom, nom=nom, role=role,
                courriel=f'{identifiant}@ayitidatafoot.ht', **extra)

        self.admin = creer('admin', 'Nadège', 'Laurent', Role.ADMIN, is_staff=True, is_superuser=True)
        self.analyste = creer('jpierre', 'Jacques', 'Pierre', Role.ANALYSTE)
        self.scout = creer('mlindor', 'Marc', 'Lindor', Role.SCOUT)
        self.directeur = creer('dsportif', 'Rose', 'Vilaire', Role.DIRECTEUR)
        self.agent = creer('agent', 'Guerline', 'Augustave', Role.AGENT)

    def clubs_et_joueurs(self):
        alea = self.alea
        self.clubs = [Club.objects.create(nom=n, sigle=s, ville=v, departement=d, stade=st, division=dv)
                      for n, s, v, d, st, dv in CLUBS]
        identites = [(p, n) for p in PRENOMS for n in NOMS]
        alea.shuffle(identites)
        for club in self.clubs:
            academie = club.division == 'ACADEMIE'
            for numero, poste in enumerate(EFFECTIF):
                prenom, nom = identites.pop()
                age = alea.randint(15, 17) if academie else alea.choice([17] + list(range(18, 34)) * 2)
                self.joueur(club, prenom, nom, poste, age, numero)
        # les deux attaquants de l'exemple du SEL (figure 3.5)
        self.wilson = self.joueur(self.clubs[0], 'Wilson', 'Joseph', 'BU', None, 98, naissance=date(2009, 3, 12),
                                  taille=178, poids=71, niveau=0.92)
        self.carlens = self.joueur(self.clubs[1], 'Carlens', 'Augustin', 'BU', None, 99, naissance=date(2004, 5, 2),
                                   taille=183, poids=77, niveau=0.8)

    def joueur(self, club, prenom, nom, poste, age, numero, naissance=None, taille=None, poids=None, niveau=None):
        alea = self.alea
        naissance = naissance or (date.today().replace(month=1, day=1) - timedelta(days=365 * age + alea.randint(-150, 200)))
        j = Joueur(club_actuel=club, prenom=prenom, nom=nom, poste=poste, date_naissance=naissance,
                   pied_fort=alea.choice(['D', 'D', 'D', 'G', '2']), taille=taille or alea.randint(165, 192),
                   poids=poids or alea.randint(60, 86), telephone=f'+509 3{alea.randint(100, 999)} {alea.randint(1000, 9999)}',
                   adresse=f'{club.ville}, {club.departement}')
        if j.est_mineur:  # RG12
            j.nom_tuteur, j.lien_tuteur = f'{alea.choice(["Marie", "Jean", "Rose", "Paul"])} {nom}', 'Parent'
            j.accord_tuteur.save(f'accord_{nom}_{prenom}.pdf'.lower().replace(' ', '_'),
                                 ContentFile(b'%PDF-1.4\n% accord du tuteur (exemple fictif)\n'), save=False)
        j.save()
        HistoriqueClub.objects.create(joueur=j, club=club, date_debut=date(2026, 7, 1),
                                      type_contrat=alea.choice(['AMATEUR', 'AMATEUR', 'PROFESSIONNEL']))
        self.niveau[j.id] = niveau if niveau is not None else alea.uniform(0.25, 0.85)
        return j

    def matchs(self):
        alea = self.alea
        ancienne = Saison.objects.create(libelle='2025-2026', date_debut=date(2025, 8, 1), date_fin=date(2026, 6, 30))
        self.saison = Saison.objects.create(libelle='2026-2027', date_debut=date(2026, 8, 1),
                                            date_fin=date(2027, 6, 30), est_courante=True)
        d1 = [c for c in self.clubs if c.division == 'D1']
        Competition.objects.create(nom='Ligue Haïtienne D1', saison=ancienne, niveau='D1', date_debut=date(2025, 8, 16),
                                   date_fin=date(2026, 5, 31)).clubs.set(d1)
        self.ligue = Competition.objects.create(nom='Ligue Haïtienne D1', saison=self.saison, niveau='D1',
                                                date_debut=date(2026, 8, 8), date_fin=date(2027, 5, 30))
        self.ligue.clubs.set(d1)
        d2 = Competition.objects.create(nom='Ligue Haïtienne D2', saison=self.saison, niveau='D2',
                                        date_debut=date(2026, 9, 5), date_fin=date(2027, 5, 23))
        d2.clubs.set([c for c in self.clubs if c.division == 'D2'])

        # calendrier aller-retour : 10 journées de 3 matchs, une par semaine
        tour = d1[:]
        journees = []
        for _ in range(5):
            journees.append([(tour[i], tour[5 - i]) for i in range(3)])
            tour = [tour[0], tour[-1]] + tour[1:-1]
        journees += [[(b, a) for a, b in j] for j in journees]
        debut = timezone.make_aware(datetime(2026, 8, 9, 15, 0))
        for numero, rencontres in enumerate(journees, start=1):
            for rang, (domicile, exterieur) in enumerate(rencontres):
                derniere = numero == 10
                match = Match.objects.create(
                    competition=self.ligue, journee=numero, date_match=debut + timedelta(days=7 * (numero - 1), hours=rang * 2),
                    stade=f'{domicile.stade}, {domicile.ville}', club_domicile=domicile, club_exterieur=exterieur,
                    score_domicile=alea.choice([0, 1, 1, 2, 2, 3]), score_exterieur=alea.choice([0, 0, 1, 1, 2]),
                    duree=90 + alea.randint(3, 7), code_par=self.analyste)
                compositions = self.compositions(match)
                if derniere and rang == 2:  # reste « Planifié », sans vidéo
                    continue
                match.video_url = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
                match.etat = EtatMatch.VIDEO_IMPORTEE
                if not derniere or rang == 1:
                    evenements = self.evenements(match, compositions)
                    if derniere:  # codage commencé : la première mi-temps seulement
                        evenements = [e for e in evenements if e.minute < 45]
                        match.etat = EtatMatch.EN_CODAGE
                    else:
                        match.etat = EtatMatch.STATS_PUBLIEES
                    Evenement.objects.bulk_create(evenements)
                match.save()

    def compositions(self, match):
        alea = self.alea
        lignes = []
        for club in (match.club_domicile, match.club_exterieur):
            effectif = list(club.joueurs.all())
            alea.shuffle(effectif)
            # les meilleurs jouent plus souvent : tri par niveau avec un peu de hasard
            effectif.sort(key=lambda j: self.niveau[j.id] + alea.uniform(0, 0.35), reverse=True)
            titulaires, reste = [], effectif[:]
            for poste in ONZE:
                choix = next((j for j in reste if j.poste == poste), None) or next(
                    j for j in reste if GROUPE_POSTE[j.poste] == GROUPE_POSTE[poste])
                titulaires.append(choix)
                reste.remove(choix)
            entrants = [j for j in reste if j.poste != 'G'][:3]
            sortants = alea.sample([j for j in titulaires if j.poste != 'G'], 3)
            minutes = {s.id: alea.randint(55, 82) for s in sortants}
            for numero, j in enumerate(titulaires, start=1):
                lignes.append(Composition.objects.create(match=match, joueur=j, club=club, est_titulaire=True,
                                                         numero_maillot=numero, minute_sortie=minutes.get(j.id)))
            for numero, (j, sortant) in enumerate(zip(entrants, sortants), start=12):
                lignes.append(Composition.objects.create(match=match, joueur=j, club=club, est_titulaire=False,
                                                         numero_maillot=numero, minute_entree=minutes[sortant.id]))
            for numero, j in enumerate([r for r in reste if r not in entrants][:2], start=15):
                lignes.append(Composition.objects.create(match=match, joueur=j, club=club, est_titulaire=False,
                                                         numero_maillot=numero))
        return lignes

    def evenements(self, match, compositions):
        alea, evts = self.alea, []

        def ajouter(c, type_action, minute, x, y, resultat):
            xg = calculer_xg(x, y) if type_action in ('TIR', 'BUT') else None
            fin_x = fin_y = None
            partie = ''
            if type_action in ('TIR', 'BUT'):
                partie = self.alea_passes.choices(['PIED_D', 'PIED_G', 'TETE'], weights=[58, 25, 17])[0]
            if type_action in ('PASSE', 'CENTRE'):  # une passe part plutôt vers l'avant, un centre vise la surface
                hasard, borne = self.alea_passes, lambda v: round(max(1, min(99, v)), 1)
                fin_x, fin_y = ((borne(hasard.uniform(84, 97)), borne(hasard.uniform(32, 68))) if type_action == 'CENTRE'
                                else (borne(x + hasard.uniform(-12, 28)), borne(y + hasard.uniform(-26, 26))))
            evts.append(Evenement(match=match, joueur=c.joueur, type_action=type_action, minute=minute,
                                  temps_video=minute * 60 + alea.randint(0, 59), zone_x=round(x, 1), zone_y=round(y, 1),
                                  resultat=resultat, valeur_xg=xg, fin_x=fin_x, fin_y=fin_y, partie_corps=partie))
            return evts[-1]

        for c in compositions:
            if not c.minutes_jouees:
                continue
            groupe, niveau = GROUPE_POSTE[c.joueur.poste], self.niveau[c.joueur_id]
            debut = 0 if c.est_titulaire else c.minute_entree
            for type_action, par90 in RYTHME[groupe].items():
                if type_action in ('TIR', 'DRIBBLE'):
                    par90 *= 0.5 + niveau
                for minute in range(debut, debut + c.minutes_jouees):
                    if alea.random() >= par90 / 90:
                        continue
                    x, y = alea.uniform(*ZONE_X[groupe]), alea.uniform(5, 95)
                    reussite = {'PASSE': 0.58 + 0.32 * niveau, 'DUEL': 0.32 + 0.35 * niveau,
                                'DRIBBLE': 0.3 + 0.4 * niveau, 'TIR': 0.25 + 0.25 * niveau,
                                'CENTRE': 0.2 + 0.25 * niveau, 'FAUTE': 0}.get(type_action, 0.85)
                    if type_action == 'TIR':
                        x, y = alea.uniform(74, 95), alea.uniform(22, 78)
                    ajouter(c, type_action, minute, x, y, alea.random() < reussite)

        # les buts correspondent au score saisi (contrôle de cohérence de CU08)
        for club, score in ((match.club_domicile, match.score_domicile), (match.club_exterieur, match.score_exterieur)):
            equipe = [c for c in compositions if c.club_id == club.id and c.minutes_jouees]
            poids = [BUTEURS[GROUPE_POSTE[c.joueur.poste]] * (0.3 + self.niveau[c.joueur_id]) ** 2 for c in equipe]
            for _ in range(score):
                buteur = alea.choices(equipe, weights=poids)[0]
                debut = 0 if buteur.est_titulaire else buteur.minute_entree
                minute = alea.randint(debut, debut + buteur.minutes_jouees - 1)
                but = ajouter(buteur, 'BUT', minute, alea.uniform(85, 96), alea.uniform(36, 64), True)
                but.temps_video = minute * 60 + 30
                presents = [c for c in equipe if c is not buteur and (0 if c.est_titulaire else c.minute_entree)
                            <= minute < (0 if c.est_titulaire else c.minute_entree) + c.minutes_jouees]
                if presents and alea.random() < 0.7:  # passe décisive
                    passe = ajouter(alea.choice(presents), 'PASSE', minute, alea.uniform(65, 85), alea.uniform(20, 80), True)
                    passe.temps_video = but.temps_video - 4
        evts.sort(key=lambda e: e.temps_video)
        return evts

    def scouting(self):
        valide = Match.objects.filter(etat=EtatMatch.STATS_PUBLIEES, compositions__joueur=self.wilson).first()
        RapportScouting.objects.create(
            joueur=self.wilson, scout=self.scout, match_observe=valide, date_rapport=date(2026, 10, 6), note=8,
            recommandation='RECRUTER', forces='Très rapide dans la profondeur, finition du pied droit.',
            faiblesses='À travailler : jeu dos au but et pressing.', etat=EtatRapport.VALIDE,
            valide_par=self.directeur, date_validation=timezone.now() - timedelta(days=2),
            commentaire_validation='Profil prioritaire pour les clubs de D1.')
        RapportScouting.objects.create(
            joueur=self.carlens, scout=self.scout, date_rapport=date(2026, 10, 7), note=7, recommandation='SUIVRE',
            forces='Bon jeu de tête, solide dans les duels, remise en une touche.',
            faiblesses='Manque de vitesse sur les premiers mètres.', etat=EtatRapport.SOUMIS)
        autres = list(Joueur.objects.filter(poste__in=['MC', 'MO'], club_actuel__division='D1')[:2])
        RapportScouting.objects.create(
            joueur=autres[0], scout=self.scout, date_rapport=date(2026, 10, 1), note=6, recommandation='SUIVRE',
            forces='Volume de jeu.', faiblesses='À revoir.', etat=EtatRapport.RENVOYE, valide_par=self.directeur,
            commentaire_validation='Rapport trop court : détailler les faiblesses et citer le match observé.')
        RapportScouting.objects.create(
            joueur=autres[1], scout=self.scout, note=5, recommandation='NE_PAS_RETENIR',
            forces='Bonne vision du jeu.', faiblesses='Perd trop de ballons sous pression.')
        liste = Shortlist.objects.create(nom='Attaquants à suivre', description='Cibles D1 pour la saison 2027',
                                         proprietaire=self.scout)
        liste.joueurs.set([self.wilson, self.carlens])

    def commercial(self):
        pro = Formule.objects.create(nom='Pro', prix_mensuel_htg=Decimal('15000'), nombre_comptes=5,
                                     divisions_incluses=['D1', 'D2'], rapports_inclus=True)
        essentiel = Formule.objects.create(nom='Essentiel', prix_mensuel_htg=Decimal('5000'), nombre_comptes=2,
                                           divisions_incluses=['D1'], rapports_inclus=False)
        academie = Formule.objects.create(nom='Académie', prix_mensuel_htg=Decimal('8000'), nombre_comptes=3,
                                          divisions_incluses=['D2', 'ACADEMIE'], rapports_inclus=True)
        aujourdhui = date.today()

        def abonner(club, formule, debut, duree=12):
            abo = Abonnement.objects.create(club=club, formule=formule, date_debut=debut, duree_mois=duree,
                                            date_echeance=ajouter_mois(debut, duree),
                                            montant_htg=formule.prix_mensuel_htg * duree)
            return abo, generer_facture(abo, debut)

        # actif : facture soldée
        abo, facture = abonner(self.clubs[0], pro, aujourdhui - timedelta(days=60))
        Paiement.objects.create(facture=facture, montant_htg=facture.montant_ttc, mode='VIREMENT',
                                reference='VIR-2026-0412', encaisse_par=self.agent)
        apres_paiement(facture)
        # en attente : paiement partiel
        abo, facture = abonner(self.clubs[1], essentiel, aujourdhui - timedelta(days=5), duree=6)
        Paiement.objects.create(facture=facture, montant_htg=Decimal('10000'), mode='MONCASH',
                                reference='MC-88213', encaisse_par=self.agent)
        apres_paiement(facture)
        # suspendu : impayé plus de 15 jours après l'échéance (RG10)
        abo, facture = abonner(self.clubs[8], academie, aujourdhui - timedelta(days=40))
        abo.etat = EtatAbonnement.SUSPENDU
        abo.save(update_fields=['etat'])

        for identifiant, prenom, nom, club in (('client_ej', 'Yves', 'Casimir', self.clubs[0]),
                                               ('client_usc', 'Lucien', 'Morisseau', self.clubs[1])):
            Utilisateur.objects.create_user(identifiant, MOT_DE_PASSE, prenom=prenom, nom=nom, role=Role.CLIENT,
                                            club=club, courriel=f'{identifiant}@exemple.ht')
        liste = Shortlist.objects.create(nom='Recrues janvier', proprietaire=Utilisateur.objects.get(nom_utilisateur='client_ej'))
        liste.joueurs.set([self.carlens])
        # membres du club abonné (SRS HAITI SCOUT AI §4) : administrateur du club, entraîneur, un joueur
        ej = self.clubs[0]
        for identifiant, prenom, nom, role in (('admin_ej', 'Rose-Marie', 'Delva', Role.CLUB_ADMIN),
                                               ('coach_ej', 'Wilner', 'Étienne', Role.COACH)):
            Utilisateur.objects.create_user(identifiant, MOT_DE_PASSE, prenom=prenom, nom=nom, role=role, club=ej,
                                            courriel=f'{identifiant}@exemple.ht')
        fiche = ej.joueurs.order_by('id').first()
        if fiche:
            Utilisateur.objects.create_user('joueur_ej', MOT_DE_PASSE, prenom=fiche.prenom, nom=fiche.nom,
                                            role=Role.JOUEUR, club=ej, joueur=fiche, courriel='joueur_ej@exemple.ht')
