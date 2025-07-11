import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Toaster } from 'react-hot-toast';

// Importaciones de páginas y componentes
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeaguePage from './pages/LeaguePage';
import CompleteProfilePage from './pages/CompleteProfilePage';
import UserProfilePage from './pages/UserProfilePage'; // <-- Nueva importación
import ProtectedRoute from './components/ProtectedRoute';
import PlayersDatabasePage from './pages/PlayersDatabasePage';

// Componente auxiliar para la redirección inicial
function NavigateToCorrectPage() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
                <p className="text-xl">Cargando...</p>
            </div>
        );
    }
    
    return user ? <Navigate to="/dashboard" /> : <Navigate to="/login" />;
}

function App() {
  return (
    <>
      <Toaster 
        position="top-center" 
        reverseOrder={false}
        toastOptions={{
          success: {
            duration: 3000,
            theme: {
              primary: 'green',
              secondary: 'black',
            },
          },
          error: {
            duration: 5000,
          },
        }}
      />
      <Router>
        <Routes>
          {/* Rutas Públicas */}
          <Route path="/login" element={<LoginPage />} />

          {/* Rutas Protegidas */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/league/:leagueId" element={<LeaguePage />} />
            <Route path="/complete-profile" element={<CompleteProfilePage />} />
            <Route path="/profile/:username" element={<UserProfilePage />} />
            <Route path="/players-database" element={<PlayersDatabasePage />} />
          </Route>

          {/* Ruta principal que redirige a dashboard o login */}
          <Route path="/" element={<NavigateToCorrectPage />} />
        </Routes>
      </Router>
    </>
  );
}

export default App;