import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaFutbol, FaTrophy, FaUsers, FaChartLine } from 'react-icons/fa';
import { Info, MessageSquare, Star, Flame, User } from 'lucide-react';
import InfoModal from '../components/InfoModal';

const FeatureCard = ({ icon, title, description }) => (
    <div className="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-md border dark:border-gray-700 text-center h-full flex flex-col items-center">
        <div className="text-emerald-500 text-4xl mx-auto mb-4">{icon}</div>
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">{title}</h3>
        <p className="text-gray-600 dark:text-gray-400">{description}</p>
    </div>
);

export default function LandingPage() {
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

    return (
        <>
            <InfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} />
            <div className="bg-gray-50 dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-200">
                {/* Header */}
                <header className="fixed top-0 left-0 right-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50 border-b dark:border-gray-700">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between items-center h-16">
                            <div className="flex items-center space-x-3">
                                {/* --- LOGO ACTUALIZADO AQUÍ --- */}
                                <img src="../logoFantasya_v0.png" alt="Fantasya Logo" className="w-10 h-10" />
                                <h1 className="text-2xl font-bold">Fantasya</h1>
                            </div>
                            <div className="flex items-center gap-4">
                                <button onClick={() => setIsInfoModalOpen(true)} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Información de la App">
                                    <Info size={20} />
                                </button>
                                <Link to="/login" className="text-sm font-semibold hover:text-emerald-500 transition-colors">Iniciar Sesión</Link>
                                <Link to="/login" className="btn-primary text-sm">Crear Cuenta</Link>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Hero Section */}
                <main className="pt-32 pb-20 animate-fade-in">
                    <div className="max-w-4xl mx-auto text-center px-4">
                        <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight">
                            La Liga Fantasy Definitiva para Jugar con Amigos
                        </h2>
                        <p className="mt-6 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                            Crea tu liga, gestiona tu equipo, ficha a las estrellas y compite jornada a jornada. Con estadísticas avanzadas, retos, perfiles de mánager y una comunidad activa, Fantasya es el lugar donde demuestras quién sabe más de fútbol.
                        </p>
                        <div className="mt-8">
                            <Link to="/login" className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 px-8 rounded-lg text-lg transition-transform transform hover:scale-105 shadow-lg">
                                ¡Empieza a Jugar Ahora!
                            </Link>
                        </div>
                    </div>
                </main>

                {/* Features Section */}
                <section className="py-20 bg-white dark:bg-gray-800/50 animate-fade-in">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-12">
                            <h3 className="text-3xl font-bold">Todo lo que necesitas para tu Liga Fantasy</h3>
                            <p className="mt-4 text-gray-600 dark:text-gray-400">Desde la gestión de equipos hasta un feed social y chat integrados.</p>
                        </div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                            <FeatureCard 
                                icon={<FaUsers />}
                                title="Ligas y Temporadas"
                                description="Crea ligas privadas con múltiples temporadas. Invita a tus amigos y guarda un historial completo de campeones."
                            />
                            <FeatureCard 
                                icon={<FaTrophy />}
                                title="Salón de la Fama"
                                description="Gana trofeos al final de cada temporada (Campeón, Pichichi, Rey del Mercado) y construye tu legado."
                            />
                             <FeatureCard 
                                icon={<FaChartLine />}
                                title="Estadísticas Avanzadas"
                                description="Analiza cada detalle con gráficos de rendimiento, comparativas y análisis de rivalidad para demostrar tu dominio."
                            />
                             <FeatureCard 
                                icon={<Flame />}
                                title="Retos de Jornada"
                                description="Completa retos semanales creados por el administrador para ganar logros únicos y presumir ante tus rivales."
                            />
                             <FeatureCard 
                                icon={<Star />}
                                title="Sistema de XP y Niveles"
                                description="Gana experiencia con cada acción en el juego. Sube de nivel para desbloquear insignias y mostrar tu estatus."
                            />
                             <FeatureCard 
                                icon={<FaFutbol />}
                                title="Comunidad Social"
                                description="Comparte tus victorias y derrotas en el feed, usa #hashtags y comenta las jugadas de otros mánagers."
                            />
                             <FeatureCard 
                                icon={<MessageSquare />}
                                title="Chat Privado"
                                description="Habla directamente con otros participantes de tus ligas para negociar fichajes o simplemente para comentar la jornada."
                            />
                             <FeatureCard 
                                icon={<User />}
                                title="Perfiles de Mánager"
                                description="Personaliza tu perfil, sigue a otros usuarios y muestra tus trofeos y logros más importantes."
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
        </>
    );
}