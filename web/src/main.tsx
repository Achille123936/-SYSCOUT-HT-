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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Accueil />} />
          <Route path="/connexion" element={<Connexion />} />
          <Route path="/app" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="joueurs" element={<Joueurs />} />
            <Route path="joueurs/:id" element={<JoueurDetail />} />
            <Route path="comparaison" element={<Comparaison />} />
            <Route path="matchs" element={<Matchs />} />
            <Route path="matchs/:id" element={<MatchDetail />} />
            <Route path="matchs/:id/direct" element={<Direct />} />
            <Route path="matchs/:id/pistes-ia" element={<PistesIA />} />
            <Route path="cameras" element={<Cameras />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
