import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Adresse du serveur Django. Par défaut : la machine qui sert l'application, port 8000
// (le poste de développement vu depuis le téléphone avec Expo Go, ou localhost sur le web).
// Pour un autre serveur : EXPO_PUBLIC_API_URL=https://syscout.exemple.ht npx expo start
function adresseParDefaut() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `http://${window.location.hostname || 'localhost'}:8000`;
  }
  const hote = (Constants.expoConfig?.hostUri || '').split(':')[0];
  return `http://${hote || '10.0.2.2'}:8000`;
}

export const SERVEUR = (process.env.EXPO_PUBLIC_API_URL || adresseParDefaut()).replace(/\/$/, '');
export const API = `${SERVEUR}/api`;
