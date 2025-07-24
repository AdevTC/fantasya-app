import React, { useState, useEffect } from 'react';
import { doc, setDoc, collection, serverTimestamp, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { X, Send, User, Users, UserCheck } from 'lucide-react';

export default function ChallengeModal({ isOpen, onClose, league, season, existingChallenge }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [targetType, setTargetType] = useState('all'); // all, selection, single
    const [targetUsers, setTargetUsers] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (existingChallenge) {
                setTitle(existingChallenge.title);
                setDescription(existingChallenge.description);
                setTargetType(existingChallenge.targetType || 'all');
                setTargetUsers(existingChallenge.targetUsers || []);
            } else {
                setTitle('');
                setDescription('');
                setTargetType('all');
                setTargetUsers([]);
            }
        }
    }, [isOpen, existingChallenge]);

    if (!isOpen) return null;

    const handleToggleUser = (uid) => {
        setTargetUsers(prev =>
            prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
        );
    };

    const handleSaveChallenge = async (e) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) {
            return toast.error('El título y la descripción son obligatorios.');
        }
        if (targetType === 'single' && targetUsers.length !== 1) {
            return toast.error('Debes seleccionar un único usuario para un reto individual.');
        }
        if (targetType === 'selection' && targetUsers.length < 2) {
            return toast.error('Debes seleccionar al menos dos usuarios para un reto de selección.');
        }

        setLoading(true);
        const loadingToast = toast.loading(existingChallenge ? 'Guardando cambios...' : 'Creando reto...');
        
        try {
            const challengeData = {
                title,
                description,
                targetType,
                targetUsers,
            };

            const batch = writeBatch(db);

            if (existingChallenge) {
                // Actualizar el documento principal del reto
                const challengeRef = doc(db, 'leagues', league.id, 'seasons', season.id, 'challenges', existingChallenge.id);
                batch.update(challengeRef, challengeData);

                // Si el reto tiene ganadores, actualizar sus documentos de hazañas
                if (existingChallenge.winners && existingChallenge.winners.length > 0) {
                    for (const winner of existingChallenge.winners) {
                        const featRef = doc(db, 'users', winner.uid, 'feats', existingChallenge.id);
                        const featSnap = await getDoc(featRef); // Necesitamos leer el documento primero

                        if (featSnap.exists()) {
                            const featData = featSnap.data();
                            const updatedInstances = featData.instances.map(instance => {
                                // Actualizamos solo la instancia de esta temporada/liga específica
                                if (instance.seasonName === season.name && instance.leagueName === league.name) {
                                    return {
                                        ...instance,
                                        challengeTitle: title,
                                        description: description
                                    };
                                }
                                return instance;
                            });
                            batch.update(featRef, { instances: updatedInstances });
                        }
                    }
                }
                await batch.commit();
                toast.success('¡Reto actualizado!', { id: loadingToast });

            } else {
                const challengesRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'challenges');
                const newChallengeRef = doc(challengesRef);
                await setDoc(newChallengeRef, {
                    ...challengeData,
                    status: 'active',
                    winners: [],
                    createdAt: serverTimestamp(),
                });
                toast.success('¡Reto creado correctamente!', { id: loadingToast });
            }
            onClose();
        } catch (error) {
            console.error("Error al guardar el reto:", error);
            toast.error('No se pudo guardar el reto.', { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-lg shadow-lg">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">{existingChallenge ? 'Editar Reto' : 'Crear Reto de Jornada'}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"><X size={24} /></button>
                </div>

                <form onSubmit={handleSaveChallenge} className="space-y-4">
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
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            <button type="button" onClick={() => setTargetType('all')} className={`btn-secondary flex items-center justify-center gap-2 !py-3 ${targetType === 'all' && '!bg-emerald-100 !text-emerald-700'}`}><Users size={16} /> Todos</button>
                            <button type="button" onClick={() => setTargetType('selection')} className={`btn-secondary flex items-center justify-center gap-2 !py-3 ${targetType === 'selection' && '!bg-emerald-100 !text-emerald-700'}`}><UserCheck size={16} /> Selección</button>
                            <button type="button" onClick={() => setTargetType('single')} className={`btn-secondary flex items-center justify-center gap-2 !py-3 ${targetType === 'single' && '!bg-emerald-100 !text-emerald-700'}`}><User size={16} /> Individual</button>
                        </div>
                    </div>
                    
                    {(targetType === 'selection' || targetType === 'single') && (
                        <div>
                            <label className="label">Seleccionar Participantes</label>
                            <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                                {Object.entries(season.members).map(([uid, member]) => (
                                    <label key={uid} className={`flex items-center gap-3 p-2 rounded-md cursor-pointer ${targetUsers.includes(uid) ? 'bg-emerald-100' : 'hover:bg-gray-100'}`}>
                                        <input 
                                            type={targetType === 'single' ? 'radio' : 'checkbox'}
                                            name="user-selection"
                                            checked={targetUsers.includes(uid)}
                                            onChange={() => {
                                                if(targetType === 'single') {
                                                    setTargetUsers([uid]);
                                                } else {
                                                    handleToggleUser(uid);
                                                }
                                            }}
                                            className="w-5 h-5"
                                        />
                                        <span>{member.teamName}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
                        <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2"><Send size={16} /> {loading ? 'Guardando...' : 'Guardar Reto'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}