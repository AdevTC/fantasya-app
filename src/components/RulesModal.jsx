import React from 'react';
import { X, BookOpen } from 'lucide-react';

export default function RulesModal({ isOpen, onClose, leagueName, rules }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-2xl shadow-lg max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 flex items-center gap-3">
                        <BookOpen /> Reglas de {leagueName}
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="prose dark:prose-invert overflow-y-auto pr-4 flex-grow">
                    <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                        {rules || "El administrador todavía no ha establecido las reglas para esta liga."}
                    </p>
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