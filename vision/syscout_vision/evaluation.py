"""Mesure de la qualité du moteur (SRS §2.1, §9.2, §20) : précision, rappel, F1, IDF1, MOTA et suivi du ballon, sur un
jeu annoté séparé des données d'entraînement.

Fichier de vérité ou de prédictions (JSON) :
    {"frames": {"0": [{"id": 3, "boite": [x1, y1, x2, y2]}, ...], "1": [...]}}
Ballon : {"frames": {"0": [x, y], "1": null}}   (null = ballon non visible / non détecté)

    python -m syscout_vision.evaluation --verite gt.json --predictions pred.json [--seuil 0.5]
    python -m syscout_vision.evaluation --ballon-verite b_gt.json --ballon-predictions b_pred.json [--rayon 15]
"""
import argparse
import json
import math
import sys
from collections import defaultdict


def iou(a, b):
    """Intersection sur union de deux boîtes [x1, y1, x2, y2]."""
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def _f1(tp, fp, fn):
    precision = tp / (tp + fp) if tp + fp else 0.0
    rappel = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * rappel / (precision + rappel) if precision + rappel else 0.0
    return precision, rappel, f1


def _appariement_glouton(gt, pred, seuil, prefere=None):
    """Apparie les boîtes d'une image par IoU décroissante ; `prefere` {id_vérité: id_prédit} garde d'abord les liens
    de l'image précédente s'ils tiennent encore (règle de continuité de CLEAR MOT)."""
    paires, pris_g, pris_p = [], set(), set()
    for i, g in enumerate(gt):
        j_pref = next((j for j, p in enumerate(pred) if prefere and prefere.get(g['id']) == p['id']), None)
        if j_pref is not None and iou(g['boite'], pred[j_pref]['boite']) >= seuil:
            paires.append((i, j_pref)); pris_g.add(i); pris_p.add(j_pref)
    candidats = sorted(((iou(g['boite'], p['boite']), i, j) for i, g in enumerate(gt) for j, p in enumerate(pred)
                        if i not in pris_g and j not in pris_p), reverse=True)
    for valeur, i, j in candidats:
        if valeur < seuil:
            break
        if i not in pris_g and j not in pris_p:
            paires.append((i, j)); pris_g.add(i); pris_p.add(j)
    return paires


def evaluer_detection(verite, predictions, seuil=0.5):
    """Précision, rappel et F1 de la détection (indépendamment des identifiants de piste)."""
    tp = fp = fn = 0
    for f in set(verite['frames']) | set(predictions['frames']):
        gt, pred = verite['frames'].get(f, []), predictions['frames'].get(f, [])
        n = len(_appariement_glouton(gt, pred, seuil))
        tp, fp, fn = tp + n, fp + len(pred) - n, fn + len(gt) - n
    precision, rappel, f1 = _f1(tp, fp, fn)
    return {'tp': tp, 'fp': fp, 'fn': fn, 'precision': round(precision, 4), 'rappel': round(rappel, 4), 'f1': round(f1, 4)}


def _hongrois(poids):
    """Affectation de poids maximal (algorithme hongrois, matrice rectangulaire) : renvoie [(ligne, colonne), ...]."""
    if not poids or not poids[0]:
        return []
    n, m = len(poids), len(poids[0])
    taille = max(n, m)
    cout = [[-(poids[i][j] if i < n and j < m else 0) for j in range(taille)] for i in range(taille)]
    u, v, p, way = [0.0] * (taille + 1), [0.0] * (taille + 1), [0] * (taille + 1), [0] * (taille + 1)
    for i in range(1, taille + 1):
        p[0], j0 = i, 0
        minv, utilise = [math.inf] * (taille + 1), [False] * (taille + 1)
        while True:
            utilise[j0] = True
            i0, delta, j1 = p[j0], math.inf, 0
            for j in range(1, taille + 1):
                if not utilise[j]:
                    cur = cout[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j], way[j] = cur, j0
                    if minv[j] < delta:
                        delta, j1 = minv[j], j
            for j in range(taille + 1):
                if utilise[j]:
                    u[p[j]] += delta; v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while j0:
            p[j0] = p[way[j0]]
            j0 = way[j0]
    return [(p[j] - 1, j - 1) for j in range(1, taille + 1) if p[j] - 1 < n and j - 1 < m]


