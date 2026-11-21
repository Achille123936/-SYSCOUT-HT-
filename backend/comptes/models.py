"""Comptes : personnes, utilisateurs, rôles et authentification (CU01, CU02) — modèle du domaine."""
from datetime import date

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class Personne(models.Model):
    """Classe abstraite : informations communes à toute personne gérée par le système."""
    SEXES = [('M', 'Masculin'), ('F', 'Féminin')]

    nom = models.CharField(max_length=80)
    prenom = models.CharField(max_length=80)
    sexe = models.CharField(max_length=1, choices=SEXES, default='M')
    date_naissance = models.DateField(null=True, blank=True)
    nationalite = models.CharField(max_length=60, default='Haïtienne', blank=True)
    telephone = models.CharField(max_length=30, blank=True)
    courriel = models.EmailField(blank=True)
    adresse = models.CharField(max_length=200, blank=True)

    class Meta:
        abstract = True

    def calculer_age(self, au=None):
        if not self.date_naissance:
            return None
        au = au or date.today()
        n = self.date_naissance
        return au.year - n.year - ((au.month, au.day) < (n.month, n.day))

    @property
    def nom_complet(self):
        return f'{self.prenom} {self.nom}'.strip()


class Role(models.TextChoices):
    ADMIN = 'ADMIN', 'Administrateur'
    ANALYSTE = 'ANALYSTE', 'Analyste vidéo'
    SCOUT = 'SCOUT', 'Scout'
    DIRECTEUR = 'DIRECTEUR', 'Directeur sportif'
    AGENT = 'AGENT', 'Agent commercial'
    CLIENT = 'CLIENT', 'Club client'
    # SRS HAITI SCOUT AI §4 : comptes des membres d'un club
    CLUB_ADMIN = 'CLUB_ADMIN', 'Administrateur de club'
    COACH = 'COACH', 'Entraîneur'
    JOUEUR = 'JOUEUR', 'Joueur'


# comptes d'un club : rattachés à ce club, accès soumis à son abonnement actif (RG9)
ROLES_CLUB = (Role.CLIENT, Role.CLUB_ADMIN, Role.COACH, Role.JOUEUR)
# personnel du club : ces comptes comptent dans le nombre de comptes de la formule ; un joueur ne voit que sa fiche
PERSONNEL_CLUB = (Role.CLIENT, Role.CLUB_ADMIN, Role.COACH)


class UtilisateurManager(BaseUserManager):
    def create_user(self, nom_utilisateur, password=None, **extra):
        user = self.model(nom_utilisateur=nom_utilisateur, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, nom_utilisateur, password=None, **extra):
        extra.setdefault('role', Role.ADMIN)
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        return self.create_user(nom_utilisateur, password, **extra)


class Utilisateur(Personne, AbstractBaseUser, PermissionsMixin):
    """Personne qui possède un compte pour se connecter à SYSCOUT-HT."""
    nom_utilisateur = models.CharField(max_length=40, unique=True)
    role = models.CharField(max_length=12, choices=Role.choices, default=Role.SCOUT)
    is_active = models.BooleanField('actif', default=True)  # statut (actif, inactif)
    is_staff = models.BooleanField(default=False)
    bloque = models.BooleanField(default=False)
    essais_echoues = models.PositiveSmallIntegerField(default=0)
    doit_changer_mot_de_passe = models.BooleanField(default=False)
    demande_inscription = models.BooleanField(default=False)  # compte demandé depuis l'écran d'accueil
    derniere_activite = models.DateTimeField(null=True, blank=True)
    date_creation = models.DateTimeField(default=timezone.now)
    # un ClientClub représente 0..1 Club
    club = models.ForeignKey('referentiel.Club', null=True, blank=True, on_delete=models.SET_NULL, related_name='comptes')
    # compte « Joueur » : la fiche du joueur qu'il est (il ne voit qu'elle)
    joueur = models.OneToOneField('joueurs.Joueur', null=True, blank=True, on_delete=models.SET_NULL,
                                  related_name='compte')

    objects = UtilisateurManager()
    USERNAME_FIELD = 'nom_utilisateur'
    EMAIL_FIELD = 'courriel'
    REQUIRED_FIELDS = ['nom', 'prenom']

    class Meta:
        ordering = ['nom', 'prenom']

    def __str__(self):
        return f'{self.nom_complet} ({self.get_role_display()})'
