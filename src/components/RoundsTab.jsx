import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { formatHolderNames } from '../utils/helpers';
import { Link } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';

export default function RoundsTab({ league, season }) {
    const [roundsData, setRoundsData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRound, setSelectedRound] = useState(null);

    useEffect(() => {
        if (!league || !season) return;

        setLoading(true);
        const roundsRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'rounds');
        const q = query(roundsRef, orderBy('roundNumber', 'desc'));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const rounds = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRoundsData(rounds);
            if (rounds.length > 0) {
                if (!selectedRound || !rounds.find(r => r.id === selectedRound.id)) {
                    setSelectedRound(rounds[0]);
                }
            } else {
                setSelectedRound(null);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error al obtener jornadas:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [league.id, season.id]);
    
    const roundDetails = useMemo(() => {
        if (!selectedRound || !season.members) return null;
        
        const scores = selectedRound.scores || {};
        const numericScoresPlayers = [];
        const nonNumericScoresPlayers = [];

        Object.keys(scores)
            .filter(uid => season.members[uid])
            .forEach(uid => {
                const player = {
                    uid,
                    name: season.members[uid]?.teamName || 'Desconocido',
                    username: season.members[uid]?.username,
                    points: scores[uid]
                };
                if (typeof player.points === 'number') {
                    numericScoresPlayers.push(player);
                } else {
                    nonNumericScoresPlayers.push(player);
                }
            });

        numericScoresPlayers.sort((a, b) => b.points - a.points);
        
        if (numericScoresPlayers.length === 0) {
            return { 
                playerScores: nonNumericScoresPlayers,
                bestScore: 'N/A', 
                worstScore: 'N/A', 
                average: 'N/A', 
                bestScoreHolders: [], 
                worstScoreHolders: [] 
            };
        }

        const rankedPlayers = [];
        for (let i = 0; i < numericScoresPlayers.length; i++) {
            let rank;
            if (i > 0 && numericScoresPlayers[i].points === numericScoresPlayers[i - 1].points) {
                rank = rankedPlayers[i - 1].rank;
            } else {
                rank = i + 1;
            }
            rankedPlayers.push({ ...numericScoresPlayers[i], rank });
        }
        
        const validScores = numericScoresPlayers.map(s => s.points);
        const bestScore = Math.max(...validScores);
        const worstScore = Math.min(...validScores);
        const average = (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1);
        const bestScoreHolders = rankedPlayers.filter(p => p.points === bestScore).map(p => p.name);
        const worstScoreHolders = rankedPlayers.filter(p => p.points === worstScore).map(p => p.name);

        const allPlayersToShow = [...rankedPlayers, ...nonNumericScoresPlayers];

        return { playerScores: allPlayersToShow, bestScore, bestScoreHolders, worstScore, worstScoreHolders, average };
    }, [selectedRound, season.members]);

    if (loading) return <LoadingSpinner text="Cargando jornadas..." />;
    if (roundsData.length === 0) return (
        <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6 text-center">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">No hay jornadas jugadas</h3>
            <p className="mt-2 text-gray-500 dark:text-gray-400">El administrador aún no ha subido las puntuaciones de ninguna jornada para esta temporada.</p>
        </div>
    );

    const getRowClass = (rank) => {
        if (rank === 1) return 'bg-podium-gold dark:bg-yellow-900/20';
        if (rank === 2) return 'bg-podium-silver dark:bg-gray-700/20';
        if (rank === 3) return 'bg-podium-bronze dark:bg-orange-900/20';
        return 'border-gray-200 dark:border-gray-700';
    };

    return (
        <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-4 sm:p-6">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Seleccionar Jornada</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {roundsData.map(round => (
                            <button 
                                key={round.id} 
                                onClick={() => setSelectedRound(round)} 
                                className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedRound?.id === round.id 
                                    ? 'bg-emerald-50 dark:bg-emerald-900/50 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-semibold' 
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}
                            >
                                Jornada {round.roundNumber}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="lg:col-span-2">
                {selectedRound && roundDetails && (
                    <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700">
                        <div className="px-4 sm:px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/20">
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Jornada {selectedRound.roundNumber} - Resultados</h3>
                        </div>
                        <div className="p-4 sm:p-6">
                            <div className="grid md:grid-cols-3 gap-4 mb-6">
                                <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Mejor Puntuación</p>
                                    <p className="font-bold text-gray-800 dark:text-gray-200 truncate" title={`${formatHolderNames([...roundDetails.bestScoreHolders])} - ${roundDetails.bestScore} pts`}>{formatHolderNames([...roundDetails.bestScoreHolders])} - {roundDetails.bestScore} pts</p>
                                </div>
                                <div className="text-center p-4 bg-red-50 dark:bg-red-900/30 rounded-lg">
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Peor Puntuación</p>
                                    <p className="font-bold text-gray-800 dark:text-gray-200 truncate" title={`${formatHolderNames([...roundDetails.worstScoreHolders])} - ${roundDetails.worstScore} pts`}>{formatHolderNames([...roundDetails.worstScoreHolders])} - {roundDetails.worstScore} pts</p>
                                </div>
                                <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Media</p>
                                    <p className="font-bold text-gray-800 dark:text-gray-200">{roundDetails.average} pts</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {roundDetails.playerScores.map((player) => (
                                    <div key={player.uid} className={`flex items-center justify-between p-3 rounded-lg border ${getRowClass(player.rank)}`}>
                                        <div className="flex items-center">
                                            <Link to={`/profile/${player.username}`} className="font-semibold text-gray-800 dark:text-gray-200 hover:text-deep-blue dark:hover:text-blue-400 hover:underline">
                                                {player.rank ? `${player.rank}º. ` : ''}{player.name}
                                            </Link>
                                        </div>
                                        <span className={`font-bold text-lg ${typeof player.points !== 'number' ? 'text-sm text-red-500' : 'dark:text-white'}`}>
                                            {player.points} {typeof player.points === 'number' && 'pts'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}