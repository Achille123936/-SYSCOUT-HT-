"""Du pixel au repère normalisé du terrain (SRS §15.1, coordonnées 0 à 100), avec le calibrage de la caméra
(FR-043 : 4 coins de l'image, en %, sur un rectangle connu du terrain)."""

REFERENCES = {'TERRAIN': (105.0, 68.0), 'MOITIE': (52.5, 68.0), 'SURFACE': (16.5, 40.32)}


def homographie(source, cible):
    """Transformation de perspective qui envoie 4 points sur 4 points ; None s'ils sont alignés ou confondus."""
    lignes = []
    for (x, y), (u, v) in zip(source, cible):
        lignes.append([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
        lignes.append([0, 0, 0, x, y, 1, -v * x, -v * y, v])
    for colonne in range(8):
        pivot = max(range(colonne, 8), key=lambda i: abs(lignes[i][colonne]))
        if abs(lignes[pivot][colonne]) < 1e-9:
            return None
        lignes[colonne], lignes[pivot] = lignes[pivot], lignes[colonne]
        for i in range(8):
            if i != colonne:
                facteur = lignes[i][colonne] / lignes[colonne][colonne]
                lignes[i] = [a - facteur * b for a, b in zip(lignes[i], lignes[colonne])]
    return [lignes[i][8] / lignes[i][i] for i in range(8)]


class Terrain:
    """Convertit un point de l'image (pixels) en position sur le terrain (0 à 100 sur chaque axe)."""
    TOLERANCE = 3.0  # un point jusqu'à 3 % hors du terrain reste utile (pied d'un joueur sur la ligne)

    def __init__(self, calibrage, largeur_image, hauteur_image):
        if not calibrage or calibrage.get('reference') not in REFERENCES:
            raise ValueError("La caméra n'est pas calibrée : calibrez-la dans l'application (FR-043).")
        self.longueur, self.largeur = REFERENCES[calibrage['reference']]
        self.l_img, self.h_img = float(largeur_image), float(hauteur_image)
        coins = [(x, y) for x, y in calibrage['coins']]
        self.h = homographie(coins, [(0, 0), (self.longueur, 0), (self.longueur, self.largeur), (0, self.largeur)])
        if self.h is None:
            raise ValueError('Calibrage inexploitable : les 4 points sont alignés ou confondus.')

    def vers_terrain(self, px, py):
        """(x, y) entre 0 et 100, ou None si le point tombe hors du terrain calibré."""
        x, y = 100 * px / self.l_img, 100 * py / self.h_img
        h = self.h
        d = h[6] * x + h[7] * y + 1
        if abs(d) < 1e-9:
            return None
        m = ((h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d)
        nx, ny = 100 * m[0] / self.longueur, 100 * m[1] / self.largeur
        t = self.TOLERANCE
        if not (-t <= nx <= 100 + t and -t <= ny <= 100 + t):
            return None
        return round(min(100.0, max(0.0, nx)), 2), round(min(100.0, max(0.0, ny)), 2)
