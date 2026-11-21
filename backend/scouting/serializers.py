"""Scouting : rapports et shortlists (CU10, CU11, CU12) — sérialiseurs et contrôles de saisie."""
from rest_framework import serializers

from joueurs.serializers import JoueurSerializer
from scouting.models import RapportScouting, Shortlist


class RapportSerializer(serializers.ModelSerializer):
    joueur_nom = serializers.CharField(source='joueur.nom_complet', read_only=True)
    joueur_club = serializers.CharField(source='joueur.club_actuel.nom', read_only=True)
    scout_nom = serializers.CharField(source='scout.nom_complet', read_only=True)
    valide_par_nom = serializers.CharField(source='valide_par.nom_complet', read_only=True, default=None)
    match_libelle = serializers.SerializerMethodField()
    etat_libelle = serializers.CharField(source='get_etat_display', read_only=True)
    recommandation_libelle = serializers.CharField(source='get_recommandation_display', read_only=True)

    class Meta:
        model = RapportScouting
        fields = ['id', 'joueur', 'joueur_nom', 'joueur_club', 'scout', 'scout_nom', 'match_observe',
                  'match_libelle', 'date_rapport', 'forces', 'faiblesses', 'note', 'recommandation',
                  'recommandation_libelle', 'commentaire_validation', 'etat', 'etat_libelle', 'valide_par',
                  'valide_par_nom', 'date_validation']
        read_only_fields = ['scout', 'etat', 'commentaire_validation', 'valide_par', 'date_validation']
        extra_kwargs = {'note': {'error_messages': {'max_value': 'La note doit être comprise entre 0 et 10.',
                                                    'min_value': 'La note doit être comprise entre 0 et 10.'}}}

    def get_match_libelle(self, rapport):
        return str(rapport.match_observe) if rapport.match_observe_id else None

    def validate(self, data):
        joueur = data.get('joueur', getattr(self.instance, 'joueur', None))
        match = data.get('match_observe')
        if match and not match.compositions.filter(joueur=joueur).exists():
            raise serializers.ValidationError({'match_observe': "Ce joueur n'a pas participé au match choisi."})
        return data


class ShortlistSerializer(serializers.ModelSerializer):
    proprietaire_nom = serializers.CharField(source='proprietaire.nom_complet', read_only=True)
    nb_joueurs = serializers.IntegerField(source='joueurs.count', read_only=True)
    joueurs_detail = JoueurSerializer(source='joueurs', many=True, read_only=True)

    class Meta:
        model = Shortlist
        fields = ['id', 'nom', 'description', 'date_creation', 'proprietaire', 'proprietaire_nom', 'joueurs',
                  'nb_joueurs', 'joueurs_detail']
        read_only_fields = ['proprietaire', 'joueurs']
