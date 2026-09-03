import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import ChallengeModal from './ChallengeModal';
import MarkWinnerModal from './MarkWinnerModal';
import { Plus, Edit, Trash2, Award } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import toast from 'react-hot-toast';
import {
    deleteSeasonChallenge,
    setChallengeWinners,
} from '../services/league-api';

const ChallengeCard = ({ challenge, onMarkWinner, onEdit, onDelete, userRole }) => {
    return (
        <div className={`p-4 rounded-lg border ${challenge.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200' : 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'}`}>
            <div className="flex justify-between items-start">
                <div>
                    <h4 className="font-bold text-gray-800 dark:text-gray-200">{challenge.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{challenge.description}</p>
                </div>
                {userRole === 'admin' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => onMarkWinner(challenge)} className="btn-secondary !py-1 !px-3 text-sm">
                            {challenge.status === 'completed' ? 'Editar Ganadores' : 'Marcar Ganador'}
                        </button>
                        <button onClick={() => onEdit(challenge)} className="p-2 text-gray-500 hover:text-blue-600"><Edit size={16}/></button>
                        <button onClick={() => onDelete(challenge)} className="p-2 text-gray-500 hover:text-red-600"><Trash2 size={16}/></button>
                    </div>
                )}
            </div>
            {challenge.status === 'completed' && (
                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
                    <h5 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Ganador(es):</h5>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                        {challenge.winners.map(winner => (
                            <span key={winner.uid} className="font-bold text-gray-700 dark:text-gray-200">{winner.teamName}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};


export default function ChallengesTab({ league, season, userRole }) {
    const [challenges, setChallenges] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isChallengeModalOpen, setIsChallengeModalOpen] = useState(false);
    const [isWinnerModalOpen, setIsWinnerModalOpen] = useState(false);
    const [selectedChallenge, setSelectedChallenge] = useState(null);
    const [editingChallenge, setEditingChallenge] = useState(null);

    useEffect(() => {
        if (!league || !season) return;
        setLoading(true);
        const challengesRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'challenges');
        const q = query(challengesRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setChallenges(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        return () => unsubscribe();
    }, [league, season]);

    const handleOpenWinnerModal = (challenge) => {
        setSelectedChallenge(challenge);
        setIsWinnerModalOpen(true);
    };

    const handleOpenEditModal = (challenge) => {
        setEditingChallenge(challenge);
        setIsChallengeModalOpen(true);
    };

    const handleOpenCreateModal = () => {
        setEditingChallenge(null);
        setIsChallengeModalOpen(true);
    };
    
    const handleDeleteChallenge = async (challenge) => {
        if (!window.confirm(`¿Estás seguro de que quieres eliminar el reto "${challenge.title}"? Esta acción no se puede deshacer.`)) return;
        const loadingToast = toast.loading('Eliminando reto...');
        try {
            await deleteSeasonChallenge({
                leagueId: league.id,
                seasonId: season.id,
                challengeId: challenge.id,
            });

            toast.success('Reto eliminado.', { id: loadingToast });
        } catch (error) {
            console.error("Error al eliminar el reto:", error);
            toast.error('No se pudo eliminar el reto.', { id: loadingToast });
        }
    };

    const handleMarkAsWinner = async (challenge, newWinners) => {
        const loadingToast = toast.loading('Actualizando ganadores...');
    
        try {
            await setChallengeWinners({
                leagueId: league.id,
                seasonId: season.id,
                challengeId: challenge.id,
                winners: newWinners,
            });
            toast.success('Ganadores actualizados.', { id: loadingToast });
        } catch (error) {
            console.error("Error al marcar ganador:", error);
            toast.error('No se pudo actualizar la información.', { id: loadingToast });
        }
    };


    if(loading) return <LoadingSpinner text="Cargando retos..."/>

    return (
        <>
            <ChallengeModal 
                isOpen={isChallengeModalOpen} 
                onClose={() => setIsChallengeModalOpen(false)}
                league={league}
                season={season}
                existingChallenge={editingChallenge}
            />
            <MarkWinnerModal
                isOpen={isWinnerModalOpen}
                onClose={() => setIsWinnerModalOpen(false)}
                challenge={selectedChallenge}
                season={season}
                onConfirm={handleMarkAsWinner}
            />

            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Retos de la Temporada</h3>
                    {userRole === 'admin' && (
                        <button onClick={handleOpenCreateModal} className="btn-primary flex items-center gap-2">
                            <Plus size={18}/> Crear Nuevo Reto
                        </button>
                    )}
                </div>

                {challenges.length > 0 ? (
                    <div className="space-y-4">
                        {challenges.map(challenge => (
                            <ChallengeCard 
                                key={challenge.id} 
                                challenge={challenge} 
                                onMarkWinner={handleOpenWinnerModal}
                                onEdit={handleOpenEditModal}
                                onDelete={() => handleDeleteChallenge(challenge)}
                                userRole={userRole}
                            />
                        ))}
                    </div>
                ) : (
                     <div className="text-center py-12">
                        <h4 className="text-xl font-semibold text-gray-700 dark:text-gray-300">No hay retos todavía</h4>
                        <p className="text-gray-500 dark:text-gray-400 mt-2">El administrador aún no ha añadido ningún reto para esta temporada.</p>
                    </div>
                )}
            </div>
        </>
    );
}
