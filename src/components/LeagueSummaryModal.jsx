import React from 'react';
import { X, BookOpen, Trophy, Info, Calendar, Shield } from 'lucide-react';

export default function LeagueSummaryModal({ isOpen, onClose, league, season }) {
    if (!isOpen || !league || !season) return null;

    // Find the owner in the season members list
    const ownerMember = season.members && season.members[league.ownerId]
        ? season.members[league.ownerId]
        : { username: 'Desconocido' };

    const formattedDate = league.createdAt
        ? new Date(league.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'Fecha desconocida';

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bento-card w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex-shrink-0">
                    <img
                        src={season.seasonPhotoURL || 'https://source.unsplash.com/random/800x600?soccer,stadium'}
                        alt={`Imagen de ${season.seasonName}`}
                        className="w-full h-48 object-cover rounded-t-xl"
                    />
                </div>

                <div className="p-8 overflow-y-auto custom-scrollbar">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="text-3xl font-bold text-gray-800 dark:text-gray-200">{league.name}</h3>
                            <p className="text-lg font-semibold text-emerald-500">{season.seasonName}</p>
                        </div>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-4 mb-6 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full">
                            <Calendar size={16} />
                            <span>Creada el {formattedDate}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full">
                            <Shield size={16} className="text-emerald-500" />
                            <span>Admin: <span className="font-bold">{ownerMember.username}</span></span>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-2"><Info size={20} /> Descripción</h4>
                            <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap pl-8">
                                {season.description || "El administrador aún no ha añadido una descripción para esta temporada."}
                            </p>
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-2"><Trophy size={20} /> Premios</h4>
                            <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap pl-8">
                                {season.prizes || "El administrador todavía no ha especificado los premios de esta temporada."}
                            </p>
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-2"><BookOpen size={20} /> Reglas de la Liga</h4>
                            <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap pl-8">
                                {league.rules || "El administrador todavía no ha establecido las reglas para esta liga."}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex-shrink-0 flex justify-end p-6 border-t dark:border-gray-700">
                    <button onClick={onClose} className="btn-primary">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}