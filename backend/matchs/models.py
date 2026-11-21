"""Matchs : rencontres, compositions et codage vidéo des événements (CU06, CU07, CU08) — modèle du domaine."""
from datetime import timedelta

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from joueurs.models import Joueur, Poste
from referentiel.models import Club, Competition


class EtatMatch(models.TextChoices):
    PLANIFIE = 'PLANIFIE', 'Planifié'
    VIDEO_IMPORTEE = 'VIDEO_IMPORTEE', 'Vidéo importée'
    EN_CODAGE = 'EN_CODAGE', 'En codage'
    CODE = 'CODE', 'Codé'
    STATS_PUBLIEES = 'STATS_PUBLIEES', 'Statistiques publiées'
    ANNULE = 'ANNULE', 'Annulé'


class Match(models.Model):
    """Rencontre entre deux clubs d'une compétition, avec sa vidéo."""
    competition = models.ForeignKey(Competition, on_delete=models.PROTECT, related_name='matchs')
    journee = models.PositiveSmallIntegerField(default=1)
    date_match = models.DateTimeField()
    stade = models.CharField(max_length=120, blank=True)
    club_domicile = models.ForeignKey(Club, on_delete=models.PROTECT, related_name='matchs_domicile')
    club_exterieur = models.ForeignKey(Club, on_delete=models.PROTECT, related_name='matchs_exterieur')
    score_domicile = models.PositiveSmallIntegerField(default=0)
    score_exterieur = models.PositiveSmallIntegerField(default=0)
    # cheminVideo : fichier stocké sur le NAS (MEDIA_ROOT) ou adresse d'une vidéo déjà hébergée
    video = models.FileField(upload_to='videos/', null=True, blank=True)
    video_url = models.URLField(blank=True)
    # second angle de caméra (le SEL prévoit 2 caméras de match), synchronisé sur le même temps
    video_url_2 = models.URLField(blank=True)
    duree = models.PositiveSmallIntegerField(default=90, help_text='minutes')
    etat = models.CharField(max_length=16, choices=EtatMatch.choices, default=EtatMatch.PLANIFIE)
    verrouille_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name='matchs_verrouilles')
    verrouille_le = models.DateTimeField(null=True, blank=True)
    code_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name='matchs_codes')

    class Meta:
        ordering = ['-date_match']
        verbose_name_plural = 'matchs'

    def __str__(self):
        return f'J{self.journee} · {self.club_domicile} {self.score_domicile} – {self.score_exterieur} {self.club_exterieur}'

    @property
    def a_video(self):
        return bool(self.video or self.video_url)

    @property
    def verrou_actif(self):
        if not self.verrouille_par_id or not self.verrouille_le:
            return False
        limite = timedelta(minutes=settings.SYSCOUT['VERROU_MINUTES'])
        return timezone.now() - self.verrouille_le < limite


class Composition(models.Model):
    """Participation d'un joueur à un match (titulaire ou remplaçant)."""
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='compositions')
    joueur = models.ForeignKey(Joueur, on_delete=models.PROTECT, related_name='compositions')
    club = models.ForeignKey(Club, on_delete=models.PROTECT, related_name='compositions')
    est_titulaire = models.BooleanField(default=True)
    numero_maillot = models.PositiveSmallIntegerField(null=True, blank=True)
    poste_occupe = models.CharField(max_length=3, choices=Poste.choices, blank=True)
    minute_entree = models.PositiveSmallIntegerField(null=True, blank=True)
    minute_sortie = models.PositiveSmallIntegerField(null=True, blank=True)
    minutes_jouees = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['club_id', '-est_titulaire', 'numero_maillot']
        constraints = [models.UniqueConstraint(fields=['match', 'joueur'], name='composition_unique')]

    def calculer_minutes_jouees(self):
        """Titulaire : de 0 à sa sortie ; remplaçant : de son entrée à la fin (0 s'il n'entre pas)."""
        duree = self.match.duree
        if self.est_titulaire:
            debut = 0
        elif self.minute_entree is None:
            return 0
        else:
            debut = self.minute_entree
        fin = self.minute_sortie if self.minute_sortie is not None else duree
        return max(0, min(fin, duree) - debut)

    def save(self, *args, **kwargs):
        self.minutes_jouees = self.calculer_minutes_jouees()
        if not self.poste_occupe:
            self.poste_occupe = self.joueur.poste
        super().save(*args, **kwargs)


