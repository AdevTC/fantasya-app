import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Home, Search, Bookmark, User, Rss, Medal } from 'lucide-react';

const NavItem = ({ to, icon: Icon, label }) => {
    const location = useLocation();
    const isActive = location.pathname === to;

    return (
        <NavLink to={to} className="flex flex-col items-center justify-center w-full h-full text-gray-500 dark:text-gray-400">
            <Icon strokeWidth={isActive ? 2.5 : 2} className={`transition-transform ${isActive ? 'text-emerald-500 scale-110' : ''}`} />
            <span className={`text-xs mt-1 ${isActive ? 'text-emerald-500 font-bold' : ''}`}>{label}</span>
        </NavLink>
    );
};


export default function BottomNavBar() {
    const { profile } = useAuth();

    if (!profile) {
        return null;
    }

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-50">
            <div className="flex justify-around items-center h-full">
                <NavItem to="/dashboard" icon={Home} label="Ligas" />
                <NavItem to="/feed" icon={Rss} label="Feed" />
                <NavItem to="/search" icon={Search} label="Buscar" />
                <NavItem to="/saved-posts" icon={Bookmark} label="Guardados" />
                <NavItem to="/achievements" icon={Medal} label="Logros" />
                <NavItem to={`/profile/${profile.username}`} icon={User} label="Perfil" />
            </div>
        </div>
    );
}