def evaluer_suivi(verite, predictions, seuil=0.5):
    """IDF1 (identité des pistes sur toute la vidéo) et MOTA (erreurs de détection et changements d'identité)."""
    frames = sorted(set(verite['frames']) | set(predictions['frames']), key=int)
    chevauchement = defaultdict(int)  # (id vérité, id prédit) -> images où ils se recouvrent
    total_gt = total_pred = fn = fp = idsw = 0
    lien = {}  # dernière piste prédite appariée à chaque piste de vérité
    for f in frames:
        gt, pred = verite['frames'].get(f, []), predictions['frames'].get(f, [])
        total_gt += len(gt); total_pred += len(pred)
        for g in gt:
            for p in pred:
                if iou(g['boite'], p['boite']) >= seuil:
                    chevauchement[(g['id'], p['id'])] += 1
        paires = _appariement_glouton(gt, pred, seuil, lien)
        fn += len(gt) - len(paires); fp += len(pred) - len(paires)
        for i, j in paires:
            gid, pid = gt[i]['id'], pred[j]['id']
            if gid in lien and lien[gid] != pid:
                idsw += 1
            lien[gid] = pid
    gids = sorted({g for g, _ in chevauchement}); pids = sorted({p for _, p in chevauchement})
    idtp = 0
    if gids and pids:
        poids = [[chevauchement.get((g, p), 0) for p in pids] for g in gids]
        idtp = sum(poids[i][j] for i, j in _hongrois(poids))
    idfn, idfp = total_gt - idtp, total_pred - idtp
    idf1 = 2 * idtp / (2 * idtp + idfp + idfn) if 2 * idtp + idfp + idfn else 0.0
    mota = 1 - (fn + fp + idsw) / total_gt if total_gt else 0.0
    return {'idf1': round(idf1, 4), 'mota': round(mota, 4), 'changements_identite': idsw, 'fn': fn, 'fp': fp, 'objets_verite': total_gt}


def evaluer_ballon(verite, predictions, rayon=15.0):
    """Suivi du ballon : un point prédit est juste s'il tombe à moins de `rayon` pixels du ballon réel."""
    tp = fp = fn = 0
    erreurs = []
    for f in set(verite['frames']) | set(predictions['frames']):
        g, p = verite['frames'].get(f), predictions['frames'].get(f)
        if g and p:
            d = math.dist(g, p)
            if d <= rayon:
                tp += 1; erreurs.append(d)
            else:
                fp += 1; fn += 1
        elif g:
            fn += 1
        elif p:
            fp += 1
    precision, rappel, f1 = _f1(tp, fp, fn)
    return {'tp': tp, 'fp': fp, 'fn': fn, 'precision': round(precision, 4), 'rappel': round(rappel, 4), 'f1': round(f1, 4),
            'erreur_moyenne_px': round(sum(erreurs) / len(erreurs), 2) if erreurs else None}


def verifier_separation(jeux):
    """SRS §9.2 : aucun match (ou séquence) ne doit servir à la fois à l'entraînement, à la validation et au test.
    `jeux` = {'entrainement': [...], 'validation': [...], 'test': [...]} ; renvoie les éléments partagés (fuite de données)."""
    vus, partages = {}, []
    for nom, ids in jeux.items():
        for i in ids:
            if i in vus and vus[i] != nom:
                partages.append((i, vus[i], nom))
            vus.setdefault(i, nom)
    return partages


def main(argv=None):
    p = argparse.ArgumentParser(prog='syscout_vision.evaluation', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--verite'); p.add_argument('--predictions'); p.add_argument('--seuil', type=float, default=0.5)
    p.add_argument('--ballon-verite'); p.add_argument('--ballon-predictions'); p.add_argument('--rayon', type=float, default=15.0)
    a = p.parse_args(argv)
    charger = lambda chemin: json.load(open(chemin, encoding='utf-8'))  # noqa: E731
    rapport = {}
    if a.verite and a.predictions:
        gt, pred = charger(a.verite), charger(a.predictions)
        rapport['detection'] = evaluer_detection(gt, pred, a.seuil)
        rapport['suivi'] = evaluer_suivi(gt, pred, a.seuil)
    if a.ballon_verite and a.ballon_predictions:
        rapport['ballon'] = evaluer_ballon(charger(a.ballon_verite), charger(a.ballon_predictions), a.rayon)
    if not rapport:
        p.error('Indiquez --verite et --predictions (joueurs) et/ou --ballon-verite et --ballon-predictions.')
    print(json.dumps(rapport, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
