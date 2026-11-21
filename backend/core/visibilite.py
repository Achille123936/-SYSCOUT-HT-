"""Socle commun de SYSCOUT-HT — ce que chaque rôle a le droit de voir."""
from django.db.models import Q
from rest_framework.exceptions import NotFound

from comptes.models import PERSONNEL_CLUB, ROLES_CLUB, Role
from core.services import acces_client
from joueurs.models import Joueur
from referentiel.models import Saison
from scouting.models import EtatRapport, RapportScouting
from statistiques.models import StatistiqueJoueur


def joueurs_visibles(utilisateur):
    """RG9 : un compte de club voit son propre club et les divisions incluses dans sa formule ;
    un compte « Joueur » ne voit que sa propre fiche."""
    qs = Joueur.objects.select_related('club_actuel')
    if utilisateur.role == Role.JOUEUR:
        return qs.filter(pk=utilisateur.joueur_id) if utilisateur.joueur_id else qs.none()
    if utilisateur.role in ROLES_CLUB:
        abonnement = acces_client(utilisateur)
        if not abonnement:
            return qs.none()
        qs = qs.filter(Q(club_actuel__division__in=abonnement.formule.divisions_incluses)
                       | Q(club_actuel_id=utilisateur.club_id))
    return qs


def statistique_de(joueur, saison):
    return StatistiqueJoueur.objects.filter(joueur=joueur, saison=saison).select_related('saison').first()


def saison_demandee(request):
    identifiant = request.query_params.get('saison') or request.data.get('saison')
    saison = Saison.objects.filter(pk=identifiant).first() if identifiant else Saison.courante()
    if not saison:
        raise NotFound('Aucune saison enregistrée.')
    return saison


def rapports_visibles(utilisateur):
    """RG8 : un rapport n'est visible des clubs clients qu'après validation par le directeur sportif."""
    qs = RapportScouting.objects.select_related('joueur__club_actuel', 'scout', 'valide_par', 'match_observe')
    role = utilisateur.role
    if role == Role.JOUEUR:  # un rapport de scouting n'est pas destiné au joueur observé
        return qs.none()
    if role in PERSONNEL_CLUB:
        abonnement = acces_client(utilisateur)
        if not abonnement or not abonnement.formule.rapports_inclus:
            return qs.none()
        return qs.filter(etat=EtatRapport.VALIDE, joueur__in=joueurs_visibles(utilisateur))
    if role == Role.SCOUT:
        return qs.filter(Q(scout=utilisateur) | Q(etat=EtatRapport.VALIDE))
    if role in (Role.DIRECTEUR, Role.ADMIN):
        return qs.exclude(Q(etat=EtatRapport.BROUILLON) & ~Q(scout=utilisateur))
    return qs.filter(etat=EtatRapport.VALIDE)
