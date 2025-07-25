import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './context/ThemeContext';

import Layout from './components/Layout';
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
import LandingPage from './pages/LandingPage';
import ChatPage from './pages/ChatPage';
import ChatListPage from './pages/ChatListPage';

function InitialRoute() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <p className="text-xl text-gray-800 dark:text-gray-200">Cargando...</p>
            </div>
        );
    }
    
    return user ? <Navigate to="/dashboard" /> : <LandingPage />;
}

const AppWithLayout = () => (
    <Layout>
        <Outlet />
    </Layout>
);


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
        <Routes>
            <Route path="/" element={<InitialRoute />} />
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
                {/* Rutas con el Layout principal (SideNav y BottomNav) */}
                <Route element={<AppWithLayout />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/league/:leagueId" element={<LeaguePage />} />
                    <Route path="/profile/:username" element={<UserProfilePage />} />
                    <Route path="/feed" element={<FeedPage />} />
                    <Route path="/chats" element={<ChatListPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/edit-profile" element={<EditProfilePage />} />
                    <Route path="/saved-posts" element={<SavedPostsPage />} />
                    <Route path="/achievements" element={<AchievementsPage />} />
                </Route>
                
                {/* Rutas sin el Layout principal (ocupan toda la pantalla) */}
                <Route path="/chat/:chatId" element={<ChatPage />} />
                <Route path="/complete-profile" element={<CompleteProfilePage />} />

                {/* --- CORRECCIÓN AQUÍ --- */}
                {/* La ruta de SuperAdminRoute debe envolver a las rutas que protege */}
                <Route element={<SuperAdminRoute />}>
                    <Route element={<AppWithLayout />}>
                        <Route path="/players-database" element={<PlayersDatabasePage />} />
                        <Route path="/super-admin" element={<SuperAdminPage />} />
                    </Route>
                </Route>
            </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;