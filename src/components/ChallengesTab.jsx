import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../config/firebase';
import ChallengeModal from './ChallengeModal';
import MarkWinnerModal from './MarkWinnerModal';
import { Plus, Check, Users, User } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { awardFeat } from '../utils/awardFeat';

const ChallengeCard = ({ challenge, onMarkWinner, userRole }) => {
    return (
        <div className={`p-4 rounded-lg border ${challenge.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200' : 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'}`}>
            <div className="flex justify-between items-start">
                <div>
                    <h4 className="font-bold text-gray-800 dark:text-gray-200">{challenge.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{challenge.description}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {challenge.target === 'all' ? <Users size={14} /> : <User size={14} />}
                        <span>{challenge.target === 'all' ? 'Para todos' : `Individual: ${challenge.targetUserName}`}</span>
                    </div>
                </div>
                {challenge.status === 'active' && userRole === 'admin' && (
                    <button onClick={() => onMarkWinner(challenge)} className="btn-secondary !py-1 !px-3 text-sm">Marcar Ganador</button>
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

    const handleMarkAsWinner = async (challenge, winners) => {
        const challengeRef = doc(db, 'leagues', league.id, 'seasons', season.id, 'challenges', challenge.id);
        
        await updateDoc(challengeRef, {
            status: 'completed',
            winners: winners,
        });

        // Otorgar la "hazaña" a cada ganador
        for (const winner of winners) {
            // Usamos el ID del reto como ID de la hazaña, o un ID genérico si prefieres
            await awardFeat(winner.uid, challenge.id, { 
                leagueName: league.name, 
                seasonName: season.name,
                challengeTitle: challenge.title
            });
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
                        <button onClick={() => setIsChallengeModalOpen(true)} className="btn-primary flex items-center gap-2">
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