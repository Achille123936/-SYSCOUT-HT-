"""Audit : journal des opérations et sauvegarde (CU16) — vues de l'API."""
from pathlib import Path

from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from audit.models import OperationAudit
from audit.serializers import AuditSerializer
from comptes.models import Role
from core.auth import roles
from core.services import journaliser, sauvegarder

P = settings.SYSCOUT


class AuditViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditSerializer
    permission_classes = [roles(lecture=(Role.ADMIN,))]

    def get_queryset(self):
        qs = OperationAudit.objects.select_related('utilisateur')
        p = self.request.query_params
        for champ, filtre in (('utilisateur', 'utilisateur_id'), ('action', 'action'), ('table', 'table_concernee'),
                              ('debut', 'date_heure__date__gte'), ('fin', 'date_heure__date__lte')):
            if p.get(champ):
                qs = qs.filter(**{filtre: p[champ]})
        return qs


@api_view(['GET', 'POST'])
@permission_classes([roles(Role.ADMIN, lecture=(Role.ADMIN,))])
def sauvegarde(request):
    if request.method == 'POST':
        resultats = sauvegarder()
        journaliser(request, 'SAUVEGARDE', table='base', apres={'copies': resultats})
        return Response({'detail': 'Sauvegarde réussie.', 'copies': resultats}, status=status.HTTP_201_CREATED)
    existantes = []
    for dossier in P['SAUVEGARDES']:
        fichiers = sorted(Path(dossier).glob('base_*.json'), reverse=True) if Path(dossier).exists() else []
        existantes.append({'destination': Path(dossier).name, 'nombre': len(fichiers),
                           'derniere': fichiers[0].name if fichiers else None})
    return Response(existantes)
