// Du terrain à l'image : même calcul de perspective que backend/apprentissage/ml.py, utilisé ici dans l'autre sens.

/** Rectangles de référence désignés sur l'image, en mètres (longueur, largeur). */
export const REFERENCES_M: Record<string, [number, number]> = { TERRAIN: [105, 68], MOITIE: [52.5, 68], SURFACE: [16.5, 40.32] };

type Point = [number, number];

/** Transformation qui envoie 4 points `source` sur 4 points `cible` ; null s'ils sont alignés ou confondus. */
export function homographie(source: Point[], cible: Point[]): number[] | null {
  const l: number[][] = [];
  source.forEach(([x, y], i) => {
    const [u, v] = cible[i];
    l.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  for (let c = 0; c < 8; c += 1) {
    let pivot = c;
    for (let i = c + 1; i < 8; i += 1) if (Math.abs(l[i][c]) > Math.abs(l[pivot][c])) pivot = i;
    if (Math.abs(l[pivot][c]) < 1e-9) return null;
    [l[c], l[pivot]] = [l[pivot], l[c]];
    for (let i = 0; i < 8; i += 1) {
      if (i === c) continue;
      const f = l[i][c] / l[c][c];
      l[i] = l[i].map((a, k) => a - f * l[c][k]);
    }
  }
  return l.map((ligne, i) => ligne[8] / ligne[i]);
}

export function projeter(h: number[], x: number, y: number): Point | null {
  const d = h[6] * x + h[7] * y + 1;
  return Math.abs(d) < 1e-9 ? null : [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
}

/** Du terrain (mètres) vers l'image (%), à partir des 4 coins cliqués : haut-gauche, haut-droit, bas-droit, bas-gauche. */
export function versImage(coins: Point[], reference: string) {
  const [L, H] = REFERENCES_M[reference];
  return homographie([[0, 0], [L, 0], [L, H], [0, H]], coins);
}
