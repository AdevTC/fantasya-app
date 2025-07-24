import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import Trophy from './Trophy';
import LoadingSpinner from './LoadingSpinner';
import { TROPHY_DEFINITIONS } from './AdminTab';

export default function HallOfFameTab({ league, seasons }) {
    const [selectedSeason, setSelectedSeason] = useState(seasons.length > 0 ? seasons[seasons.length - 1] : null);
    const [achievements, setAchievements] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!selectedSeason) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const achievementsRef = collection(db, 'leagues', league.id, 'seasons', selectedSeason.id, 'achievements');
        const q = query(achievementsRef);

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const allPossibleTrophies = { ...TROPHY_DEFINITIONS };
            const finalAchievements = Object.keys(allPossibleTrophies).map(trophyId => ({
                trophyId,
                ...allPossibleTrophies[trophyId],
                winners: [] 
            }));

            for (const achievementDoc of snapshot.docs) {
                const data = achievementDoc.data();
                const userId = achievementDoc.id;

                let winnerName = 'Usuario Desconocido';
                if (data.isPlaceholder) {
                    winnerName = data.teamName;
                } else {
                    const userRef = doc(db, 'users', userId);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        winnerName = userSnap.data().username;
                    }
                }

                data.trophies.forEach(trophy => {
                    const trophyIndex = finalAchievements.findIndex(t => t.trophyId === trophy.trophyId);
                    if (trophyIndex !== -1) {
                        finalAchievements[trophyIndex].winners.push({ username: winnerName, isPlaceholder: data.isPlaceholder });
                    }
                });
            }
            
            setAchievements(finalAchievements);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [selectedSeason, league.id]);

    if (!selectedSeason) {
        return <div className="text-center p-8 bg-white dark:bg-gray-800/50 rounded-xl">Selecciona una temporada para ver el Salón de la Fama.</div>;
    }

    return (
        <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">Salón de la Fama</h3>
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Temporada:</label>
                    <select 
                        value={selectedSeason.id} 
                        onChange={(e) => setSelectedSeason(seasons.find(s => s.id === e.target.value))}
                        className="input !w-auto !py-1 text-sm dark:bg-gray-700"
                    >
                        {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
            </div>

            {loading ? <LoadingSpinner text="Cargando trofeos..." /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {achievements.map(trophy => (
                        <div key={trophy.trophyId} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center border dark:border-gray-700">
                            <Trophy achievement={{...trophy, seasonName: selectedSeason.name, leagueName: league.name}} />
                            <div className="mt-4">
                                {trophy.winners.length > 0 ? (
                                    trophy.winners.map((winner, index) => (
                                        <p key={index} className="font-semibold text-emerald-600 dark:text-emerald-400">
                                            {winner.username} {winner.isPlaceholder && <span className="text-xs text-gray-500">(Sin reclamar)</span>}
                                        </p>
                                    ))
                                ) : (
                                    <p className="font-semibold text-gray-500">Por Determinar</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}