class TypeAction(models.TextChoices):
    PASSE = 'PASSE', 'Passe'
    TIR = 'TIR', 'Tir'
    CENTRE = 'CENTRE', 'Centre'
    DRIBBLE = 'DRIBBLE', 'Dribble'
    DUEL = 'DUEL', 'Duel'
    INTERCEPTION = 'INTERCEPTION', 'Interception'
    RECUPERATION = 'RECUPERATION', 'Récupération'
    FAUTE = 'FAUTE', 'Faute'
    BUT = 'BUT', 'But'
    CARTON = 'CARTON', 'Carton'


class SourceDonnee(models.TextChoices):
    """Origine d'un événement (SRS HAITI SCOUT AI §1.3 : toute donnée est traçable jusqu'à sa source)."""
    HUMAN = 'HUMAN', 'Analyste'
    AI = 'AI', 'Intelligence artificielle'


class StatutValidation(models.TextChoices):
    """SRS §10 : cycle de vérification d'une proposition de l'IA par un analyste."""
    PENDING = 'PENDING', 'En attente de vérification'
    APPROVED = 'APPROVED', 'Confirmé'
    CORRECTED = 'CORRECTED', 'Corrigé par un analyste'
    REJECTED = 'REJECTED', 'Rejeté'
    UNVERIFIED = 'UNVERIFIED', 'Non vérifié'


PARTIES_CORPS = [('PIED_D', 'Pied droit'), ('PIED_G', 'Pied gauche'), ('TETE', 'Tête'), ('AUTRE', 'Autre')]


class Evenement(models.Model):
    """Action de jeu officielle, codée sur la ligne de temps d'un match : saisie par un analyste, ou proposée par
    l'IA puis confirmée ou corrigée par un analyste. Seuls ces événements entrent dans les statistiques."""
    PARTIES = PARTIES_CORPS

    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='evenements')
    joueur = models.ForeignKey(Joueur, on_delete=models.PROTECT, related_name='evenements')
    type_action = models.CharField(max_length=14, choices=TypeAction.choices)
    temps_video = models.PositiveIntegerField(default=0, help_text='secondes depuis le début de la vidéo')
    minute = models.PositiveSmallIntegerField()
    # zone du terrain en % ; x = 100 est le but adverse (sens de l'attaque du joueur)
    zone_x = models.FloatField(default=50, validators=[MinValueValidator(0), MaxValueValidator(100)])
    zone_y = models.FloatField(default=50, validators=[MinValueValidator(0), MaxValueValidator(100)])
    resultat = models.BooleanField(default=True)  # réussi / raté
    partie_corps = models.CharField(max_length=6, choices=PARTIES, blank=True)
    valeur_xg = models.FloatField(null=True, blank=True)
    # point d'arrivée d'une passe ou d'un centre, dans le même repère que la zone (carte des passes)
    fin_x = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)])
    fin_y = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)])
    # identifiant choisi par l'appareil qui saisit : un envoi répété après une coupure réseau ne crée pas de doublon
    cle_idempotence = models.UUIDField(null=True, blank=True, unique=True)
    source = models.CharField(max_length=5, choices=SourceDonnee.choices, default=SourceDonnee.HUMAN)
    statut_validation = models.CharField(
        max_length=10, choices=[(StatutValidation.APPROVED, StatutValidation.APPROVED.label),
                                (StatutValidation.CORRECTED, StatutValidation.CORRECTED.label)],
        default=StatutValidation.APPROVED)
    confiance = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(1)],
                                  help_text="score de confiance de l'IA (0 à 1), vide pour une saisie de l'analyste")

    class Meta:
        ordering = ['temps_video', 'id']
        indexes = [models.Index(fields=['match', 'type_action'])]


