"""Tests sans moteur ni réseau : python -m unittest discover -s tests -t .  (depuis le dossier vision)."""
import unittest

from syscout_vision.client import ClientAPI, LOT
from syscout_vision.geometrie import Terrain
from syscout_vision.moteur import points_de_la_trame

# le terrain entier occupe tout le cadre de l'image
CALIBRAGE = {'reference': 'TERRAIN', 'coins': [[0, 0], [100, 0], [100, 100], [0, 100]]}


class FausseReponse:
    ok = True

    def __init__(self, corps):
        self.corps = corps

    def json(self):
        return self.corps


class FausseSession:
    def __init__(self):
        self.headers, self.lots = {}, []

    def post(self, url, json=None, timeout=None):
        self.lots.append(json)
        return FausseReponse({'recus': len(json), 'enregistres': len(json), 'ignores': 0})


class TestGeometrie(unittest.TestCase):
    def test_coins_et_centre(self):
        t = Terrain(CALIBRAGE, 1000, 500)
        self.assertEqual(t.vers_terrain(0, 0), (0.0, 0.0))
        self.assertEqual(t.vers_terrain(1000, 500), (100.0, 100.0))
        self.assertEqual(t.vers_terrain(500, 250), (50.0, 50.0))

    def test_hors_terrain_ignore(self):
        t = Terrain({'reference': 'TERRAIN', 'coins': [[10, 10], [90, 10], [90, 90], [10, 90]]}, 1000, 500)
        self.assertIsNone(t.vers_terrain(0, 0))  # dans le public
        self.assertIsNotNone(t.vers_terrain(500, 250))

    def test_sans_calibrage_ou_degenere(self):
        with self.assertRaises(ValueError):
            Terrain(None, 1000, 500)
        with self.assertRaises(ValueError):
            Terrain({'reference': 'TERRAIN', 'coins': [[0, 0], [50, 50], [100, 100], [20, 20]]}, 1000, 500)


class TestPoints(unittest.TestCase):
    def test_pied_du_joueur_et_pistes_sans_identifiant(self):
        t = Terrain(CALIBRAGE, 1000, 500)
        pts = points_de_la_trame(t, [(400, 100, 600, 250), (0, 0, 10, 10)], [7, None], [0.9, 0.8], 1.234, 29, 'm')
        self.assertEqual(len(pts), 1)
        self.assertEqual((pts[0]['piste'], pts[0]['x'], pts[0]['y'], pts[0]['temps_video']), ('T7', 50.0, 50.0, 1.23))


class TestClient(unittest.TestCase):
    def test_envoi_par_lots(self):
        session = FausseSession()
        total = ClientAPI('http://x', session).envoyer_pistes([{'i': i} for i in range(LOT * 2 + 1)])
        self.assertEqual([len(lot) for lot in session.lots], [LOT, LOT, 1])
        self.assertEqual(total['enregistres'], LOT * 2 + 1)


if __name__ == '__main__':
    unittest.main()
