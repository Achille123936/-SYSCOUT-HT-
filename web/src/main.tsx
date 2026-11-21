import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './lib/auth';
import Layout from './components/Layout';
import Accueil from './pages/Accueil';
import Connexion from './pages/Connexion';
import Dashboard from './pages/Dashboard';
import Joueurs from './pages/Joueurs';
import JoueurDetail from './pages/JoueurDetail';
import Comparaison from './pages/Comparaison';
import Matchs from './pages/Matchs';
import MatchDetail from './pages/MatchDetail';
import Direct from './pages/Direct';
import PistesIA from './pages/PistesIA';
import Cameras from './pages/Cameras';
import Tactique from './pages/Tactique';
import VerificationIA from './pages/VerificationIA';
import Codage from './pages/Codage';
import Relecture from './pages/Relecture';
import Physique from './pages/Physique';
import Capteur from './pages/Capteur';
import Classements from './pages/Classements';
import Championnat from './pages/Championnat';
import Rapports from './pages/Rapports';
import Shortlists from './pages/Shortlists';
import { Clubs, Competitions } from './pages/Referentiel';
import Abonnements from './pages/Abonnements';
import { Utilisateurs, Audit } from './pages/Admin';
import { Equipe, Assistant } from './pages/Equipe';
import Apprentissage from './pages/Apprentissage';
import Indicateurs from './pages/Indicateurs';
import { MonCompte } from './pages/Compte';
import Inscription from './pages/Inscription';
import { JoueurForm, MatchForm } from './pages/Formulaires';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Accueil />} />
          <Route path="/connexion" element={<Connexion />} />
          <Route path="/inscription" element={<Inscription />} />
          <Route path="/app" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="joueurs" element={<Joueurs />} />
            <Route path="joueurs/nouveau" element={<JoueurForm />} />
            <Route path="joueurs/:id/modifier" element={<JoueurForm />} />
            <Route path="joueurs/:id" element={<JoueurDetail />} />
            <Route path="comparaison" element={<Comparaison />} />
            <Route path="matchs" element={<Matchs />} />
            <Route path="matchs/:id" element={<MatchDetail />} />
            <Route path="matchs/:id/direct" element={<Direct />} />
            <Route path="matchs/:id/pistes-ia" element={<PistesIA />} />
            <Route path="cameras" element={<Cameras />} />
            <Route path="matchs/nouveau" element={<MatchForm />} />
            <Route path="matchs/:id/modifier" element={<MatchForm />} />
            <Route path="matchs/:id/codage" element={<Codage />} />
            <Route path="matchs/:id/relecture" element={<Relecture />} />
            <Route path="matchs/:id/tactique" element={<Tactique />} />
            <Route path="matchs/:id/verification-ia" element={<VerificationIA />} />
            <Route path="matchs/:id/physique" element={<Physique />} />
            <Route path="matchs/:id/capteur" element={<Capteur />} />
            <Route path="classements" element={<Classements />} />
            <Route path="championnat" element={<Championnat />} />
            <Route path="rapports" element={<Rapports />} />
            <Route path="shortlists" element={<Shortlists />} />
            <Route path="clubs" element={<Clubs />} />
            <Route path="competitions" element={<Competitions />} />
            <Route path="abonnements" element={<Abonnements />} />
            <Route path="utilisateurs" element={<Utilisateurs />} />
            <Route path="audit" element={<Audit />} />
            <Route path="indicateurs" element={<Indicateurs />} />
            <Route path="equipe" element={<Equipe />} />
            <Route path="assistant" element={<Assistant />} />
            <Route path="apprentissage" element={<Apprentissage />} />
            <Route path="compte" element={<MonCompte />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