class PropositionIA(models.Model):
    """Événement détecté par le moteur IA, en attente de la décision d'un analyste (FR-057). Une proposition
    n'est jamais une statistique : confirmée ou corrigée, elle devient un Evenement officiel ; rejetée ou laissée
    sans vérification, elle reste ici, marquée comme telle.
    Le moteur ne connaît souvent qu'une piste de suivi (tracking ID), pas l'identité du joueur (SRS §9.1)."""
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='propositions')
    type_action = models.CharField(max_length=14, choices=TypeAction.choices)
    temps_video = models.PositiveIntegerField(help_text='secondes depuis le début de la vidéo')
    minute = models.PositiveSmallIntegerField()
    joueur = models.ForeignKey(Joueur, null=True, blank=True, on_delete=models.PROTECT, related_name='propositions',
                               help_text="joueur reconnu par l'IA, s'il l'a été")
    club = models.ForeignKey(Club, null=True, blank=True, on_delete=models.PROTECT, related_name='propositions',
                             help_text="équipe proposée d'après la couleur du maillot (FR-053)")
    piste = models.CharField(max_length=40, blank=True, help_text='identifiant temporaire de trajectoire')
    numero_maillot = models.PositiveSmallIntegerField(null=True, blank=True)
    zone_x = models.FloatField(default=50, validators=[MinValueValidator(0), MaxValueValidator(100)])
    zone_y = models.FloatField(default=50, validators=[MinValueValidator(0), MaxValueValidator(100)])
    fin_x = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)])
    fin_y = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)])
    resultat = models.BooleanField(default=True)
    partie_corps = models.CharField(max_length=6, choices=PARTIES_CORPS, blank=True)
    confiance = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(1)])
    modele = models.CharField(max_length=60, blank=True, help_text='nom et version du modèle qui a détecté')
    statut = models.CharField(max_length=10, choices=StatutValidation.choices, default=StatutValidation.PENDING)
    evenement = models.OneToOneField(Evenement, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name='proposition')
    cle_idempotence = models.UUIDField(null=True, blank=True, unique=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['temps_video', 'id']
        indexes = [models.Index(fields=['match', 'statut'])]


class PisteJoueur(models.Model):
    """Un point de trajectoire calculé par le moteur IA (SRS §15, player_tracks). La piste est un identifiant
    temporaire de suivi : elle ne devient une identité qu'après la décision d'un analyste (`joueur`). Aucune
    statistique officielle ne s'appuie sur ces points."""
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='pistes')
    piste = models.CharField(max_length=40, help_text='identifiant temporaire de trajectoire (tracking ID)')
    joueur = models.ForeignKey(Joueur, null=True, blank=True, on_delete=models.SET_NULL, related_name='pistes',
                               help_text='renseigné seulement quand un analyste a identifié la piste')
    club = models.ForeignKey(Club, null=True, blank=True, on_delete=models.SET_NULL, related_name='pistes',
                             help_text="équipe proposée d'après la couleur du maillot")
    temps_video = models.FloatField(validators=[MinValueValidator(0)], help_text='secondes depuis le début de la vidéo')
    x = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(100)],
                          help_text='repère normalisé du terrain, 0 à 100 (SRS §15.1)')
    y = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(100)])
    confiance = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(1)])
    modele = models.CharField(max_length=60, blank=True)

    class Meta:
        ordering = ['piste', 'temps_video']
        constraints = [models.UniqueConstraint(fields=['match', 'piste', 'temps_video'], name='piste_point_unique')]
        indexes = [models.Index(fields=['match', 'piste'])]


class ValidationEvenement(models.Model):
    """Historique des décisions (SRS §10) : qui, quand, statut avant et après, ancienne et nouvelle valeur,
    commentaire. Couvre la vérification des propositions de l'IA et la modification d'un événement officiel."""
    proposition = models.ForeignKey(PropositionIA, null=True, blank=True, on_delete=models.CASCADE,
                                    related_name='validations')
    evenement = models.ForeignKey(Evenement, null=True, blank=True, on_delete=models.SET_NULL,
                                  related_name='validations')
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='validations')
    validateur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='validations')
    statut_avant = models.CharField(max_length=10, choices=StatutValidation.choices)
    statut_apres = models.CharField(max_length=10, choices=StatutValidation.choices)
    avant = models.JSONField(default=dict)
    apres = models.JSONField(default=dict)
    commentaire = models.CharField(max_length=300, blank=True)
    date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']


