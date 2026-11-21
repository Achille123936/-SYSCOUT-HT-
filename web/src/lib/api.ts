// Client de l'API SYSCOUT-HT (Django REST). Le jeton est gardé sur l'appareil seulement si l'utilisateur le demande.
export const SERVEUR: string = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
export const API = `${SERVEUR}/api`;

const CLE = 'syscout.jeton';
let jeton: string | null = null;
let surSessionFermee: (motif: string) => void = () => {};

export const definirJeton = (v: string | null) => { jeton = v; };
export const jetonActuel = () => jeton;
export const ecouterSessionFermee = (f: (motif: string) => void) => { surSessionFermee = f; };

export const jetonMemorise = (): string | null => {
  try { return localStorage.getItem(CLE) || sessionStorage.getItem(CLE); } catch { return null; }
};
export const memoriserJeton = (v: string | null, durable: boolean) => {
  try {
    localStorage.removeItem(CLE); sessionStorage.removeItem(CLE);
    if (v) (durable ? localStorage : sessionStorage).setItem(CLE, v);
  } catch { /* stockage indisponible : la session reste en mémoire */ }
};

/** Clé d'idempotence (UUID v4) d'une saisie : renvoyée après une coupure, elle n'est enregistrée qu'une fois. */
export const nouvelleCle = (): string => crypto.randomUUID();

export class ErreurApi extends Error {
  statut: number;
  champs: Record<string, string> = {};
  constructor(message: string, statut: number, donnees: unknown) {
    super(message);
    this.statut = statut;
    if (donnees && typeof donnees === 'object' && !Array.isArray(donnees)) {
      Object.entries(donnees as Record<string, unknown>).forEach(([c, v]) => { this.champs[c] = aplatir(v); });
    }
  }
}

function aplatir(v: unknown): string {
  if (Array.isArray(v)) return v.map(aplatir).filter(Boolean).join(' ');
  if (v && typeof v === 'object') return Object.values(v as object).map(aplatir).filter(Boolean).join(' ');
  return v == null ? '' : String(v);
}

function message(donnees: any, statut: number): string {
  if (!donnees) return `Erreur ${statut}`;
  if (typeof donnees === 'string') return statut >= 500 ? 'Erreur du serveur. Réessayez.' : donnees;
  if (Array.isArray(donnees)) return aplatir(donnees);
  const lignes: string[] = [];
  if (donnees.detail) lignes.push(aplatir(donnees.detail));
  Object.entries(donnees).forEach(([champ, v]) => {
    if (['detail', 'essais_restants'].includes(champ)) return;
    lignes.push((champ === 'non_field_errors' ? '' : `${champ.replace(/_/g, ' ')} : `) + aplatir(v));
  });
  return lignes.join('\n') || `Erreur ${statut}`;
}

type Parametres = Record<string, string | number | boolean | null | undefined>;

function url(chemin: string, p?: Parametres) {
  const q = Object.entries(p || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  return API + chemin + (q ? (chemin.includes('?') ? '&' : '?') + q : '');
}

async function requete<T = any>(methode: string, chemin: string, corps?: unknown, p?: Parametres): Promise<T> {
  const entetes: Record<string, string> = { Accept: 'application/json' };
  if (jeton) entetes.Authorization = `Token ${jeton}`;
  if (corps !== undefined) entetes['Content-Type'] = 'application/json';
  let r: Response;
  try {
    r = await fetch(url(chemin, p), { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  } catch {
    throw new ErreurApi(`Serveur injoignable (${SERVEUR}). Vérifiez la connexion.`, 0, null);
  }
  const texte = await r.text();
  let donnees: any = null;
  try { donnees = texte ? JSON.parse(texte) : null; } catch { donnees = texte; }
  if (!r.ok) {
    const e = new ErreurApi(message(donnees, r.status), r.status, donnees);
    if (r.status === 401 && jeton) surSessionFermee(e.message); // 20 minutes d'inactivité : session fermée
    throw e;
  }
  return donnees as T;
}

export interface Page<T> { count: number; next: string | null; previous: string | null; results: T[] }

export const api = {
  get: <T = any>(c: string, p?: Parametres) => requete<T>('GET', c, undefined, p),
  post: <T = any>(c: string, corps: unknown = {}) => requete<T>('POST', c, corps),
  patch: <T = any>(c: string, corps: unknown) => requete<T>('PATCH', c, corps),
  put: <T = any>(c: string, corps: unknown) => requete<T>('PUT', c, corps),
  delete: <T = any>(c: string) => requete<T>('DELETE', c),
  /** Toutes les lignes d'une liste (listes de choix). */
  tout: async <T = any>(c: string, p?: Parametres): Promise<T[]> =>
    (await requete<Page<T>>('GET', c, undefined, { page_size: 1000, ...p })).results,
};

/** Export PDF : l'API renvoie un lien signé et temporaire, ouvert dans un nouvel onglet. */
export async function exporterPdf(demande: Record<string, unknown>) {
  const onglet = window.open('', '_blank'); // ouvert avant l'appel pour ne pas être bloqué
  try {
    const { url: lien } = await api.post<{ url: string }>('/exports/', demande);
    if (onglet) onglet.location.href = lien; else window.location.href = lien;
  } catch (e) {
    onglet?.close();
    throw e;
  }
}
