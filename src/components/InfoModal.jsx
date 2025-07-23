import React from 'react';
import { X, Shield, Users, Trophy, BarChart2, Repeat, Rss, User, Award, UserCog } from 'lucide-react';

const Feature = ({ icon, title, description }) => (
    <div className="flex items-start gap-4">
        <div className="flex-shrink-0 text-emerald-500 mt-1">{icon}</div>
        <div>
            <h4 className="font-bold text-gray-800 dark:text-gray-200">{title}</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
    </div>
);

export default function InfoModal({ isOpen, onClose }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-2xl shadow-lg max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Bienvenido a Fantasya</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="space-y-6">
                    <Feature 
                        icon={<Shield size={24} />}
                        title="Gestión de Ligas y Temporadas"
                        description="Crea tus propias ligas privadas e invita a tus amigos. Cada liga puede tener múltiples temporadas, guardando un historial completo de campeones y estadísticas en el Salón de la Fama."
                    />
                    <Feature 
                        icon={<Users size={24} />}
                        title="Tu Equipo, Tus Reglas"
                        description="Gestiona tu plantilla y presupuesto en la pestaña 'Mi Equipo'. Define tu alineación y formación para cada jornada y elige a tu capitán para duplicar sus puntos. Los administradores pueden ver y editar las plantillas de otros."
                    />
                    <Feature 
                        icon={<Trophy size={24} />}
                        title="Clasificación y Jornadas"
                        description="Sigue la clasificación general en tiempo real, que se actualiza automáticamente después de cada jornada. Consulta los resultados detallados de cada jornada, incluyendo el MVP y las puntuaciones de todos los participantes."
                    />
                    <Feature 
                        icon={<Repeat size={24} />}
                        title="Mercado de Fichajes Dinámico"
                        description="Registra todos los movimientos del mercado: pujas, cláusulas y acuerdos. El historial de fichajes es completo y se utiliza para generar estadísticas detalladas sobre gastos, ingresos y balances de cada equipo."
                    />
                    <Feature 
                        icon={<BarChart2 size={24} />}
                        title="Estadísticas Avanzadas"
                        description="Sumérgete en un completo análisis estadístico. Compara tu rendimiento con el de tus rivales, visualiza la evolución de puntos y posiciones a lo largo de la temporada y descubre quién es el más regular o el rey del mercado."
                    />
                    <Feature 
                        icon={<Rss size={24} />}
                        title="Feed Social de la Comunidad"
                        description="Comparte tus victorias, lamenta tus derrotas y comenta las jugadas en el feed social. Puedes crear publicaciones con texto e imágenes, usar #hashtags para organizar el contenido y guardar los posts que más te gusten."
                    />
                     <Feature 
                        icon={<User size={24} />}
                        title="Perfiles de Mánager"
                        description="Cada usuario tiene un perfil público donde se muestra su palmarés, estadísticas de carrera (como temporadas jugadas o media de puntos) y los trofeos más importantes que ha ganado."
                    />
                    <Feature 
                        icon={<Award size={24} />}
                        title="Logros y Salón de la Fama"
                        description="Gana trofeos al final de cada temporada (Campeón, Pichichi, Rey del Mercado...) que se mostrarán en tu perfil y en el Salón de la Fama de la liga. Además, desbloquea logros de carrera por tu trayectoria a largo plazo."
                    />
                    <Feature 
                        icon={<UserCog size={24} />}
                        title="Herramientas de Administración"
                        description="Los administradores de la liga tienen un panel para gestionar las puntuaciones de cada jornada, los miembros de la temporada y la configuración de la liga, asegurando un control total sobre la competición."
                    />
                </div>

                 <div className="flex justify-end mt-8 pt-4 border-t dark:border-gray-700">
                    <button onClick={onClose} className="btn-primary">
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
}