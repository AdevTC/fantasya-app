import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../config/firebase';
import { collection, query, onSnapshot, orderBy, doc } from 'firebase/firestore';
import LoadingSpinner from './LoadingSpinner';
import { Eye, CalendarCheck, Clock, CheckCircle } from 'lucide-react'; // Añadir CheckCircle
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function PorraSubmissionsTab({ league, season, roundsData }) {
    const [selectedRoundNumber, setSelectedRoundNumber] = useState(null);
    const [submissions, setSubmissions] = useState({});
    const [loading, setLoading] = useState(true);
    const [porraStatus, setPorraStatus] = useState({ isOpen: false, deadline: null });
    // --- NUEVO ESTADO: Para guardar el ranking real ---
    const [actualRankingMap, setActualRankingMap] = useState(null); // { uid: position }

    const allRoundsForSelector = useMemo(() => {
        const total = season.totalRounds || 0;
        if (total === 0) return roundsData.map(r => ({ roundNumber: r.roundNumber, name: r.name || '' }));
        const baseRounds = Array.from({ length: total }, (_, i) => ({ roundNumber: i + 1, name: '' }));
        const existingRoundsMap = new Map(roundsData.map(r => [r.roundNumber, r]));
        return baseRounds.map(baseRound => ({
            roundNumber: baseRound.roundNumber,
            name: existingRoundsMap.get(baseRound.roundNumber)?.name || ''
        }));
    }, [season.totalRounds, roundsData]);

    useEffect(() => {
        if (allRoundsForSelector.length > 0) {
            const defaultRound = season.currentRound || allRoundsForSelector[0].roundNumber;
            setSelectedRoundNumber(defaultRound);
        } else {
            setSelectedRoundNumber(null);
        }
    }, [allRoundsForSelector, season.currentRound]);

    const porraRef = useMemo(() => {
        if (!selectedRoundNumber) return null;
        return doc(db, 'leagues', league.id, 'seasons', season.id, 'porra', `round_${selectedRoundNumber}`);
    }, [league.id, season.id, selectedRoundNumber]);

    const allPredictionsRef = useMemo(() => {
        if (!porraRef) return null;
        return collection(porraRef, 'predictions');
    }, [porraRef]);

    // Cargar estado, predicciones y CALCULAR RANKING REAL
    useEffect(() => {
        if (!selectedRoundNumber || !porraRef || !allPredictionsRef) {
            setLoading(false);
            setSubmissions({});
            setPorraStatus({ isOpen: false, deadline: null });
            setActualRankingMap(null); // Resetear ranking
            return;
        }

        setLoading(true);
        setSubmissions({});
        setPorraStatus({ isOpen: false, deadline: null });
        setActualRankingMap(null); // Resetear ranking

        const unsubPorra = onSnapshot(porraRef, (docSnap) => {
             if (docSnap.exists()) setPorraStatus({ isOpen: docSnap.data().isOpen, deadline: docSnap.data().deadline });
             else setPorraStatus({ isOpen: false, deadline: null });
        }, (error) => { console.error("Error al leer estado de porra:", error); });

        const unsubSubmissions = onSnapshot(query(allPredictionsRef, orderBy("submittedAt", "asc")), (snap) => {
            const preds = {};
            snap.forEach(doc => { preds[doc.id] = doc.data(); });
            setSubmissions(preds);
            setLoading(false);
        }, (error) => { console.error("Error al cargar todas las predicciones:", error); setLoading(false); });

        // --- NUEVO: Calcular ranking real ---
        const roundData = roundsData.find(r => r.roundNumber === selectedRoundNumber);
        const roundScores = roundData?.scores;
        if (roundScores && Object.keys(roundScores).length > 0) {
            const sortedResults = Object.entries(roundScores)
                .filter(([uid, score]) => typeof score === 'number' && season.members[uid])
                .map(([uid, score]) => ({ uid, score }))
                .sort((a, b) => b.score - a.score);

            const rankingMap = {};
            let currentRank = 0;
            let lastScore = -Infinity;
            sortedResults.forEach((player, index) => {
                if (player.score !== lastScore) {
                    currentRank = index + 1;
                    lastScore = player.score;
                }
                rankingMap[player.uid] = currentRank;
            });
            setActualRankingMap(rankingMap);
        } else {
            setActualRankingMap(null); // No hay resultados aún
        }
        // --- FIN NUEVO ---

        return () => {
            unsubPorra();
            unsubSubmissions();
        };
    }, [selectedRoundNumber, porraRef, allPredictionsRef, roundsData, season.members]); // Añadir roundsData y season.members

    const isDeadlinePassed = porraStatus.deadline && new Date() > porraStatus.deadline.toDate();

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-4">
                <label htmlFor="round-selector-submissions" className="flex items-center gap-2 text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    <CalendarCheck size={20} /> Viendo Porras Enviadas de la Jornada:
                </label>
                <select
                    id="round-selector-submissions"
                    value={selectedRoundNumber || ''}
                    onChange={(e) => setSelectedRoundNumber(Number(e.target.value))}
                    className="input w-full dark:bg-gray-700 dark:border-gray-600"
                    disabled={allRoundsForSelector.length === 0}
                >
                    {allRoundsForSelector.map(r => (
                        <option key={r.roundNumber} value={r.roundNumber}>
                            Jornada {r.roundNumber} {r.name ? `(${r.name})` : ''}
                        </option>
                    ))}
                </select>
            </div>

            {loading ? (
                <LoadingSpinner text={`Cargando porras enviadas J${selectedRoundNumber}...`} />
            ) : (
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                        <Eye size={20} /> Porras Enviadas - Jornada {selectedRoundNumber}
                    </h3>

                    {!porraStatus.isOpen && !isDeadlinePassed && porraStatus.deadline && (
                         <p className="mb-4 text-center text-red-600 dark:text-red-400">La porra está cerrada.</p>
                    )}
                    {porraStatus.isOpen && !isDeadlinePassed && porraStatus.deadline && (
                        <p className="mb-4 text-center text-orange-600 dark:text-orange-400 flex items-center justify-center gap-2">
                            <Clock size={16} /> Aún no ha finalizado el plazo. Las porras se mostrarán después de las {format(porraStatus.deadline.toDate(), 'HH:mm \'del\' dd/MM', { locale: es })}.
                        </p>
                    )}
                     {!porraStatus.deadline && (
                         <p className="mb-4 text-center text-gray-500 dark:text-gray-400">La porra para esta jornada no ha sido abierta.</p>
                    )}

                    {/* Mostrar la lista si el plazo ha pasado O si la porra se cerró manualmente */}
                    {(isDeadlinePassed || (!porraStatus.isOpen && porraStatus.deadline)) && Object.keys(submissions).length > 0 && (
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                            {Object.entries(submissions)
                                .sort(([, predA], [, predB]) => (predA.username || season.members[predA.id]?.teamName || '').localeCompare(predB.username || season.members[predB.id]?.teamName || '')) // Ordenar por nombre
                                .map(([uid, prediction]) => {
                                    // --- CORRECCIÓN NOMBRE FANTASMA ---
                                    const displayName = prediction.username || season.members[uid]?.teamName || 'Usuario Desconocido';
                                    return (
                                        <div key={uid} className="p-3 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/40">
                                            <p className="font-semibold text-deep-blue dark:text-blue-300 mb-2">{displayName}</p>
                                            <ol className="list-decimal list-inside text-sm space-y-1 pl-2">
                                                {(prediction.ranking || []).map((teamUid, index) => {
                                                    const predictedPosition = index + 1;
                                                    const actualPosition = actualRankingMap ? actualRankingMap[teamUid] : null;
                                                    const isCorrect = actualRankingMap && actualPosition === predictedPosition;

                                                    return (
                                                        <li key={`${uid}-${index}`} className={`text-gray-700 dark:text-gray-300 ${isCorrect ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>
                                                            {isCorrect && <CheckCircle size={14} className="inline mr-1 mb-px" />}
                                                            <span className="font-medium">{season.members[teamUid]?.teamName || 'Equipo Desconocido'}</span>
                                                            {season.members[teamUid]?.isPlaceholder && <span className="text-xs text-red-500 dark:text-red-400"> (F)</span>}
                                                            {/* Opcional: Mostrar posición real si falló */}
                                                            {actualRankingMap && !isCorrect && actualPosition && (
                                                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">({actualPosition}º)</span>
                                                            )}
                                                            {actualRankingMap && !actualPosition && (
                                                                 <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(Sin pos.)</span>
                                                            )}
                                                        </li>
                                                    );
                                                })}
                                            </ol>
                                             {prediction.submittedAt && (
                                                 <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-right">
                                                     Enviado: {format(prediction.submittedAt.toDate(), 'dd/MM HH:mm:ss', { locale: es })}
                                                 </p>
                                             )}
                                        </div>
                                    );
                                })}
                        </div>
                    )}

                    {(isDeadlinePassed || (!porraStatus.isOpen && porraStatus.deadline)) && Object.keys(submissions).length === 0 && (
                         <p className="text-gray-500 dark:text-gray-400 text-center py-4">Nadie envió la porra para esta jornada.</p>
                    )}
                </div>
            )}
        </div>
    );
}