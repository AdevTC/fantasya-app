import React from 'react';
import { X, Calendar, Shield } from 'lucide-react';

export default function TrophyDetailModal({ isOpen, onClose, achievement }) {
    if (!isOpen || !achievement) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-lg shadow-lg max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-6 flex-shrink-0">
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">{achievement.name}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="overflow-y-auto pr-4 flex-grow space-y-4">
                    <p className="text-lg text-gray-600 dark:text-gray-400 italic">
                        "{achievement.description}"
                    </p>
                    
                    <div className="mt-6">
                        <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-2">Veces conseguido ({achievement.wins.length}):</h4>
                        <div className="space-y-3">
                            {achievement.wins.map((win, index) => (
                                <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <p className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                                        <Shield size={16} /> {win.leagueName}
                                    </p>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 pl-8 flex items-center gap-2">
                                        <Calendar size={14} /> {win.seasonName}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                 <div className="flex justify-end mt-6 pt-4 border-t dark:border-gray-700 flex-shrink-0">
                    <button onClick={onClose} className="btn-primary">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}