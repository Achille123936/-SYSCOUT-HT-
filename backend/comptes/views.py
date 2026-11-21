"""Comptes : personnes, utilisateurs, rôles et authentification (CU01, CU02) — vues de l'API."""
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from comptes.models import ROLES_CLUB, Role, Utilisateur
from comptes.serializers import (MEMBRES_GERES_PAR_LE_CLUB, ChangerMotDePasseSerializer, InscriptionSerializer,
                                 UtilisateurSerializer, mot_de_passe_provisoire)
from core.api import AuditMixin
from core.auth import AbonnementActif, roles
from core.services import acces_client, journaliser, mettre_a_jour_abonnements, notifier

P = settings.SYSCOUT


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def connexion(request):
    nom = str(request.data.get('nom_utilisateur', '')).strip()
    mot_de_passe = str(request.data.get('mot_de_passe', ''))
    utilisateur = Utilisateur.objects.filter(nom_utilisateur__iexact=nom).first()
    bloque = "Compte bloqué après 5 essais échoués. Contactez l'administrateur."

    if utilisateur and utilisateur.bloque:
        journaliser(request, 'ECHEC_CONNEXION', utilisateur, utilisateur=utilisateur, apres={'motif': 'compte bloqué'})
        return Response({'detail': bloque}, status=status.HTTP_403_FORBIDDEN)

    if not utilisateur or not utilisateur.check_password(mot_de_passe):
        reponse = {'detail': "Nom d'utilisateur ou mot de passe incorrect."}
        if utilisateur:
            utilisateur.essais_echoues += 1
            utilisateur.bloque = utilisateur.essais_echoues >= P['ESSAIS_MAX']
            utilisateur.save(update_fields=['essais_echoues', 'bloque'])
            reponse['essais_restants'] = max(0, P['ESSAIS_MAX'] - utilisateur.essais_echoues)
            if utilisateur.bloque:
                reponse['detail'] = bloque
        journaliser(request, 'ECHEC_CONNEXION', utilisateur, utilisateur=utilisateur, table='utilisateur',
                    apres={'nom_utilisateur': nom})
        return Response(reponse, status=status.HTTP_401_UNAUTHORIZED)

    if not utilisateur.is_active:
        attente = utilisateur.last_login is None and utilisateur.demande_inscription
        return Response({'detail': "Votre demande d'inscription attend la validation de l'administrateur." if attente
                         else 'Ce compte est désactivé.'}, status=status.HTTP_403_FORBIDDEN)

    maintenant = timezone.now()
    utilisateur.essais_echoues = 0
    utilisateur.last_login = utilisateur.derniere_activite = maintenant
    utilisateur.save(update_fields=['essais_echoues', 'last_login', 'derniere_activite'])
    Token.objects.filter(user=utilisateur).delete()
    jeton = Token.objects.create(user=utilisateur)
    if utilisateur.role in (Role.AGENT, Role.ADMIN, *ROLES_CLUB):
        mettre_a_jour_abonnements()
    journaliser(request, 'CONNEXION', utilisateur, utilisateur=utilisateur)
    return Response({'jeton': jeton.key, 'utilisateur': UtilisateurSerializer(utilisateur).data,
                     'inactivite_minutes': P['INACTIVITE_MINUTES']})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def inscription(request):
    """Demande d'inscription : le compte est créé inactif. L'administrateur l'active et lui attribue son rôle
    (SEL 2.1 : c'est l'administrateur qui crée les comptes et définit les droits)."""
    s = InscriptionSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    donnees = dict(s.validated_data)
    mot_de_passe = donnees.pop('mot_de_passe')
    utilisateur = Utilisateur.objects.create_user(password=mot_de_passe, is_active=False, demande_inscription=True,
                                                  role=Role.SCOUT, **donnees)
    journaliser(request, 'CREATION', utilisateur, utilisateur=utilisateur, apres={'demande_inscription': True})
    notifier(Utilisateur.objects.filter(role=Role.ADMIN, is_active=True), "Nouvelle demande d'inscription",
             f'{utilisateur.nom_complet} ({utilisateur.nom_utilisateur}) demande un compte. '
             'Ouvrez Administration › Utilisateurs pour lui attribuer un rôle et activer son compte.')
    return Response({'detail': "Votre demande est enregistrée. Vous pourrez vous connecter dès que l'administrateur "
                               'aura activé votre compte.'}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
def deconnexion(request):
    journaliser(request, 'DECONNEXION', request.user)
    Token.objects.filter(user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
def renouveler_jeton(request):
    """SRS §18 : renouvellement du jeton. Le jeton présenté est remplacé par un nouveau (l'ancien cesse de valoir) ;
    il faut donc que la session soit encore ouverte, c'est-à-dire active depuis moins de 20 minutes."""
    Token.objects.filter(user=request.user).delete()
    jeton = Token.objects.create(user=request.user)
    journaliser(request, 'CONNEXION', request.user, apres={'renouvellement': True})
    return Response({'jeton': jeton.key, 'inactivite_minutes': P['INACTIVITE_MINUTES']})


@api_view(['GET'])
def moi(request):
    donnees = UtilisateurSerializer(request.user).data
    if request.user.role in ROLES_CLUB:
        abonnement = acces_client(request.user)
        donnees['abonnement'] = abonnement and {
            'formule': abonnement.formule.nom, 'date_echeance': abonnement.date_echeance,
            'divisions': abonnement.formule.divisions_incluses, 'rapports': abonnement.formule.rapports_inclus}
    return Response(donnees)


@api_view(['POST'])
def changer_mot_de_passe(request):
    s = ChangerMotDePasseSerializer(data=request.data, context={'request': request})
    s.is_valid(raise_exception=True)
    if not request.user.check_password(s.validated_data['ancien']):
        raise ValidationError({'ancien': 'Mot de passe actuel incorrect.'})
    request.user.set_password(s.validated_data['nouveau'])
    request.user.doit_changer_mot_de_passe = False
    request.user.save()
    journaliser(request, 'MODIFICATION', request.user, apres={'mot_de_passe': 'modifié'})
    return Response({'detail': 'Mot de passe modifié.'})


class UtilisateurViewSet(AuditMixin, viewsets.ModelViewSet):
    """L'administrateur gère tous les comptes ; l'administrateur d'un club gère les comptes « Entraîneur » et
    « Joueur » de son club (SRS HAITI SCOUT AI §4), dans la limite de l'abonnement."""
    serializer_class = UtilisateurSerializer
    permission_classes = [roles(Role.ADMIN, Role.CLUB_ADMIN, lecture=(Role.ADMIN, Role.CLUB_ADMIN)), AbonnementActif]

    def get_queryset(self):
        qs = Utilisateur.objects.select_related('club', 'joueur')
        if self.request.user.role == Role.CLUB_ADMIN:
            qs = qs.filter(club_id=self.request.user.club_id, role__in=MEMBRES_GERES_PAR_LE_CLUB)
        q, role = self.request.query_params.get('q'), self.request.query_params.get('role')
        if q:
            qs = qs.filter(Q(nom__icontains=q) | Q(prenom__icontains=q) | Q(nom_utilisateur__icontains=q))
        return qs.filter(role=role) if role else qs

    def _envoyer_acces(self, utilisateur, provisoire):
        notifier([utilisateur], 'Activation de votre compte',
                 f'Bonjour {utilisateur.prenom},\n\nVotre compte SYSCOUT-HT est prêt.\n'
                 f"Nom d'utilisateur : {utilisateur.nom_utilisateur}\nMot de passe provisoire : {provisoire}\n\n"
                 'Vous devrez le changer à la première connexion.')

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        self.perform_create(s)
        self._envoyer_acces(s.instance, s.instance.mot_de_passe_provisoire)
        # le mot de passe provisoire est aussi remis à l'administrateur, au cas où le courriel n'arrive pas
        return Response({**s.data, 'mot_de_passe_provisoire': s.instance.mot_de_passe_provisoire},
                        status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        """Un compte n'est jamais supprimé : il est désactivé (son historique d'audit est conservé)."""
        if instance == self.request.user:
            raise ValidationError('Vous ne pouvez pas désactiver votre propre compte.')
        instance.is_active = False
        instance.save(update_fields=['is_active'])
        Token.objects.filter(user=instance).delete()
        journaliser(self.request, 'MODIFICATION', instance, avant={'is_active': True}, apres={'is_active': False})

    @action(detail=True, methods=['post'])
    def debloquer(self, request, pk=None):
        utilisateur = self.get_object()
        utilisateur.bloque, utilisateur.essais_echoues = False, 0
        utilisateur.save(update_fields=['bloque', 'essais_echoues'])
        journaliser(request, 'MODIFICATION', utilisateur, avant={'bloque': True}, apres={'bloque': False})
        return Response(self.get_serializer(utilisateur).data)

    @action(detail=True, methods=['post'])
    def reinitialiser(self, request, pk=None):
        utilisateur = self.get_object()
        provisoire = mot_de_passe_provisoire()
        utilisateur.set_password(provisoire)
        utilisateur.doit_changer_mot_de_passe = True
        utilisateur.bloque, utilisateur.essais_echoues = False, 0
        utilisateur.save()
        Token.objects.filter(user=utilisateur).delete()
        self._envoyer_acces(utilisateur, provisoire)
        journaliser(request, 'MODIFICATION', utilisateur, apres={'mot_de_passe': 'réinitialisé'})
        return Response({'mot_de_passe_provisoire': provisoire})
