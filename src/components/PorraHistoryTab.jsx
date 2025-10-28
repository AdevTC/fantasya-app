import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../config/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import LoadingSpinner from './LoadingSpinner';
import { Crown, List, CheckCircle, CalendarCheck } from 'lucide-react'; // Añadir CheckCircle, CalendarCheck
import { calculatePorraWinner } from '../utils/porraUtils'; // Asumiendo que está en utils

// --- NUEVA FUNCIÓN: Calcular puntuación para TODOS en una ronda ---
const calculatePorraScoresForRound = (predictions, results, members) => {
    const scores = [];
    if (!results || Object.keys(results).length === 0 || !predictions || Object.keys(predictions).length === 0) {
        return scores; // Devuelve array vacío si no hay datos
    }

    // Calcular ranking real
    const sortedResults = Object.entries(results)
        .filter(([uid, score]) => typeof score === 'number' && members[uid])
        .map(([uid, score]) => ({ uid, score }))
        .sort((a, b) => b.score - a.score);
    const realPositions = {};
    let currentRank = 0;
    let lastScore = -Infinity;
    sortedResults.forEach((player, index) => {
        if (player.score !== lastScore) { currentRank = index + 1; lastScore = player.score; }
        realPositions[player.uid] = currentRank;
    });

    // Calcular puntuación para cada participante que envió
    Object.entries(predictions).forEach(([userId, prediction]) => {
        if (!prediction || !prediction.ranking || !prediction.submittedAt) return;

        let scoreCount = 0;
        let highestPositionMatched = Infinity;

        prediction.ranking.forEach((predictedUid, index) => {
            const predictedPosition = index + 1;
            const actualPosition = realPositions[predictedUid];
            if (actualPosition === predictedPosition) {
                scoreCount++;
                if (actualPosition < highestPositionMatched) highestPositionMatched = actualPosition;
            }
        });

        scores.push({
            userId,
            username: prediction.username || members[userId]?.teamName || 'Desconocido',
            score: scoreCount,
            highestPositionMatched: highestPositionMatched === Infinity ? null : highestPositionMatched,
            submittedAt: prediction.submittedAt.toDate() // Convertir a Date para ordenar
        });
    });

    // Ordenar por puntuación (desc), luego por mejor acierto (asc), luego por tiempo (asc)
    scores.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.highestPositionMatched !== b.highestPositionMatched) {
            // Tratar nulls (Infinity) como peor posición
            const posA = a.highestPositionMatched === null ? Infinity : a.highestPositionMatched;
            const posB = b.highestPositionMatched === null ? Infinity : b.highestPositionMatched;
            return posA - posB;
        }
        return a.submittedAt.getTime() - b.submittedAt.getTime();
    });

    return scores;
};


