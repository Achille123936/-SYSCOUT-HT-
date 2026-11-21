"""Statistiques : valeurs par 90 minutes, centiles et indice de performance (RG5 à RG7) — sérialiseurs et contrôles de saisie."""
from rest_framework import serializers

from statistiques.models import StatistiqueJoueur


class StatistiqueSerializer(serializers.ModelSerializer):
    joueur_nom = serializers.CharField(source='joueur.nom_complet', read_only=True)
    poste = serializers.CharField(source='joueur.poste', read_only=True)
    groupe_poste = serializers.CharField(source='joueur.groupe_poste', read_only=True)
    club_nom = serializers.CharField(source='joueur.club_actuel.nom', read_only=True)
    age = serializers.IntegerField(source='joueur.calculer_age', read_only=True)
    saison_libelle = serializers.CharField(source='saison.libelle', read_only=True)
    eligible = serializers.BooleanField(read_only=True)

    class Meta:
        model = StatistiqueJoueur
        fields = ['id', 'joueur', 'joueur_nom', 'poste', 'groupe_poste', 'club_nom', 'age', 'saison',
                  'saison_libelle', 'eligible', 'minutes_jouees', 'matchs_joues', 'buts', 'passes_decisives', 'xg',
                  'buts_p90', 'xg_p90', 'tirs_p90', 'passes_p90', 'passes_reussies_pct', 'dribbles_p90',
                  'duels_gagnes_pct', 'recuperations_p90', 'interceptions_p90', 'tirs_tete', 'buts_tete', 'xg_tete',
                  'tirs_tete_p90', 'buts_tete_p90', 'xg_tete_p90', 'centiles', 'indice_performance']
