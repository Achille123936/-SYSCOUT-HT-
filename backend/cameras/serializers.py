"""Caméras et enregistrements — sérialiseurs et contrôles de saisie."""
from urllib.parse import urlsplit

from rest_framework import serializers

from apprentissage.ml import REFERENCES, homographie
from cameras.models import Camera, EnregistrementVideo, EtatCamera, Protocole
from cameras.sonde import masquer

SCHEMAS = {Protocole.RTSP: ('rtsp',), Protocole.HLS: ('http', 'https'), Protocole.HTTP: ('http', 'https')}


def valider_calibrage(donnees):
    """FR-043 : 4 points de l'image (en % : haut-gauche, haut-droit, bas-droit, bas-gauche) sur les coins d'un
    rectangle connu du terrain (terrain entier, moitié ou surface de réparation)."""
    if not isinstance(donnees, dict) or donnees.get('reference') not in REFERENCES:
        raise serializers.ValidationError({'reference': 'Choisissez la zone de référence : TERRAIN, MOITIE ou SURFACE.'})
    coins = donnees.get('coins')
    correct = isinstance(coins, list) and len(coins) == 4 and all(
        isinstance(c, (list, tuple)) and len(c) == 2
        and all(isinstance(v, (int, float)) and not isinstance(v, bool) and 0 <= v <= 100 for v in c) for c in coins)
    if not correct:
        raise serializers.ValidationError({'coins': "Indiquez 4 points [x, y] en % de l'image (0 à 100)."})
    longueur, largeur = REFERENCES[donnees['reference']]
    if homographie(coins, [(0, 0), (longueur, 0), (longueur, largeur), (0, largeur)]) is None:
        raise serializers.ValidationError({'coins': 'Les 4 points sont alignés ou confondus : le calibrage est impossible.'})
    return {'reference': donnees['reference'], 'coins': [[round(x, 2), round(y, 2)] for x, y in coins]}


class CameraSerializer(serializers.ModelSerializer):
    # le flux peut contenir un mot de passe : il s'écrit, mais ne se relit que masqué
    url_flux = serializers.CharField(max_length=500, write_only=True, required=False)
    url_flux_affichee = serializers.SerializerMethodField()
    protocole_libelle = serializers.CharField(source='get_protocole_display', read_only=True)
    etat_libelle = serializers.CharField(source='get_etat_display', read_only=True)
    match_en_cours = serializers.SerializerMethodField()

    class Meta:
        model = Camera
        fields = ['id', 'nom', 'stade', 'protocole', 'protocole_libelle', 'url_flux', 'url_flux_affichee',
                  'url_lecture', 'largeur', 'hauteur', 'fps', 'active', 'etat', 'etat_libelle',
                  'derniere_verification', 'latence_ms', 'message_etat', 'calibrage', 'match_en_cours',
                  'date_creation']
        read_only_fields = ['etat', 'derniere_verification', 'latence_ms', 'message_etat', 'calibrage', 'date_creation']

    def get_url_flux_affichee(self, camera):
        return masquer(camera.url_flux)

    def get_match_en_cours(self, camera):
        en_cours = next((e for e in camera.enregistrements.all() if e.fin is None), None)
        return en_cours.match_id if en_cours else None

    def validate(self, data):
        inst = self.instance
        protocole = data.get('protocole', getattr(inst, 'protocole', Protocole.RTSP))
        url = data.get('url_flux', getattr(inst, 'url_flux', None))
        if not url:
            raise serializers.ValidationError({'url_flux': "Indiquez l'adresse du flux de la caméra."})
        p = urlsplit(url.strip())
        try:
            p.port
        except ValueError:
            raise serializers.ValidationError({'url_flux': 'Port invalide.'})
        if p.scheme not in SCHEMAS[protocole] or not p.hostname:
            exemple = 'rtsp://192.168.1.20:554/stream1' if protocole == Protocole.RTSP else 'https://…/live.m3u8'
            raise serializers.ValidationError({'url_flux': f'Adresse invalide pour ce protocole (exemple : {exemple}).'})
        if 'url_flux' in data:
            data['url_flux'] = url.strip()
            if inst and data['url_flux'] != inst.url_flux:
                data['etat'], data['latence_ms'], data['message_etat'] = EtatCamera.NON_TESTEE, None, ''
        # un flux HLS ou MP4 sans mot de passe se lit tel quel dans l'application
        if protocole != Protocole.RTSP and not p.password and not data.get('url_lecture', getattr(inst, 'url_lecture', '')):
            data['url_lecture'] = url.strip()
        return data


class EnregistrementVideoSerializer(serializers.ModelSerializer):
    camera_nom = serializers.CharField(source='camera.nom', read_only=True)
    camera_etat = serializers.CharField(source='camera.etat', read_only=True)
    camera_calibrage = serializers.JSONField(source='camera.calibrage', read_only=True)
    duree_secondes = serializers.IntegerField(read_only=True)

    class Meta:
        model = EnregistrementVideo
        fields = ['id', 'match', 'camera', 'camera_nom', 'camera_etat', 'camera_calibrage', 'url_lecture', 'debut',
                  'fin', 'duree_secondes']
        read_only_fields = ['url_lecture', 'debut', 'fin']
