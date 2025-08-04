import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import SideNavBar from './SideNavBar';
import BottomNavBar from './BottomNavBar';
import { useAuth } from '../hooks/useAuth';
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
            
            <div className="flex-1 flex flex-col overflow-hidden relative">
                
                {/* --- BARRA SUPERIOR MÓVIL (SIEMPRE FIJA) --- */}
                <header 
                    className="md:hidden fixed top-0 w-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b dark:border-gray-700 h-16 flex justify-between items-center px-4 z-20"
                >
                    <Link to="/dashboard" className="flex items-center gap-2">
                        <img src="/logoFantasya_v0.png" alt="Fantasya Logo" className="w-8 h-8" />
                        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">Fantasya</h1>
                    </Link>
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
                
                {/* --- ÁREA DE CONTENIDO PRINCIPAL CON SCROLL Y PADDING --- */}
                {/* - overflow-y-auto: Permite el scroll solo en esta área.
                  - pt-16: Deja espacio para la barra superior fija.
                  - pb-16: DEJA ESPACIO PARA LA BARRA INFERIOR FIJA. Esta es la clave para que el contenido no se oculte.
                */}
                <main className="flex-1 overflow-y-auto pt-16 pb-16 md:pt-0 md:pb-0">
                    <Outlet />
                </main>
                
                <BottomNavBar />
            </div>
        </div>
    );
}