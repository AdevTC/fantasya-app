import React from 'react';
import { X, Calendar, Shield, Flame } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function FeatDetailModal({ isOpen, onClose, feat }) {
    if (!isOpen || !feat || !feat.instances || feat.instances.length === 0) return null;

    const firstInstance = feat.instances[0];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-lg shadow-lg max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-6 flex-shrink-0">
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <Flame/> {firstInstance.challengeTitle}
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="overflow-y-auto pr-4 flex-grow space-y-4">
                    <p className="text-lg text-gray-600 dark:text-gray-400 italic border-l-4 border-emerald-500 pl-4">
                        "{firstInstance.description}"
                    </p>

                    <div className="mt-6">
                        <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-2">Veces conseguido ({feat.instances.length}):</h4>
                        <div className="space-y-3">
                            {feat.instances.sort((a, b) => (b.date?.toDate() || 0) - (a.date?.toDate() || 0)).map((instance, index) => (
                                <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <p className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                                        <Shield size={16} /> {instance.leagueName}
                                    </p>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 pl-8 flex items-center gap-2">
                                        <Calendar size={14} /> {instance.seasonName}
                                    </p>
                                    {instance.date && instance.date.toDate && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 pl-8 mt-1">
                                            {format(instance.date.toDate(), "'el' d 'de' MMMM 'de' yyyy", { locale: es })}
                                        </p>
                                    )}
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