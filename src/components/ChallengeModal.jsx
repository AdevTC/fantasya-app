import React, { useState } from 'react';
import { doc, setDoc, collection } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { X, Send, User, Users } from 'lucide-react';

export default function ChallengeModal({ isOpen, onClose, league, season }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [target, setTarget] = useState('all');
    const [selectedUser, setSelectedUser] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleAssignChallenge = async (e) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) {
            toast.error('El título y la descripción son obligatorios.');
            return;
        }
        if (target === 'single' && !selectedUser) {
            toast.error('Debes seleccionar un usuario para el reto individual.');
            return;
        }

        setLoading(true);
        const loadingToast = toast.loading('Asignando reto...');
        
        try {
            const challengesRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'challenges');
            const newChallengeRef = doc(challengesRef);

            await setDoc(newChallengeRef, {
                title,
                description,
                target,
                targetUser: target === 'single' ? selectedUser : null,
                status: 'active',
                winner: null,
            });

            toast.success('¡Reto asignado correctamente!', { id: loadingToast });
            onClose();
        } catch (error) {
            console.error("Error al asignar el reto:", error);
            toast.error('No se pudo asignar el reto.', { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-lg shadow-lg">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Crear Reto de Jornada</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleAssignChallenge} className="space-y-4">
                    <div>
                        <label className="label">Título del Reto</label>
                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Ej: El Muro Defensivo" />
                    </div>
                    <div>
                        <label className="label">Descripción</label>
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input h-24" placeholder="Ej: Consigue más de 40 puntos solo con tus defensas." />
                    </div>
                    <div>
                        <label className="label">Dirigido a:</label>
                        <div className="flex gap-4 mt-2">
                            <label className="flex items-center gap-2">
                                <input type="radio" name="target" value="all" checked={target === 'all'} onChange={() => setTarget('all')} />
                                <Users size={16} /> Todos
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="radio" name="target" value="single" checked={target === 'single'} onChange={() => setTarget('single')} />
                                <User size={16} /> Individual
                            </label>
                        </div>
                    </div>
                    {target === 'single' && (
                        <div>
                            <label className="label">Seleccionar Usuario</label>
                            <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="input">
                                <option value="" disabled>Elige un participante...</option>
                                {Object.entries(season.members).map(([uid, member]) => (
                                    <option key={uid} value={uid}>{member.teamName}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
                        <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
                            <Send size={16} /> {loading ? 'Asignando...' : 'Asignar Reto'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}