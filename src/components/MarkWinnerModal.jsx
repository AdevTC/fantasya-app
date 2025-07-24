import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { X, Trophy } from 'lucide-react';

export default function MarkWinnerModal({ isOpen, onClose, challenge, season, onConfirm }) {
    const [selectedWinners, setSelectedWinners] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && challenge) {
            const currentWinnerUids = challenge.winners?.map(w => w.uid) || [];
            setSelectedWinners(currentWinnerUids);
        }
    }, [isOpen, challenge]);

    if (!isOpen || !challenge) return null;

    const handleToggleWinner = (uid) => {
        setSelectedWinners(prev => 
            prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
        );
    };

    const handleConfirm = async () => {
        if (challenge.targetType === 'single' && selectedWinners.length > 1) {
            return toast.error('Este reto solo puede tener un ganador.');
        }
        setLoading(true);
        const winnersData = selectedWinners.map(uid => ({
            uid: uid,
            teamName: season.members[uid].teamName
        }));

        try {
            await onConfirm(challenge, winnersData);
            onClose();
        } catch (error) {
            // El toast de error se gestiona en el componente padre
        } finally {
            setLoading(false);
        }
    };

    const getTargetMembers = () => {
        if (!challenge.targetType || !season.members) return [];
        switch (challenge.targetType) {
            case 'single':
            case 'selection':
                return Object.entries(season.members).filter(([uid]) => challenge.targetUsers.includes(uid));
            case 'all':
            default:
                return Object.entries(season.members);
        }
    };
    
    const targetMembers = getTargetMembers();

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-md shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Asignar Ganadores</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X size={24} />
                    </button>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-4">Selecciona el/los participante(s) que han completado el reto: <span className="font-bold">{challenge.title}</span></p>

                <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-2">
                    {targetMembers.map(([uid, member]) => (
                        <label key={uid} className={`flex items-center gap-3 p-2 rounded-md cursor-pointer ${selectedWinners.includes(uid) ? 'bg-emerald-100' : 'hover:bg-gray-100'}`}>
                            <input 
                                type={challenge.targetType === 'single' ? 'radio' : 'checkbox'}
                                name="winner-selection"
                                checked={selectedWinners.includes(uid)}
                                onChange={() => {
                                    if (challenge.targetType === 'single') {
                                        setSelectedWinners(prev => prev.includes(uid) ? [] : [uid]); // Permite deseleccionar
                                    } else {
                                        handleToggleWinner(uid);
                                    }
                                }}
                                className="w-5 h-5"
                            />
                            <span>{member.teamName}</span>
                        </label>
                    ))}
                </div>

                <div className="flex justify-end gap-4 pt-6 mt-4 border-t dark:border-gray-700">
                    <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
                    <button onClick={handleConfirm} disabled={loading} className="btn-primary flex items-center gap-2">
                        <Trophy size={16} /> {loading ? 'Confirmando...' : 'Confirmar Ganador(es)'}
                    </button>
                </div>
            </div>
        </div>
    );
}