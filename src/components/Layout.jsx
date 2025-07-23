import React from 'react';
import { Outlet } from 'react-router-dom';
import SideNavBar from './SideNavBar';
import BottomNavBar from './BottomNavBar';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import { FaFutbol } from 'react-icons/fa';

export default function Layout() {
    const { user } = useAuth();
    
    if (!user) {
        return <Outlet />;
    }

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
            <SideNavBar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="md:hidden bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b dark:border-gray-700 h-16 flex justify-between items-center px-4 flex-shrink-0 z-10">
                    <Link to="/dashboard" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-vibrant-purple rounded-lg flex items-center justify-center">
                            <FaFutbol className="text-white text-lg" />
                        </div>
                        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">Fantasya</h1>
                    </Link>
                </header>
                
                <main className="main-background flex-1 overflow-x-hidden overflow-y-auto">
                    <Outlet />
                </main>
                
                <BottomNavBar />
            </div>
        </div>
    );
}