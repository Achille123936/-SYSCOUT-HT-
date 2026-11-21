"""Joueurs : fiches et historique des clubs (CU05, CU09, CU10) — sérialiseurs et contrôles de saisie."""
from datetime import date

from django.db import transaction
from rest_framework import serializers

from comptes.models import ROLES_CLUB, Role
from core.api import identique
from joueurs.models import HistoriqueClub, Joueur


class HistoriqueClubSerializer(serializers.ModelSerializer):
    club_nom = serializers.CharField(source='club.nom', read_only=True)
    type_contrat_libelle = serializers.CharField(source='get_type_contrat_display', read_only=True)

    class Meta:
        model = HistoriqueClub
        fields = ['id', 'club', 'club_nom', 'date_debut', 'date_fin', 'type_contrat', 'type_contrat_libelle']


class JoueurSerializer(serializers.ModelSerializer):
    nom_complet = serializers.CharField(read_only=True)
    age = serializers.IntegerField(source='calculer_age', read_only=True)
    est_mineur = serializers.BooleanField(read_only=True)
    poste_libelle = serializers.CharField(source='get_poste_display', read_only=True)
    groupe_poste = serializers.CharField(read_only=True)
    club_nom = serializers.CharField(source='club_actuel.nom', read_only=True)
    club_division = serializers.CharField(source='club_actuel.division', read_only=True)
    type_contrat = serializers.ChoiceField(choices=HistoriqueClub.CONTRATS, write_only=True, required=False)

    class Meta:
        model = Joueur
        fields = ['id', 'nom', 'prenom', 'nom_complet', 'sexe', 'date_naissance', 'age', 'est_mineur', 'nationalite',
                  'telephone', 'courriel', 'adresse', 'poste', 'poste_libelle', 'groupe_poste', 'pied_fort', 'taille',
                  'poids', 'photo', 'club_actuel', 'club_nom', 'club_division', 'type_contrat', 'nom_tuteur',
                  'lien_tuteur', 'accord_tuteur', 'indice_performance', 'version']
        read_only_fields = ['indice_performance']
        extra_kwargs = {'date_naissance': {'required': True, 'allow_null': False}, 'version': {'required': False}}

    def validate_date_naissance(self, valeur):
        if valeur > date.today():
            raise serializers.ValidationError('La date de naissance ne peut pas être dans le futur.')
        return valeur

    def validate(self, data):
        inst = self.instance
        valeur = lambda champ: data.get(champ, getattr(inst, champ, None))  # noqa: E731
        # CU05 étape 6 : absence de doublon (nom + date de naissance)
        memes_dates = Joueur.objects.filter(date_naissance=valeur('date_naissance'))
        if inst:
            memes_dates = memes_dates.exclude(pk=inst.pk)
        if any(identique(valeur('nom'), n) and identique(valeur('prenom'), p)
               for n, p in memes_dates.values_list('nom', 'prenom')):
            raise serializers.ValidationError({'nom': 'Ce joueur existe déjà (même nom et même date de naissance).'})
        # RG12 : un mineur exige le nom du tuteur et son accord écrit
        naissance = valeur('date_naissance')
        if naissance and Joueur(date_naissance=naissance).est_mineur:
            erreurs = {}
            if not valeur('nom_tuteur'):
                erreurs['nom_tuteur'] = 'Champ obligatoire : le joueur est mineur (RG12).'
            if not valeur('accord_tuteur'):
                erreurs['accord_tuteur'] = "L'accord écrit du parent ou tuteur est exigé (RG12)."
            if erreurs:
                raise serializers.ValidationError(erreurs)
        # Verrouillage optimiste : une modification ne doit pas en écraser une autre
        if inst and 'version' in data and data['version'] != inst.version:
            raise serializers.ValidationError(
                {'version': "Cette fiche a été modifiée par un autre utilisateur. Rechargez-la avant d'enregistrer."})
        return data

    @transaction.atomic
    def create(self, data):
        contrat = data.pop('type_contrat', 'AMATEUR')
        data.pop('version', None)
        joueur = super().create(data)
        HistoriqueClub.objects.create(joueur=joueur, club=joueur.club_actuel, date_debut=date.today(),
                                      type_contrat=contrat)
        return joueur

    @transaction.atomic
    def update(self, joueur, data):
        contrat = data.pop('type_contrat', 'AMATEUR')
        nouveau_club = data.pop('club_actuel', None)
        data['version'] = joueur.version + 1
        joueur = super().update(joueur, data)
        if nouveau_club and nouveau_club != joueur.club_actuel:
            joueur.changer_club(nouveau_club, type_contrat=contrat)  # RG1
        return joueur

    def to_representation(self, joueur):
        rep = super().to_representation(joueur)
        request = self.context.get('request')
        u = getattr(request, 'user', None)
        role = getattr(u, 'role', None)
        # un compte de club ne voit les données personnelles que de ses propres joueurs (administrateur de club,
        # entraîneur), ou de lui-même (joueur) ; un club client n'en voit aucune
        client = role in ROLES_CLUB and not (
            (role in (Role.CLUB_ADMIN, Role.COACH) and joueur.club_actuel_id == u.club_id)
            or (role == Role.JOUEUR and u.joueur_id == joueur.id))
        # RG12 : la fiche d'un mineur n'affiche ni téléphone ni adresse
        if joueur.est_mineur or client:
            rep['telephone'] = ''
            rep['adresse'] = ''
        if client:  # données personnelles réservées aux rôles autorisés
            for champ in ('courriel', 'nom_tuteur', 'lien_tuteur', 'accord_tuteur'):
                rep[champ] = None
        return rep
