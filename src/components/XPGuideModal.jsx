import React from 'react';
import { X, Star, MessageSquare, Repeat, Award } from 'lucide-react';

const XPAction = ({ icon, action, points }) => (
    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div className="flex items-center gap-3">
            <div className="text-emerald-500">{icon}</div>
            <span className="text-gray-700 dark:text-gray-300">{action}</span>
        </div>
        <span className="font-bold text-emerald-500">{points} XP</span>
    </div>
);

export default function XPGuideModal({ isOpen, onClose }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-lg shadow-lg max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-6 flex-shrink-0">
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 flex items-center gap-3">
                        <Star /> Guía de Experiencia (XP)
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="overflow-y-auto pr-4 flex-grow space-y-4">
                    <p className="text-gray-600 dark:text-gray-400">
                        Gana Puntos de Experiencia (XP) al participar activamente en Fantasya. ¡Sube de nivel para desbloquear insignias y demostrar tu estatus de mánager legendario!
                    </p>
                    
                    <XPAction icon={<Award size={20} />} action="Puntos por jornada (cada 10 pts)" points="+1" />
                    <XPAction icon={<Repeat size={20} />} action="Realizar un fichaje" points="+5" />
                    <XPAction icon={<MessageSquare size={20} />} action="Publicar en el feed" points="+10" />
                    <XPAction icon={<MessageSquare size={20} />} action="Publicar en el feed con imagen" points="+15" />
                    <XPAction icon={<Award size={20} />} action="Ganar un trofeo de temporada" points="+100" />
                    <XPAction icon={<Award size={20} />} action="Ganar un reto de jornada" points="+25" />

                </div>

                 <div className="flex justify-end mt-6 pt-4 border-t dark:border-gray-700 flex-shrink-0">
                    <button onClick={onClose} className="btn-primary">
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
}