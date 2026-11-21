"""Comptes : personnes, utilisateurs, rôles et authentification (CU01, CU02) — sérialiseurs et contrôles de saisie."""
import secrets
import string

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from comptes.models import PERSONNEL_CLUB, ROLES_CLUB, Role, Utilisateur

# comptes qu'un administrateur de club crée et gère lui-même
MEMBRES_GERES_PAR_LE_CLUB = (Role.COACH, Role.JOUEUR)


def mot_de_passe_provisoire():
    alphabet = string.ascii_letters + string.digits
    return 'Sy' + ''.join(secrets.choice(alphabet) for _ in range(8)) + str(secrets.randbelow(10))


class UtilisateurSerializer(serializers.ModelSerializer):
    nom_complet = serializers.CharField(read_only=True)
    role_libelle = serializers.CharField(source='get_role_display', read_only=True)
    club_nom = serializers.CharField(source='club.nom', read_only=True, default=None)
    joueur_nom = serializers.CharField(source='joueur.nom_complet', read_only=True, default=None)

    class Meta:
        model = Utilisateur
        fields = ['id', 'nom_utilisateur', 'nom', 'prenom', 'nom_complet', 'sexe', 'courriel', 'telephone', 'role',
                  'role_libelle', 'is_active', 'bloque', 'club', 'club_nom', 'joueur', 'joueur_nom', 'date_creation',
                  'last_login', 'doit_changer_mot_de_passe', 'demande_inscription']
        read_only_fields = ['bloque', 'date_creation', 'last_login', 'doit_changer_mot_de_passe',
                            'demande_inscription']
        # une fiche déjà reliée à un compte : message précis dans validate()
        extra_kwargs = {'joueur': {'validators': []}}

    def validate_courriel(self, valeur):
        if valeur:
            autres = Utilisateur.objects.filter(courriel__iexact=valeur)
            if self.instance:
                autres = autres.exclude(pk=self.instance.pk)
            if autres.exists():
                raise serializers.ValidationError('Ce courriel est déjà utilisé par un autre compte.')
        return valeur

    def validate(self, data):
        role = data.get('role', getattr(self.instance, 'role', None))
        club = data.get('club', getattr(self.instance, 'club', None))
        joueur = data.get('joueur', getattr(self.instance, 'joueur', None))
        request = self.context.get('request')
        gestionnaire = getattr(request, 'user', None)
        if gestionnaire is not None and gestionnaire.role == Role.CLUB_ADMIN:
            # l'administrateur d'un club ne crée que des entraîneurs et des joueurs, et seulement pour son club
            if role not in MEMBRES_GERES_PAR_LE_CLUB:
                raise serializers.ValidationError({'role': 'Vous pouvez créer des comptes « Entraîneur » ou « Joueur ».'})
            data['club'] = club = gestionnaire.club
        if role == Role.JOUEUR:
            if not joueur:
                raise serializers.ValidationError({'joueur': 'Choisissez la fiche du joueur qui utilisera ce compte.'})
            if club and joueur.club_actuel_id != club.id:
                raise serializers.ValidationError({'joueur': f'{joueur.nom_complet} ne joue pas dans ce club.'})
            deja = Utilisateur.objects.filter(joueur=joueur).exclude(pk=getattr(self.instance, 'pk', None)).first()
            if deja:
                raise serializers.ValidationError({'joueur': f'{joueur.nom_complet} a déjà un compte ({deja.nom_utilisateur}).'})
            data['club'] = club = joueur.club_actuel
        elif joueur is not None:
            data['joueur'] = None  # seul un compte « Joueur » est relié à une fiche
        if role in ROLES_CLUB and not club:
            raise serializers.ValidationError({'club': 'Un compte de club doit être rattaché à un club.'})
        if role not in ROLES_CLUB and club is not None and role is not None:
            data['club'] = None
        actif = data.get('is_active', getattr(self.instance, 'is_active', True))
        # le nombre de comptes de la formule compte le personnel du club ; les comptes « Joueur » n'y entrent pas
        if role in PERSONNEL_CLUB and actif:
            from commercial.models import Abonnement, EtatAbonnement
            abonnement = (Abonnement.objects.filter(club=club, etat=EtatAbonnement.ACTIF).select_related('formule')
                          .order_by('-formule__nombre_comptes').first())
            comptes = Utilisateur.objects.filter(role__in=PERSONNEL_CLUB, club=club, is_active=True)
            if self.instance:
                comptes = comptes.exclude(pk=self.instance.pk)
            if abonnement and comptes.count() >= abonnement.formule.nombre_comptes:
                raise serializers.ValidationError({'club': (
                    f'La formule {abonnement.formule.nom} de ce club prévoit {abonnement.formule.nombre_comptes} '
                    'compte(s) : désactivez un compte existant ou changez de formule.')})
        return data

    def create(self, data):
        provisoire = mot_de_passe_provisoire()
        utilisateur = Utilisateur.objects.create_user(password=provisoire, doit_changer_mot_de_passe=True,
                                                      is_staff=data.get('role') == Role.ADMIN, **data)
        utilisateur.mot_de_passe_provisoire = provisoire
        return utilisateur


class ChangerMotDePasseSerializer(serializers.Serializer):
    ancien = serializers.CharField()
    nouveau = serializers.CharField()

    def validate_nouveau(self, valeur):
        try:
            validate_password(valeur, self.context['request'].user)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return valeur


class InscriptionSerializer(serializers.ModelSerializer):
    mot_de_passe = serializers.CharField(write_only=True)

    class Meta:
        model = Utilisateur
        fields = ['nom', 'prenom', 'courriel', 'telephone', 'nom_utilisateur', 'mot_de_passe']
        extra_kwargs = {'courriel': {'required': True, 'allow_blank': False}}

    def validate_courriel(self, valeur):
        if Utilisateur.objects.filter(courriel__iexact=valeur).exists():
            raise serializers.ValidationError('Ce courriel est déjà utilisé par un autre compte.')
        return valeur

    def validate_mot_de_passe(self, valeur):
        try:
            validate_password(valeur)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return valeur
