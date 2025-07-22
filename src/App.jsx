import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './context/ThemeContext';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeaguePage from './pages/LeaguePage';
import CompleteProfilePage from './pages/CompleteProfilePage';
import UserProfilePage from './pages/UserProfilePage';
import ProtectedRoute from './components/ProtectedRoute';
import PlayersDatabasePage from './pages/PlayersDatabasePage';
import SuperAdminRoute from './components/SuperAdminRoute';
import SuperAdminPage from './pages/SuperAdminPage';
import FeedPage from './pages/FeedPage';
import SearchPage from './pages/SearchPage';
import EditProfilePage from './pages/EditProfilePage';
import SavedPostsPage from './pages/SavedPostsPage';
import AchievementsPage from './pages/AchievementsPage';
import BottomNavBar from './components/BottomNavBar';
import LandingPage from './pages/LandingPage'; // <-- IMPORTAR

// --- LÓGICA DE RUTA INICIAL ACTUALIZADA ---
function InitialRoute() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <p className="text-xl text-gray-800 dark:text-gray-200">Cargando...</p>
            </div>
        );
    }
    
    // Si hay usuario, va al dashboard. Si no, a la Landing Page.
    return user ? <Navigate to="/dashboard" /> : <LandingPage />;
}

// Componente Layout para envolver las rutas protegidas
const AppLayout = ({ children }) => {
    const { user } = useAuth();
    return (
        <div className="pb-16 md:pb-0">
            {children}
            {user && <BottomNavBar />}
        </div>
    );
};

function App() {
  return (
    <ThemeProvider>
      <Toaster 
        position="top-center" 
        reverseOrder={false}
        toastOptions={{
          success: {
            duration: 3000,
          },
          error: {
            duration: 5000,
          },
          style: {
            background: '#333',
            color: '#fff',
          },
        }}
      />
      <Router>
        <AppLayout>
            <Routes>
                {/* --- RUTA PRINCIPAL ACTUALIZADA --- */}
                <Route path="/" element={<InitialRoute />} />
                <Route path="/login" element={<LoginPage />} />

                {/* Rutas protegidas para usuarios normales */}
                <Route element={<ProtectedRoute />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/league/:leagueId" element={<LeaguePage />} />
                    <Route path="/complete-profile" element={<CompleteProfilePage />} />
                    <Route path="/profile/:username" element={<UserProfilePage />} />
                    <Route path="/feed" element={<FeedPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/edit-profile" element={<EditProfilePage />} />
                    <Route path="/saved-posts" element={<SavedPostsPage />} />
                    <Route path="/achievements" element={<AchievementsPage />} />
                </Route>

                {/* Rutas protegidas solo para Super Admins */}
                <Route element={<SuperAdminRoute />}>
                    <Route path="/players-database" element={<PlayersDatabasePage />} />
                    <Route path="/super-admin" element={<SuperAdminPage />} />
                </Route>
            </Routes>
        </AppLayout>
      </Router>
    </ThemeProvider>
  );
}

export default App;