"""Socle commun de SYSCOUT-HT — outils communs de l'API."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models.deletion import ProtectedError
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.views import exception_handler

from core.services import instantane, journaliser


def identique(a, b):
    """Comparaison sans tenir compte de la casse ni des espaces, accents compris (« Étoile » = « étoile »)."""
    return (a or '').strip().casefold() == (b or '').strip().casefold()


def gestion_erreurs(exc, context):
    """Messages d'erreur en français, y compris pour les erreurs levées par la base."""
    if isinstance(exc, ProtectedError):
        exc = ValidationError('Suppression impossible : cet enregistrement est utilisé par d\'autres données.')
    elif isinstance(exc, DjangoValidationError):
        exc = ValidationError(exc.messages)
    return exception_handler(exc, context)


class AuditMixin:
    """Fonctions d'audit (SEL 2.4) : chaque création, modification et suppression est journalisée."""

    def perform_create(self, serializer):
        obj = serializer.save()
        journaliser(self.request, 'CREATION', obj, apres=instantane(obj))

    def perform_update(self, serializer):
        avant = instantane(serializer.instance)
        obj = serializer.save()
        journaliser(self.request, 'MODIFICATION', obj, avant=avant, apres=instantane(obj))

    def perform_destroy(self, instance):
        avant, cle = instantane(instance), instance.pk
        table = instance._meta.model_name
        instance.delete()
        journaliser(self.request, 'SUPPRESSION', avant=avant, table=table, identifiant=cle)


def exiger_role(request, *autorises):
    if request.user.role not in autorises:
        raise PermissionDenied("Votre rôle ne permet pas cette opération.")
