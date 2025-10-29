import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../config/firebase';
import { collection, query, onSnapshot, orderBy, doc } from 'firebase/firestore';
import LoadingSpinner from './LoadingSpinner';
import { Eye, CalendarCheck, Clock, CheckCircle } from 'lucide-react'; // CheckCircle ya estaba
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function PorraSubmissionsTab({ league, season, roundsData }) {
    const [selectedRoundNumber, setSelectedRoundNumber] = useState(null);
    const [submissions, setSubmissions] = useState({});
    const [loading, setLoading] = useState(true);
    const [porraStatus, setPorraStatus] = useState({ isOpen: false, deadline: null });
    const [actualRankingMap, setActualRankingMap] = useState(null); 

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
            setLoading(false); // Movido aquí para asegurar que los submissions se cargan
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
    const membersCount = Object.keys(season.members).length;

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
                   
                    {/* --- INICIO DE LA MODIFICACIÓN: Mostrar registro ANTES del plazo --- */}
                    {porraStatus.isOpen && !isDeadlinePassed && porraStatus.deadline && (
                        <div className="mb-6 bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border dark:border-blue-700">
                            <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-3 flex items-center gap-2">
                                <CheckCircle size={16} /> Registro de Envíos ({Object.keys(submissions).length} / {membersCount})
                            </h4>
                            {loading ? (
                                <LoadingSpinner text="Cargando envíos..." />
                            ) : Object.keys(submissions).length > 0 ? (
                                <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                    {Object.entries(submissions)
                                        // Ordenamos por nombre para esta vista
                                        .sort(([, a], [, b]) => (a.username || season.members[a.id]?.teamName || '').localeCompare(b.username || season.members[b.id]?.teamName || ''))
                                        .map(([uid, sub]) => {
                                            const displayName = sub.username || season.members[uid]?.teamName || 'Usuario Desconocido';
                                            return (
                                                <li key={uid} className="flex justify-between items-center text-sm p-2 bg-white dark:bg-gray-700/50 rounded shadow-sm">
                                                    <span className="font-medium text-gray-800 dark:text-gray-200">{displayName}</span>
                                                    {sub.submittedAt ? (
                                                        <span className="text-gray-500 dark:text-gray-400 text-xs">
                                                            {format(sub.submittedAt.toDate(), 'dd/MM HH:mm:ss', { locale: es })}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-500 dark:text-gray-400 text-xs">Sin fecha</span>
                                                    )}
                                                </li>
                                            );
                                        })}
                                </ul>
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">Aún nadie ha enviado la porra.</p>
                            )}
                            <p className="mt-3 text-xs text-center text-blue-600 dark:text-blue-400">
                                Las predicciones completas se mostrarán al cerrar el plazo el {format(porraStatus.deadline.toDate(), 'dd/MM \'a las\' HH:mm', { locale: es })}.
                            </p>
                        </div>
                    )}
                    {/* --- FIN DE LA MODIFICACIÓN --- */}
                    
                    {!porraStatus.deadline && (
                         <p className="mb-4 text-center text-gray-500 dark:text-gray-400">La porra para esta jornada no ha sido abierta.</p>
                    )}

                    {/* Mostrar la lista detallada si el plazo ha pasado O si la porra se cerró manualmente */}
                    {(isDeadlinePassed || (!porraStatus.isOpen && porraStatus.deadline)) && (
                        <>
                            <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">Predicciones Finales</h4>
                            {Object.keys(submissions).length > 0 ? (
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
                            ) : (
                                <p className="text-gray-500 dark:text-gray-400 text-center py-4">Nadie envió la porra para esta jornada.</p>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}