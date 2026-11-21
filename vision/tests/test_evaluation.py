import unittest

from syscout_vision.evaluation import evaluer_ballon, evaluer_detection, evaluer_suivi, iou, verifier_separation


def boite(x, y=0, l=10, h=20):
    return [x, y, x + l, y + h]


def video(*images):
    return {'frames': {str(i): [{'id': pid, 'boite': b} for pid, b in image] for i, image in enumerate(images)}}


class TestDetection(unittest.TestCase):
    def test_iou(self):
        self.assertEqual(iou([0, 0, 10, 10], [0, 0, 10, 10]), 1.0)
        self.assertEqual(iou([0, 0, 10, 10], [20, 20, 30, 30]), 0.0)
        self.assertAlmostEqual(iou([0, 0, 10, 10], [5, 0, 15, 10]), 1 / 3)

    def test_parfaite_puis_avec_erreurs(self):
        gt = video([(1, boite(0)), (2, boite(50))], [(1, boite(1)), (2, boite(51))])
        self.assertEqual(evaluer_detection(gt, gt)['f1'], 1.0)
        pred = video([(7, boite(0)), (8, boite(200))], [(7, boite(1))])  # 1 fausse détection, 2 joueurs manqués
        r = evaluer_detection(gt, pred)
        self.assertEqual((r['tp'], r['fp'], r['fn']), (2, 1, 2))
        self.assertAlmostEqual(r['precision'], 2 / 3, places=3)
        self.assertEqual(r['rappel'], 0.5)


class TestSuivi(unittest.TestCase):
    def test_suivi_parfait(self):
        gt = video(*[[(1, boite(i)), (2, boite(100 + i))] for i in range(10)])
        r = evaluer_suivi(gt, gt)
        self.assertEqual((r['idf1'], r['mota'], r['changements_identite']), (1.0, 1.0, 0))

    def test_changement_d_identite_baisse_idf1_et_mota(self):
        gt = video(*[[(1, boite(i))] for i in range(10)])
        # la même personne est suivie sous l'identité 5 puis 6 : détection parfaite, identité cassée
        pred = video(*[[(5 if i < 5 else 6, boite(i))] for i in range(10)])
        self.assertEqual(evaluer_detection(gt, pred)['f1'], 1.0)
        r = evaluer_suivi(gt, pred)
        self.assertEqual(r['changements_identite'], 1)
        self.assertEqual(r['mota'], 0.9)
        self.assertAlmostEqual(r['idf1'], 2 * 5 / (2 * 5 + 5 + 5), places=3)  # 5 images sur 10 par identité

    def test_identites_croisees_sont_resolues_globalement(self):
        gt = video(*[[(1, boite(0)), (2, boite(100))] for _ in range(6)])
        pred = video(*[[(9, boite(0)), (4, boite(100))] for _ in range(6)])  # ids différents mais cohérents
        self.assertEqual(evaluer_suivi(gt, pred)['idf1'], 1.0)


class TestBallonEtSeparation(unittest.TestCase):
    def test_ballon(self):
        gt = {'frames': {'0': [100, 100], '1': [110, 100], '2': None, '3': [200, 50]}}
        pred = {'frames': {'0': [102, 101], '1': [300, 300], '2': [5, 5], '3': None}}
        r = evaluer_ballon(gt, pred, rayon=15)
        self.assertEqual((r['tp'], r['fp'], r['fn']), (1, 2, 2))
        self.assertAlmostEqual(r['erreur_moyenne_px'], 2.24, places=2)

    def test_fuite_de_donnees_entre_jeux(self):
        self.assertEqual(verifier_separation({'entrainement': ['m1', 'm2'], 'validation': ['m3'], 'test': ['m4']}), [])
        self.assertEqual(verifier_separation({'entrainement': ['m1', 'm2'], 'validation': ['m2'], 'test': ['m4']}), [('m2', 'entrainement', 'validation')])


if __name__ == '__main__':
    unittest.main()
