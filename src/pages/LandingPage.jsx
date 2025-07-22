import React from 'react';
import { Link } from 'react-router-dom';
import { FaFutbol, FaTrophy, FaUsers, FaChartLine } from 'react-icons/fa';

const FeatureCard = ({ icon, title, description }) => (
    <div className="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-md border dark:border-gray-700 text-center">
        <div className="text-emerald-500 text-4xl mx-auto mb-4">{icon}</div>
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">{title}</h3>
        <p className="text-gray-600 dark:text-gray-400">{description}</p>
    </div>
);

export default function LandingPage() {
    return (
        <div className="bg-gray-50 dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-200">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50 border-b dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-vibrant-purple rounded-lg flex items-center justify-center">
                                <FaFutbol className="text-white text-xl" />
                            </div>
                            <h1 className="text-2xl font-bold">Fantasya</h1>
                        </div>
                        <div className="flex items-center gap-4">
                            <Link to="/login" className="text-sm font-semibold hover:text-emerald-500 transition-colors">Iniciar Sesión</Link>
                            <Link to="/login" className="btn-primary text-sm">Crear Cuenta</Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <main className="pt-32 pb-20">
                <div className="max-w-4xl mx-auto text-center px-4">
                    <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight">
                        La Liga Fantasy Definitiva para Jugar con Amigos
                    </h2>
                    <p className="mt-6 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                        Crea tu liga, gestiona tu equipo, ficha a las estrellas y compite jornada a jornada. Con estadísticas avanzadas y una comunidad activa, Fantasya es el lugar donde demuestras quién sabe más de fútbol.
                    </p>
                    <div className="mt-8">
                        <Link to="/login" className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 px-8 rounded-lg text-lg transition-transform transform hover:scale-105 shadow-lg">
                            ¡Empieza a Jugar Ahora!
                        </Link>
                    </div>
                </div>
            </main>

            {/* Features Section */}
            <section className="py-20 bg-white dark:bg-gray-800/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h3 className="text-3xl font-bold">Todo lo que necesitas para tu Liga Fantasy</h3>
                        <p className="mt-4 text-gray-600 dark:text-gray-400">Desde la gestión de equipos hasta un feed social integrado.</p>
                    </div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <FeatureCard 
                            icon={<FaUsers />}
                            title="Ligas Privadas"
                            description="Crea tu propia liga e invita a tus amigos con un código único. ¡La competición es vuestra!"
                        />
                        <FeatureCard 
                            icon={<FaTrophy />}
                            title="Salón de la Fama"
                            description="Gana trofeos al final de cada temporada y construye tu legado. ¿Serás el próximo campeón?"
                        />
                         <FeatureCard 
                            icon={<FaChartLine />}
                            title="Estadísticas Avanzadas"
                            description="Analiza cada detalle con gráficos de rendimiento, comparativas y análisis de rivalidad."
                        />
                        <FeatureCard 
                            icon={<FaFutbol />}
                            title="Comunidad Social"
                            description="Comparte tus alegrías y penas en el feed, comenta las jugadas y sigue a otros mánagers."
                        />
                    </div>
                </div>
            </section>
            
            {/* Footer */}
            <footer className="py-8">
                <div className="max-w-7xl mx-auto px-4 text-center text-gray-500">
                    <p>&copy; {new Date().getFullYear()} Fantasya. Creado para auténticos fans del fútbol.</p>
                </div>
            </footer>
        </div>
    );
}