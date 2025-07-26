import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import SideNavBar from './SideNavBar';
import BottomNavBar from './BottomNavBar';
import { useAuth } from '../hooks/useAuth';
import { FaFutbol } from 'react-icons/fa';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { Moon, Sun, LogOut } from 'lucide-react';

export default function Layout() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/');
    };
    
    if (!user) {
        return <Outlet />;
    }

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
            <SideNavBar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="md:hidden bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b dark:border-gray-700 h-16 flex justify-between items-center px-4 flex-shrink-0 z-10">
                    {/* --- Logo y Título (sin cambios) --- */}
                    <Link to="/dashboard" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-vibrant-purple rounded-lg flex items-center justify-center">
                            <FaFutbol className="text-white text-lg" />
                        </div>
                        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">Fantasya</h1>
                    </Link>

                    {/* --- NUEVOS BOTONES AÑADIDOS --- */}
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={toggleTheme} 
                            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                            title={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
                        >
                            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                        </button>
                        <button 
                            onClick={handleLogout} 
                            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                            title="Cerrar Sesión"
                        >
                            <LogOut size={20} />
                        </button>
                    </div>
                </header>
                
                <main className="main-background flex-1 overflow-x-hidden overflow-y-auto">
                    <Outlet />
                </main>
                
                <BottomNavBar />
            </div>
        </div>
    );
}