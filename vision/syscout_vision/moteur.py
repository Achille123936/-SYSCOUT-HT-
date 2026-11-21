"""Boucle de détection : YOLO (personnes) + ByteTrack, position du pied de chaque joueur sur le terrain."""

PERSONNE = 0  # classe « person » des modèles COCO


def points_de_la_trame(terrain, boites, ids, confiances, temps, match, modele):
    """Un point par joueur suivi : milieu du bas de sa boîte (ses pieds), converti en repère du terrain.
    `boites` = [(x1, y1, x2, y2), ...] en pixels. Un joueur hors du terrain calibré (public, banc) est ignoré."""
    points = []
    for (x1, y1, x2, y2), identifiant, confiance in zip(boites, ids, confiances):
        if identifiant is None:
            continue  # pas encore suivi : sans identifiant de piste, le point ne servirait à rien
        position = terrain.vers_terrain((x1 + x2) / 2, y2)
        if position is None:
            continue
        points.append({'match': match, 'piste': f'T{int(identifiant)}', 'temps_video': round(temps, 2),
                       'x': position[0], 'y': position[1], 'confiance': round(float(confiance), 3), 'modele': modele})
    return points


def suivre(source, terrain_depuis, client, match, modele='yolo11n.pt', pas=0.5, lot=200, journal=print):
    """Lit `source` (fichier ou adresse de flux), suit les joueurs et envoie une position tous les `pas` secondes.
    `terrain_depuis(largeur, hauteur)` fabrique le Terrain une fois la taille de l'image connue."""
    from ultralytics import YOLO  # importé ici : la géométrie et le client se testent sans le moteur

    yolo = YOLO(modele)
    terrain, tampon, dernier, envoyes = None, [], -1e9, 0
    flux = yolo.track(source=source, stream=True, persist=True, tracker='bytetrack.yaml',
                      classes=[PERSONNE], verbose=False)
    for rang, resultat in enumerate(flux):
        hauteur, largeur = resultat.orig_shape
        if terrain is None:
            terrain = terrain_depuis(largeur, hauteur)
        fps = getattr(resultat, 'fps', None) or 25.0
        temps = rang / fps
        if temps - dernier < pas:
            continue
        dernier = temps
        b = resultat.boxes
        if b is None or not len(b):
            continue
        ids = b.id.tolist() if b.id is not None else [None] * len(b)
        tampon += points_de_la_trame(terrain, b.xyxy.tolist(), ids, b.conf.tolist(), temps, match, modele)
        if len(tampon) >= lot:
            envoyes += client.envoyer_pistes(tampon)['enregistres']
            tampon = []
            journal(f'{envoyes} points envoyés (vidéo à {temps:.0f} s)')
    if tampon:
        envoyes += client.envoyer_pistes(tampon)['enregistres']
    journal(f'Terminé : {envoyes} points envoyés.')
    return envoyes
