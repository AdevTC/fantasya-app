import React from 'react';
import { LoaderCircle } from 'lucide-react';

export default function LoadingSpinner({ text = 'Cargando...', fullScreen = false }) {
    if (fullScreen) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="flex flex-col items-center gap-4">
                    <LoaderCircle className="animate-spin text-emerald-500" size={48} />
                    <p className="text-lg text-gray-600 dark:text-gray-200 font-semibold">{text}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center p-8">
            <div className="flex items-center gap-3">
                <LoaderCircle className="animate-spin text-emerald-500" size={24} />
                <p className="text-md text-gray-500 dark:text-gray-400">{text}</p>
            </div>
        </div>
    );
}