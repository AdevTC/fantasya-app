import React, { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { Home, Search, Bookmark, User, Rss, Medal, LogOut, Shield, UserCog, ChevronsLeft, ChevronsRight, MessageSquare } from 'lucide-react';
import ThemeToggleButton from './ThemeToggleButton';

const NavItem = ({ to, icon: Icon, label, isCollapsed }) => (
    <NavLink
        to={to}
        className={({ isActive }) =>
            `flex items-center p-3 my-1 rounded-lg transition-colors ${
                isActive
                    ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
            }`
        }
    >
        <Icon strokeWidth={2} className="w-6 h-6 flex-shrink-0" />
        {!isCollapsed && <span className="ml-4 font-semibold">{label}</span>}
    </NavLink>
);

export default function SideNavBar() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/');
    };

    if (!profile) {
        return null;
    }

    return (
        // --- ASEGURAMOS QUE SEA "sticky" PARA LA VISTA DE ESCRITORIO ---
        <aside className={`hidden md:flex flex-col h-screen sticky top-0 bg-white dark:bg-gray-800/50 border-r dark:border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}>
            <div className="flex items-center h-16 p-4 border-b dark:border-gray-700 gap-2">
                {!isCollapsed && (
                     <Link to="/dashboard" className="flex items-center gap-2">
                        <img src="/logoFantasya_v0.png" alt="Fantasya Logo" className="w-8 h-8" />
                        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">Fantasya</h1>
                    </Link>
                )}
                
                <div className="flex-grow" />

                <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    {isCollapsed ? <ChevronsRight className="text-gray-600 dark:text-gray-300" /> : <ChevronsLeft className="text-gray-600 dark:text-gray-300" />}
                </button>
            </div>

            <nav className="flex-1 p-2 overflow-y-auto">
                <NavItem to="/dashboard" icon={Home} label="Ligas" isCollapsed={isCollapsed} />
                <NavItem to="/feed" icon={Rss} label="Feed" isCollapsed={isCollapsed} />
                <NavItem to="/chats" icon={MessageSquare} label="Chats" isCollapsed={isCollapsed} />
                <NavItem to="/search" icon={Search} label="Buscar" isCollapsed={isCollapsed} />
                <NavItem to="/achievements" icon={Medal} label="Logros" isCollapsed={isCollapsed} />
                <NavItem to="/saved-posts" icon={Bookmark} label="Guardados" isCollapsed={isCollapsed} />
                <NavItem to={`/profile/${profile.username}`} icon={User} label="Perfil" isCollapsed={isCollapsed} />
                
                {profile.appRole === 'superadmin' && (
                    <div className="mt-4 pt-4 border-t dark:border-gray-700">
                        {!isCollapsed && <p className="px-3 text-xs font-semibold text-gray-400 uppercase">Admin</p>}
                        <NavItem to="/players-database" icon={Shield} label="Jugadores" isCollapsed={isCollapsed} />
                        <NavItem to="/super-admin" icon={UserCog} label="Usuarios" isCollapsed={isCollapsed} />
                    </div>
                )}
            </nav>

            <div className={`p-4 border-t dark:border-gray-700 space-y-2 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
                <ThemeToggleButton isCollapsed={isCollapsed} />
                <button onClick={handleLogout} title="Cerrar Sesión" className={`flex items-center p-3 rounded-lg w-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 ${isCollapsed ? 'justify-center' : ''}`}>
                    <LogOut className="w-6 h-6 flex-shrink-0" />
                    {!isCollapsed && <span className="ml-4 font-semibold">Cerrar Sesión</span>}
                </button>
            </div>
        </aside>
    );
}
