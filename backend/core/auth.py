"""Authentification par jeton et droits d'accès par rôle (SEL 3.4.3 et 3.6.7)."""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import SAFE_METHODS, BasePermission

from comptes.models import ROLES_CLUB
from .models import Role, Utilisateur
from .services import acces_client

# lecture des données sportives (analyses, statistiques, tactique, rapports)
SPORTIFS = (Role.ADMIN, Role.ANALYSTE, Role.SCOUT, Role.DIRECTEUR, Role.CLIENT, Role.CLUB_ADMIN, Role.COACH)
# fiches des joueurs : un compte « Joueur » y lit la sienne, et rien d'autre (voir core.visibilite)
LECTEURS_JOUEURS = SPORTIFS + (Role.JOUEUR,)
COMMERCIAUX = (Role.ADMIN, Role.AGENT)


def acces_sportif(utilisateur):
    """Rôle sportif, et, pour un compte de club, abonnement actif (RG9)."""
    return utilisateur.role in SPORTIFS and (utilisateur.role not in ROLES_CLUB or acces_client(utilisateur) is not None)


class JetonAvecExpiration(TokenAuthentication):
    """Jeton qui expire après 20 minutes d'inactivité."""

    def authenticate_credentials(self, key):
        utilisateur, jeton = super().authenticate_credentials(key)
        maintenant = timezone.now()
        dernier = utilisateur.derniere_activite
        if utilisateur.bloque:
            raise AuthenticationFailed('Compte bloqué. Contactez l\'administrateur.')
        if dernier and maintenant - dernier > timedelta(minutes=settings.SYSCOUT['INACTIVITE_MINUTES']):
            raise AuthenticationFailed("Session fermée après 20 minutes d'inactivité. Reconnectez-vous.")
        if not dernier or maintenant - dernier > timedelta(seconds=30):
            Utilisateur.objects.filter(pk=utilisateur.pk).update(derniere_activite=maintenant)
        return utilisateur, jeton


def roles(*ecriture, lecture=None):
    """Permission : `ecriture` peut créer et modifier ; `lecture` peut consulter (tous les connectés si None)."""

    class PermissionRole(BasePermission):
        def has_permission(self, request, view):
            u = request.user
            if not u or not u.is_authenticated:
                return False
            if request.method in SAFE_METHODS:
                return lecture is None or u.role in lecture
            return u.role in ecriture

    return PermissionRole


class AbonnementActif(BasePermission):
    """RG9 : les comptes d'un club n'accèdent aux données que si l'abonnement du club est actif (payé)."""
    message = "L'abonnement de votre club n'est pas actif. Contactez Ayiti Data Foot."

    def has_permission(self, request, view):
        u = request.user
        return u.role not in ROLES_CLUB or acces_client(u) is not None
