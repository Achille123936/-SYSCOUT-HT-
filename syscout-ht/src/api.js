import { Linking, Platform } from 'react-native';
import { API } from './config';

let jeton = null;
let surSessionFermee = () => {};

export function definirJeton(valeur) { jeton = valeur; }
export function jetonActuel() { return jeton; }
export function ecouterSessionFermee(rappel) { surSessionFermee = rappel; }

// Clé d'idempotence (UUID v4) d'une saisie : renvoyée après une coupure réseau, elle n'est enregistrée qu'une fois
export function nouvelleCle() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const LIBELLES = {
  nom_utilisateur: "Nom d'utilisateur", mot_de_passe: 'Mot de passe', nom: 'Nom', prenom: 'Prénom',
  date_naissance: 'Date de naissance', club_actuel: 'Club actuel', nom_tuteur: 'Nom du tuteur',
  accord_tuteur: 'Accord écrit', club_domicile: 'Équipe à domicile', club_exterieur: 'Équipe visiteuse',
  date_match: 'Date', montant_htg: 'Montant', date_debut: 'Date de début', date_fin: 'Date de fin',
  match_observe: 'Match observé', courriel: 'Courriel', non_field_errors: '', detail: '',
};

export class ErreurApi extends Error {
  constructor(message, statut, donnees) {
    super(message);
    this.statut = statut;
    this.donnees = donnees;
    // erreurs par champ, pour les signaler en rouge sous le champ concerné
    this.champs = {};
    if (donnees && typeof donnees === 'object' && !Array.isArray(donnees)) {
      Object.entries(donnees).forEach(([champ, valeur]) => { this.champs[champ] = aplatir(valeur); });
    }
  }
}

function aplatir(valeur) {
  if (Array.isArray(valeur)) return valeur.map(aplatir).filter(Boolean).join(' ');
  if (valeur && typeof valeur === 'object') return Object.values(valeur).map(aplatir).filter(Boolean).join(' ');
  return valeur == null ? '' : String(valeur);
}

function messageErreur(donnees, statut) {
  if (!donnees) return `Erreur ${statut}`;
  if (typeof donnees === 'string') return statut >= 500 ? 'Erreur du serveur. Réessayez.' : donnees;
  if (Array.isArray(donnees)) return aplatir(donnees);
  const lignes = [];
  if (donnees.detail) lignes.push(aplatir(donnees.detail));
  if (donnees.erreurs) lignes.push(...donnees.erreurs);
  Object.entries(donnees).forEach(([champ, valeur]) => {
    if (champ === 'detail' || champ === 'erreurs' || champ === 'essais_restants') return;
    const libelle = champ in LIBELLES ? LIBELLES[champ] : champ.replace(/_/g, ' ');
    lignes.push((libelle ? `${libelle} : ` : '') + aplatir(valeur));
  });
  return lignes.join('\n') || `Erreur ${statut}`;
}

function avecParametres(chemin, parametres) {
  if (!parametres) return chemin;
  const requete = Object.entries(parametres)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return requete ? `${chemin}${chemin.includes('?') ? '&' : '?'}${requete}` : chemin;
}

async function requete(methode, chemin, corps, parametres) {
  const entetes = { Accept: 'application/json' };
  if (jeton) entetes.Authorization = `Token ${jeton}`;
  const formulaire = typeof FormData !== 'undefined' && corps instanceof FormData;
  if (corps !== undefined && !formulaire) entetes['Content-Type'] = 'application/json';
  let reponse;
  try {
    reponse = await fetch(API + avecParametres(chemin, parametres), {
      method: methode, headers: entetes, body: corps === undefined ? undefined : formulaire ? corps : JSON.stringify(corps),
    });
  } catch (e) {
    throw new ErreurApi(`Serveur injoignable (${API}). Vérifiez la connexion.`, 0, null);
  }
  const texte = await reponse.text();
  let donnees = null;
  try { donnees = texte ? JSON.parse(texte) : null; } catch (e) { donnees = texte; }
  if (!reponse.ok) {
    const erreur = new ErreurApi(messageErreur(donnees, reponse.status), reponse.status, donnees);
    // 401 hors écran de connexion : la session a été fermée (20 minutes d'inactivité)
    if (reponse.status === 401 && jeton) surSessionFermee(erreur.message);
    throw erreur;
  }
  return donnees;
}

export const api = {
  get: (chemin, parametres) => requete('GET', chemin, undefined, parametres),
  post: (chemin, corps = {}) => requete('POST', chemin, corps),
  patch: (chemin, corps) => requete('PATCH', chemin, corps),
  put: (chemin, corps) => requete('PUT', chemin, corps),
  delete: (chemin) => requete('DELETE', chemin),
  // toutes les pages d'une liste (listes de choix : clubs, compétitions…)
  tout: async (chemin, parametres) => (await requete('GET', chemin, undefined, { page_size: 1000, ...parametres })).results,
};

// Fichier choisi avec expo-document-picker, prêt pour un envoi multipart (web et mobile)
export function pieceJointe(fichier) {
  if (fichier.file) return fichier.file; // web
  return { uri: fichier.uri, name: fichier.name, type: fichier.mimeType || 'application/octet-stream' };
}

// Envoi d'un fichier volumineux (vidéo de match) avec progression
export function envoyer(chemin, formulaire, surProgression) {
  return new Promise((resoudre, rejeter) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API + chemin);
    xhr.setRequestHeader('Accept', 'application/json');
    if (jeton) xhr.setRequestHeader('Authorization', `Token ${jeton}`);
    if (xhr.upload && surProgression) {
      xhr.upload.onprogress = (e) => e.lengthComputable && surProgression(Math.round((100 * e.loaded) / e.total));
    }
    xhr.onload = () => {
      let donnees = null;
      try { donnees = JSON.parse(xhr.responseText); } catch (e) { donnees = xhr.responseText; }
      if (xhr.status >= 200 && xhr.status < 300) resoudre(donnees);
      else rejeter(new ErreurApi(messageErreur(donnees, xhr.status), xhr.status, donnees));
    };
    xhr.onerror = () => rejeter(new ErreurApi("L'envoi du fichier a échoué. Vérifiez la connexion.", 0, null));
    xhr.send(formulaire);
  });
}

// CU15 — le serveur vérifie les droits puis renvoie un lien de téléchargement valable 2 minutes
export async function exporterPdf(demande) {
  // sur le web, l'onglet est ouvert avant l'appel pour ne pas être bloqué comme fenêtre surgissante
  const onglet = Platform.OS === 'web' ? window.open('', '_blank') : null;
  try {
    const { url } = await api.post('/exports/', demande);
    if (onglet) onglet.location.href = url;
    else await Linking.openURL(url);
  } catch (e) {
    if (onglet) onglet.close();
    throw e;
  }
}
