"""Référentiel : clubs, saisons et compétitions (CU03, CU04) — sérialiseurs et contrôles de saisie."""
from rest_framework import serializers

from core.api import identique
from referentiel.models import Club, Competition, Saison


class ClubSerializer(serializers.ModelSerializer):
    division_libelle = serializers.CharField(source='get_division_display', read_only=True)

    class Meta:
        model = Club
        fields = ['id', 'nom', 'sigle', 'ville', 'departement', 'stade', 'division', 'division_libelle', 'logo',
                  'date_fondation']
        validators = []  # le doublon est contrôlé ci-dessous avec un message en clair

    def validate(self, data):
        nom = data.get('nom', getattr(self.instance, 'nom', ''))
        ville = data.get('ville', getattr(self.instance, 'ville', ''))
        autres = Club.objects.exclude(pk=self.instance.pk) if self.instance else Club.objects.all()
        if any(identique(nom, n) and identique(ville, v) for n, v in autres.values_list('nom', 'ville')):
            raise serializers.ValidationError({'nom': 'Ce club est déjà enregistré (même nom et même ville).'})
        return data


class SaisonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Saison
        fields = ['id', 'libelle', 'date_debut', 'date_fin', 'est_courante']

    def validate(self, data):
        debut = data.get('date_debut', getattr(self.instance, 'date_debut', None))
        fin = data.get('date_fin', getattr(self.instance, 'date_fin', None))
        if debut and fin and fin <= debut:
            raise serializers.ValidationError({'date_fin': 'La date de fin doit être après la date de début.'})
        return data


class CompetitionSerializer(serializers.ModelSerializer):
    saison_libelle = serializers.CharField(source='saison.libelle', read_only=True)
    type_libelle = serializers.CharField(source='get_type_display', read_only=True)
    clubs_detail = ClubSerializer(source='clubs', many=True, read_only=True)

    class Meta:
        model = Competition
        fields = ['id', 'nom', 'type', 'type_libelle', 'niveau', 'saison', 'saison_libelle', 'date_debut', 'date_fin',
                  'clubs', 'clubs_detail']
        validators = []

    def validate(self, data):
        debut = data.get('date_debut', getattr(self.instance, 'date_debut', None))
        fin = data.get('date_fin', getattr(self.instance, 'date_fin', None))
        if debut and fin and fin <= debut:
            raise serializers.ValidationError({'date_fin': 'La date de fin doit être après la date de début.'})
        if 'clubs' in data and len(data['clubs']) < 2:
            raise serializers.ValidationError({'clubs': 'Une compétition réunit au moins 2 clubs.'})
        nom = data.get('nom', getattr(self.instance, 'nom', ''))
        saison = data.get('saison', getattr(self.instance, 'saison', None))
        doublons = Competition.objects.filter(nom__iexact=nom, saison=saison)
        if self.instance:
            doublons = doublons.exclude(pk=self.instance.pk)
        if doublons.exists():
            raise serializers.ValidationError({'nom': 'Cette compétition existe déjà pour cette saison.'})
        return data
