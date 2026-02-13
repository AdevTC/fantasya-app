import React from 'react';
import { Link } from 'react-router-dom';
import { Home, Search } from 'lucide-react';

export default function NotFoundPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
            <div className="text-center max-w-lg">
                <div className="relative inline-block mb-8">
                    <span className="text-9xl font-bold text-gray-200 dark:text-gray-800">404</span>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <img
                            src="/logoFantasya_v0.png"
                            alt="Fantasya Logo"
                            className="w-24 h-24 opacity-80 animate-bounce"
                        />
                    </div>
                </div>

                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                    ¡Fuera de juego!
                </h1>

                <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
                    Parece que te has adelantado a la defensa. La página que buscas no existe o ha sido traspasada a otra liga.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Link
                        to="/dashboard"
                        className="btn-primary flex items-center justify-center gap-2"
                    >
                        <Home size={20} />
                        Volver al vestuario
                    </Link>

                    <button
                        onClick={() => window.history.back()}
                        className="btn-secondary flex items-center justify-center gap-2"
                    >
                        <Search size={20} />
                        Regresar atrás
                    </button>
                </div>
            </div>
        </div>
    );
}