class Annotation(models.Model):
    """Télestration : dessin posé sur l'image de la vidéo à un instant du match (flèche, cercle, trait libre)."""
    FORMES = [('FLECHE', 'Flèche'), ('CERCLE', 'Cercle'), ('TRAIT', 'Trait libre'), ('TEXTE', 'Texte'),
              ('ZONE', 'Zone'), ('LIGNE', 'Ligne'), ('SPOT', 'Projecteur'), ('COURBE', 'Flèche courbe'),
              ('MESURE', 'Distance'), ('CHAINE', 'Liaison entre joueurs'), ('POLY', 'Triangle ou forme'),
              ('OVALE', 'Zone ovale'), ('JOUEUR', 'Étiquette joueur')]

    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='annotations')
    auteur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='annotations')
    temps_video = models.PositiveIntegerField(help_text='seconde de la vidéo où le dessin apparaît')
    duree = models.PositiveSmallIntegerField(default=5, validators=[MinValueValidator(1), MaxValueValidator(60)],
                                             help_text="secondes d'affichage")
    forme = models.CharField(max_length=6, choices=FORMES)
    couleur = models.CharField(max_length=7, default='#ffd84d')
    # points en % de l'image : [[x, y], ...] ; deux points pour une flèche (départ, arrivée) ou un cercle (centre, bord), un seul pour un texte
    points = models.JSONField()
    texte = models.CharField(max_length=60, blank=True)
    # distances en mètres de chaque segment (image calibrée sur le terrain) ; vitesse en km/h pour une étiquette joueur
    mesures = models.JSONField(default=list, blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['temps_video', 'id']


class Possession(models.Model):
    """Période pendant laquelle une équipe a le ballon, chronométrée par l'analyste pendant le codage."""
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='possessions')
    club = models.ForeignKey(Club, on_delete=models.PROTECT, related_name='possessions')
    debut = models.PositiveIntegerField(help_text='seconde de la vidéo')
    fin = models.PositiveIntegerField(null=True, blank=True, help_text='vide tant que la période est en cours')

    class Meta:
        ordering = ['debut', 'id']


class DonneePhysique(models.Model):
    """Données physiques d'un joueur sur un match. Elles viennent d'un capteur GPS ou d'une saisie manuelle :
    la vidéo ne permet pas de les mesurer."""
    SOURCES = [('GPS', 'Capteur GPS'), ('MANUEL', 'Saisie manuelle'), ('VIDEO', 'Suivi sur la vidéo')]

    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='donnees_physiques')
    joueur = models.ForeignKey(Joueur, on_delete=models.PROTECT, related_name='donnees_physiques')
    distance_m = models.PositiveIntegerField(null=True, blank=True, validators=[MaxValueValidator(20000)],
                                             help_text='distance totale parcourue (m)')
    distance_sprint_m = models.PositiveIntegerField(null=True, blank=True, validators=[MaxValueValidator(5000)],
                                                    help_text='distance à haute intensité (m)')
    sprints = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MaxValueValidator(200)])
    vitesse_max_kmh = models.FloatField(null=True, blank=True,
                                        validators=[MinValueValidator(0), MaxValueValidator(45)])
    source = models.CharField(max_length=6, choices=SOURCES, default='MANUEL')

    class Meta:
        ordering = ['joueur_id']
        constraints = [models.UniqueConstraint(fields=['match', 'joueur'], name='physique_unique_par_match')]


class SuiviJoueur(models.Model):
    """Séquence pendant laquelle l'analyste a suivi un joueur sur la vidéo (télestration). Le trajet est converti
    en mètres ; la somme des séquences d'un joueur donne ses données physiques « suivi vidéo » du match."""
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='suivis')
    joueur = models.ForeignKey(Joueur, on_delete=models.PROTECT, related_name='suivis')
    auteur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='suivis')
    debut = models.FloatField(help_text='seconde de la vidéo')
    fin = models.FloatField()
    distance_m = models.FloatField()
    distance_sprint_m = models.FloatField(default=0)
    sprints = models.PositiveSmallIntegerField(default=0)
    vitesse_max_kmh = models.FloatField()
    trajet = models.JSONField(help_text='[[t, x, y], ...] en mètres sur le terrain')

    class Meta:
        ordering = ['debut', 'id']


class Playlist(models.Model):
    """Sélection de clips d'un match, enregistrée sous un nom : les critères qui choisissent les actions."""
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='playlists')
    auteur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='playlists')
    nom = models.CharField(max_length=80)
    # {"type": "TIR", "equipe": 3, "joueur": 41, "resultat": false} — une clé absente ne filtre pas
    filtres = models.JSONField(default=dict, blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nom', 'id']