export default function PorraHistoryTab({ league, season, roundsData }) {
    const [historyWinners, setHistoryWinners] = useState([]); // Historial general de ganadores
    const [loadingGeneral, setLoadingGeneral] = useState(true);
    // --- NUEVOS ESTADOS ---
    const [selectedHistoryRound, setSelectedHistoryRound] = useState('all'); // 'all' o número de jornada
    const [roundDetailData, setRoundDetailData] = useState([]); // Datos detallados de la jornada seleccionada
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Generar lista para selector (incluye "Todas")
    const roundsForSelector = useMemo(() => {
        const options = [{ roundNumber: 'all', name: 'Todas las Jornadas' }];
         const total = season.totalRounds || 0;
        if (total === 0) { // Fallback con roundsData
             roundsData.forEach(r => options.push({ roundNumber: r.roundNumber, name: `Jornada ${r.roundNumber}` + (r.name ? ` (${r.name})` : '') }));
        } else {
            const baseRounds = Array.from({ length: total }, (_, i) => ({ roundNumber: i + 1, name: '' }));
            const existingRoundsMap = new Map(roundsData.map(r => [r.roundNumber, r]));
             baseRounds.forEach(baseRound => options.push({
                roundNumber: baseRound.roundNumber,
                name: `Jornada ${baseRound.roundNumber}` + (existingRoundsMap.get(baseRound.roundNumber)?.name ? ` (${existingRoundsMap.get(baseRound.roundNumber).name})` : '')
            }));
        }
        return options;
    }, [season.totalRounds, roundsData]);

    // Efecto para cargar historial GENERAL de ganadores (solo una vez)
    useEffect(() => {
        const fetchGeneralHistory = async () => {
            setLoadingGeneral(true);
            try {
                const porraCollectionRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'porra');
                const porraDocsSnapshot = await getDocs(query(porraCollectionRef));
                const historyData = [];

                for (const porraDoc of porraDocsSnapshot.docs) {
                    const roundNumber = parseInt(porraDoc.id.replace('round_', ''), 10);
                    if (isNaN(roundNumber)) continue;

                    const predictionsRef = collection(porraDoc.ref, 'predictions');
                    const predictionsSnapshot = await getDocs(predictionsRef);
                    const predictions = {};
                    predictionsSnapshot.forEach(predDoc => { predictions[predDoc.id] = predDoc.data(); });

                    const roundData = roundsData.find(r => r.roundNumber === roundNumber);
                    const roundResults = roundData?.scores || null;
                    const winner = calculatePorraWinner(predictions, roundResults, season.members);

                    if (winner) {
                        historyData.push({ roundNumber, winnerUsername: winner.username, winnerUserId: winner.userId, score: winner.score, highestPositionMatched: winner.highestPositionMatched });
                    } else if (roundResults && Object.keys(predictions).length > 0) {
                        historyData.push({ roundNumber, winnerUsername: 'Desierta', winnerUserId: null, score: 0, highestPositionMatched: null });
                    }
                }
                historyData.sort((a, b) => b.roundNumber - a.roundNumber);
                setHistoryWinners(historyData);
            } catch (error) { console.error("Error al cargar historial general:", error); }
            finally { setLoadingGeneral(false); }
        };
        fetchGeneralHistory();
    }, [league.id, season.id, season.members, roundsData]); // Dependencias del historial general

    // Efecto para cargar datos DETALLADOS de una jornada específica
    useEffect(() => {
        const fetchRoundDetail = async () => {
            if (selectedHistoryRound === 'all' || !selectedHistoryRound) {
                setRoundDetailData([]); // Limpiar si se selecciona "Todas"
                return;
            }

            setLoadingDetail(true);
            setRoundDetailData([]); // Limpiar antes de cargar
            try {
                const roundNum = Number(selectedHistoryRound);
                const porraDocRef = doc(db, 'leagues', league.id, 'seasons', season.id, 'porra', `round_${roundNum}`);
                const predictionsRef = collection(porraDocRef, 'predictions');

                const predictionsSnapshot = await getDocs(query(predictionsRef)); // No necesitamos ordenar aquí
                const predictions = {};
                predictionsSnapshot.forEach(predDoc => { predictions[predDoc.id] = predDoc.data(); });

                const roundData = roundsData.find(r => r.roundNumber === roundNum);
                const roundResults = roundData?.scores || null;

                // Calcular puntuaciones para todos en esta ronda
                const scores = calculatePorraScoresForRound(predictions, roundResults, season.members);
                setRoundDetailData(scores);

            } catch (error) {
                console.error(`Error al cargar detalle de porra J${selectedHistoryRound}:`, error);
                setRoundDetailData([]); // Limpiar en caso de error
            } finally {
                setLoadingDetail(false);
            }
        };

        fetchRoundDetail();
    }, [selectedHistoryRound, league.id, season.id, season.members, roundsData]); // Dependencias del detalle

    // Calcular ranking general de victorias
    const winnerCounts = useMemo(() => {
        const counts = {};
        historyWinners.forEach(item => {
            if (item.winnerUserId) { counts[item.winnerUsername] = (counts[item.winnerUsername] || 0) + 1; }
        });
        return Object.entries(counts).sort(([, countA], [, countB]) => countB - countA);
    }, [historyWinners]);

    return (
        <div className="space-y-6">
            {/* Ranking General (siempre visible) */}
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                    <Crown size={18} /> Ranking de Ganadores de Porras (General)
                </h3>
                {loadingGeneral ? <LoadingSpinner text="Cargando ranking..." /> : (
                    winnerCounts.length > 0 ? (
                        <ol className="list-decimal list-inside space-y-2">
                            {winnerCounts.map(([username, count], index) => (
                                <li key={username} className="text-gray-700 dark:text-gray-300">
                                    <span className={`font-bold ${index === 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{username}</span>: {count} {count === 1 ? 'victoria' : 'victorias'}
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400">Aún no hay ganadores registrados.</p>
                    )
                )}
            </div>

             {/* Selector y Tabla de Historial (General o Detallado) */}
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700">
                <div className="p-6 border-b dark:border-gray-700">
                     <label htmlFor="round-selector-history" className="flex items-center gap-2 text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
                        <CalendarCheck size={20} /> Viendo Historial de Jornada:
                    </label>
                    <select
                        id="round-selector-history"
                        value={selectedHistoryRound}
                        onChange={(e) => setSelectedHistoryRound(e.target.value)} // Guardar 'all' o el número
                        className="input w-full dark:bg-gray-700 dark:border-gray-600"
                        disabled={roundsForSelector.length <= 1} // Deshabilitar si solo está "Todas"
                    >
                        {roundsForSelector.map(r => (
                            <option key={r.roundNumber} value={r.roundNumber}>
                                {r.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Contenido condicional */}
                <div className="overflow-x-auto">
                    {selectedHistoryRound === 'all' ? (
                        // --- TABLA HISTORIAL GENERAL ---
                        loadingGeneral ? <LoadingSpinner text="Cargando historial..." /> : (
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-800/60">
                                    <tr>
                                        <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300">Jornada</th>
                                        <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300">Ganador</th>
                                        <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300">Aciertos</th>
                                        <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300">Mejor Acierto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y dark:divide-gray-700">
                                    {historyWinners.length > 0 ? (
                                        historyWinners.map(item => (
                                            <tr key={item.roundNumber} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                                <td className="p-3 font-semibold text-gray-800 dark:text-gray-200">{item.roundNumber}</td>
                                                <td className={`p-3 font-bold ${item.winnerUserId ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400 italic'}`}>{item.winnerUsername}</td>
                                                <td className="p-3 text-center font-mono">{item.score > 0 ? item.score : '-'}</td>
                                                <td className="p-3 text-center font-mono">{item.highestPositionMatched ? `${item.highestPositionMatched}º` : '-'}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan="4" className="p-8 text-center text-gray-500 dark:text-gray-400">No hay historial de porras disponible.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        )
                    ) : (
                        // --- TABLA DETALLE POR JORNADA ---
                        loadingDetail ? <LoadingSpinner text={`Cargando clasificación porra J${selectedHistoryRound}...`} /> : (
                             <table className="w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-800/60">
                                    <tr>
                                        <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300">Pos</th>
                                        <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300">Participante</th>
                                        <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300">Aciertos</th>
                                        <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300">Mejor Acierto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y dark:divide-gray-700">
                                    {roundDetailData.length > 0 ? (
                                         roundDetailData.map((item, index) => (
                                            <tr key={item.userId} className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${index === 0 && item.score >= 2 ? 'bg-emerald-50 dark:bg-emerald-900/30 font-bold' : ''}`}>
                                                <td className="p-3 text-center font-semibold">{index + 1}º</td>
                                                <td className="p-3">{item.username}</td>
                                                <td className="p-3 text-center font-mono">{item.score}</td>
                                                <td className="p-3 text-center font-mono">{item.highestPositionMatched ? `${item.highestPositionMatched}º` : '-'}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan="4" className="p-8 text-center text-gray-500 dark:text-gray-400">Nadie envió la porra para esta jornada o no hay resultados.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}