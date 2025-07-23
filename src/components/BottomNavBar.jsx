import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Home, Search, Bookmark, User, Rss, Medal, MessageSquare } from 'lucide-react';

const NavItem = ({ to, icon: Icon, label }) => {
    const location = useLocation();
    const isActive = location.pathname === to;

    return (
        <NavLink 
            to={to} 
            title={label}
            className="flex flex-col items-center justify-center w-full h-full text-gray-500 dark:text-gray-400"
        >
            <Icon strokeWidth={isActive ? 2.5 : 2} size={24} className={`transition-transform ${isActive ? 'text-emerald-500 scale-110' : ''}`} />
        </NavLink>
    );
};


export default function BottomNavBar() {
    const { profile } = useAuth();

    if (!profile) {
        return null;
    }

    return (
        <div className="md:hidden h-16 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 z-50 flex-shrink-0">
            <div className="grid grid-cols-7 items-center h-full">
                <NavItem to="/dashboard" icon={Home} label="Ligas" />
                <NavItem to="/feed" icon={Rss} label="Feed" />
                <NavItem to="/chats" icon={MessageSquare} label="Chats" />
                <NavItem to="/search" icon={Search} label="Buscar" />
                <NavItem to="/achievements" icon={Medal} label="Logros" />
                <NavItem to="/saved-posts" icon={Bookmark} label="Guardados" />
                <NavItem to={`/profile/${profile.username}`} icon={User} label="Perfil" />
            </div>
        </div>
    );
}