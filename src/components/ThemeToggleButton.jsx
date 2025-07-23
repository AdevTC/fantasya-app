import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggleButton({ isCollapsed }) {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className={`flex items-center p-3 rounded-lg w-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 ${isCollapsed ? 'justify-center' : ''}`}
            title={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
        >
            {theme === 'light' ? <Moon className="w-6 h-6 flex-shrink-0" /> : <Sun className="w-6 h-6 flex-shrink-0" />}
            {!isCollapsed && (
                <span className="ml-4 font-semibold">
                    {theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}
                </span>
            )}
        </button>
    );
}