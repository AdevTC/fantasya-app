// src/components/MyTeamTab.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '../config/firebase';
import { doc, updateDoc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Edit, X, Check, Eye, CheckCircle, AlertTriangle, Save, ArrowLeftRight, TrendingUp, TrendingDown, Minus, Calendar, Users, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import LineupDisplay from './LineupDisplay';
import EditSlotModal from './EditSlotModal';
import { formatCurrency } from '../utils/helpers';
import LoadingSpinner from './LoadingSpinner';

export default function MyTeamTab({ league, season, roundsData }) {
    const userId = auth.currentUser?.uid;
    const memberData = (season && season.members && season.members[userId]) ? season.members[userId] : null;
    const userRole = memberData?.role;

    const [isEditingFinances, setIsEditingFinances] = useState(false);
    const [finances, setFinances] = useState({});
    const [activeSubTab, setActiveSubTab] = useState('myTeam');
    const [viewedUserId, setViewedUserId] = useState(userId);
    const [selectedRound, setSelectedRound] = useState(season?.currentRound || 1);
    const [lineup, setLineup] = useState({ formation: '4-4-2', players: {}, coach: {}, bench: {}, captainSlot: null });
    const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
    const [editingSlot, setEditingSlot] = useState(null);
    const [loadingLineup, setLoadingLineup] = useState(true);

    const [isEditingTeamName, setIsEditingTeamName] = useState(false);
    const [teamName, setTeamName] = useState(memberData?.teamName || '');

    // --- NUEVO: Estado para editar el valor de equipo de otro usuario ---
    const [isEditingOtherTeamValue, setIsEditingOtherTeamValue] = useState(false);
    const [otherTeamValue, setOtherTeamValue] = useState(0);

    // --- NUEVO: Estado para Comparación de Alineaciones ---
    // --- NUEVO: Estado para Comparación de Alineaciones ---
    const [isComparing, setIsComparing] = useState(false);
    const [comparisonMode, setComparisonMode] = useState('previous'); // 'previous' | 'rival'
    const [comparisonRivalId, setComparisonRivalId] = useState(null);
    const [comparisonLineup, setComparisonLineup] = useState(null);
    const [loadingComparison, setLoadingComparison] = useState(false);
    const [compareRound, setCompareRound] = useState(null);

    const viewedMemberData = (season && season.members && season.members[viewedUserId]) ? season.members[viewedUserId] : null;

    const isEditableForLineup = activeSubTab === 'myTeam' || (activeSubTab === 'viewOther' && userRole === 'admin');

    const fetchLineup = useCallback(async (round, uId) => {
        if (!uId || !season) {
            setLoadingLineup(false);
            setLineup({ formation: '4-4-2', players: {}, coach: {}, bench: {}, captainSlot: null });
            return;
        }
        setLoadingLineup(true);
        const lineupRef = doc(db, 'leagues', league.id, 'seasons', season.id, 'lineups', `${round}-${uId}`);
        const docSnap = await getDoc(lineupRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            setLineup({ formation: data.formation || '4-4-2', players: data.players || {}, coach: data.coach || {}, bench: data.bench || {}, captainSlot: data.captainSlot || null });
        } else {
            setLineup({ formation: '4-4-2', players: {}, coach: {}, bench: {}, captainSlot: null });
        }
        setLoadingLineup(false);
    }, [league.id, season]);

    useEffect(() => {
        fetchLineup(selectedRound, viewedUserId);
        // --- NUEVO: Cargar el valor del equipo del usuario visto ---
        if (viewedMemberData) {
            setOtherTeamValue(viewedMemberData.finances?.teamValue || 0);
        }
    }, [viewedUserId, selectedRound, fetchLineup, viewedMemberData]);

    useEffect(() => {
        if (memberData) {
            setFinances({ budget: memberData.finances?.budget || 0, teamValue: memberData.finances?.teamValue || 0 });
            setTeamName(memberData.teamName || '');
        }
    }, [memberData]);

    const lastUpdated = memberData?.finances?.lastUpdated;

    const handleCancelFinances = () => {
        setIsEditingFinances(false);
        if (memberData) {
            setFinances({ budget: memberData.finances?.budget || 0, teamValue: memberData.finances?.teamValue || 0 });
        }
    };

    const handleSaveFinances = async () => {
        const loadingToast = toast.loading('Guardando...');
        const seasonRef = doc(db, 'leagues', league.id, 'seasons', season.id);
        const budgetToSave = parseFloat(String(finances.budget).replace(',', '.')) || 0;
        const teamValueToSave = parseFloat(String(finances.teamValue).replace(',', '.')) || 0;
        try {
            await updateDoc(seasonRef, { [`members.${userId}.finances`]: { budget: budgetToSave, teamValue: teamValueToSave, lastUpdated: serverTimestamp() } });
            toast.success('Finanzas actualizadas', { id: loadingToast });
            setIsEditingFinances(false);
        } catch (error) {
            toast.error('No se pudo guardar.', { id: loadingToast });
        }
    };

    // --- NUEVO: Función para que el admin guarde el valor de equipo de otro ---
    const handleSaveOtherTeamValue = async () => {
        const loadingToast = toast.loading('Guardando valor de equipo...');
        const seasonRef = doc(db, 'leagues', league.id, 'seasons', season.id);
        const teamValueToSave = parseFloat(String(otherTeamValue).replace(',', '.')) || 0;

        // Mantener el presupuesto existente sin tocarlo
        const existingBudget = viewedMemberData.finances?.budget || 0;

        try {
            await updateDoc(seasonRef, { [`members.${viewedUserId}.finances`]: { budget: existingBudget, teamValue: teamValueToSave, lastUpdated: serverTimestamp() } });
            toast.success('Valor de equipo actualizado', { id: loadingToast });
            setIsEditingOtherTeamValue(false);
        } catch (error) {
            toast.error('No se pudo guardar el valor.', { id: loadingToast });
        }
    };

    const handleSaveTeamName = async () => {
        if (!teamName.trim() || teamName.length > 24) { toast.error("El nombre del equipo no es válido (máx. 24 caracteres)."); return; }
        const loadingToast = toast.loading('Actualizando nombre...');
        const seasonRef = doc(db, 'leagues', league.id, 'seasons', season.id);
        try {
            await updateDoc(seasonRef, { [`members.${userId}.teamName`]: teamName.trim() });
            toast.success('Nombre del equipo actualizado', { id: loadingToast });
            setIsEditingTeamName(false);
        } catch (error) {
            toast.error('No se pudo guardar el nombre.', { id: loadingToast });
        }
    };

    const handleSlotClick = (slotId) => { if (isEditableForLineup) { setEditingSlot(slotId); setIsSlotModalOpen(true); } };
    const validateAndSaveLineup = useCallback(async (currentLineup) => { const lineupRef = doc(db, 'leagues', league.id, 'seasons', season.id, 'lineups', `${selectedRound}-${viewedUserId}`); await setDoc(lineupRef, currentLineup, { merge: true }); toast.success(`Alineación de ${season.members[viewedUserId]?.teamName} guardada.`); }, [league.id, season, selectedRound, viewedUserId]);
    const handleSaveSlot = useCallback(async (playerData) => { const updatedLineup = JSON.parse(JSON.stringify(lineup)); const slotType = editingSlot.split('-')[0]; const slotKey = editingSlot.split('-')[1]; if (playerData === null) { if (slotType === 'players') delete updatedLineup.players[editingSlot]; else if (slotType === 'bench') delete updatedLineup.bench[slotKey]; else if (slotType === 'coach') updatedLineup.coach = {}; } else { if (slotType === 'players') updatedLineup.players[editingSlot] = playerData; else if (slotType === 'bench') updatedLineup.bench[slotKey] = playerData; else if (slotType === 'coach') updatedLineup.coach = playerData; } setLineup(updatedLineup); await validateAndSaveLineup(updatedLineup); }, [lineup, editingSlot, validateAndSaveLineup]);
    const handleSetCaptain = useCallback(async (slotId) => { if (!isEditableForLineup) return; const newCaptainSlot = lineup.captainSlot === slotId ? null : slotId; const updatedLineup = { ...lineup, captainSlot: newCaptainSlot }; setLineup(updatedLineup); await validateAndSaveLineup(updatedLineup); }, [isEditableForLineup, lineup, validateAndSaveLineup]);
    const handleToggleActive = useCallback(async (slotId) => { if (!isEditableForLineup) return; const [slotType, slotKey] = slotId.split('-'); const updatedLineup = JSON.parse(JSON.stringify(lineup)); let playerToUpdate; if (slotType === 'bench') { playerToUpdate = updatedLineup.bench[slotKey]; } if (!playerToUpdate || !playerToUpdate.playerId) { toast.error("Primero debes añadir un jugador a esta posición."); return; } playerToUpdate.active = !playerToUpdate.active; setLineup(updatedLineup); await validateAndSaveLineup(updatedLineup); }, [isEditableForLineup, lineup, validateAndSaveLineup]);
    const lineupPoints = useMemo(() => { const officialRoundData = roundsData.find(r => r.roundNumber === selectedRound); const officialScore = officialRoundData?.scores?.[viewedUserId]; let startersScore = 0, benchScore = 0; const inactivePositions = { DF: 0, MF: 0, FW: 0, GK: 0 }; Object.entries(lineup.players || {}).forEach(([slotId, player]) => { if (player.status === 'playing') { let points = player.points || 0; if (slotId === lineup.captainSlot) { points *= 2; } startersScore += points; } else if (player.status === 'did_not_play' || player.status === 'not_called_up') { const positionType = slotId.split('-')[1]; if (inactivePositions[positionType] !== undefined) { inactivePositions[positionType]++; } } }); const benchOrder = ['GK', 'DF', 'MF', 'FW']; benchOrder.forEach(pos => { const player = lineup.bench?.[pos]; if (player?.active && player.status === 'playing' && inactivePositions[pos] > 0) { let points = player.points || 0; if (`bench-${pos}` === lineup.captainSlot) { points *= 2; } benchScore += points; inactivePositions[pos]--; } }); const coach = lineup.coach; const coachScore = (coach?.status === 'playing') ? (coach.points || 0) * (lineup.captainSlot === 'coach-COACH' ? 2 : 1) : 0; const totalScore = startersScore + benchScore + coachScore; return { startersScore, benchScore, coachScore, totalScore, officialScore }; }, [lineup, roundsData, selectedRound, viewedUserId]);

    // --- Lógica de Puntos para la Alineación de Comparación ---
    const comparisonPoints = useMemo(() => {
        if (!comparisonLineup) return null;

        // Calcular puntos (lógica simplificada basada en la actual)
        // Nota: Idealmente esta lógica se extraería a una función utilitaria para reutilizar
        let totalScore = 0;

        // Sumar titulares
        Object.entries(comparisonLineup.players || {}).forEach(([slotId, player]) => {
            if (player.status === 'playing') {
                let points = player.points || 0;
                if (slotId === comparisonLineup.captainSlot) points *= 2;
                totalScore += points;
            }
        });

        // Sumar banquillo (simplificado para visualización rápida)
        // En una implementación real completa, replicaríamos toda la lógica de suplencias
        const benchOrder = ['GK', 'DF', 'MF', 'FW'];
        benchOrder.forEach(pos => {
            const player = comparisonLineup.bench?.[pos];
            if (player?.active && player.status === 'playing') {
                // Lógica simple de banquillo
                // totalScore += player.points || 0; 
            }
        });

        // Sumar entrenador
        if (comparisonLineup.coach?.status === 'playing') {
            totalScore += (comparisonLineup.coach.points || 0) * (comparisonLineup.captainSlot === 'coach-COACH' ? 2 : 1);
        }

        // Intentar obtener puntuación oficial si existe para esa jornada pasada
        const officialRoundData = roundsData.find(r => r.roundNumber === compareRound);
        const officialScore = officialRoundData?.scores?.[viewedUserId];

        return { totalScore: officialScore ?? totalScore, officialScore };
    }, [comparisonLineup, roundsData, compareRound, viewedUserId]);


    // --- Handlers de Comparación ---
    // --- Handlers de Comparación ---
    const handleCloseComparison = () => {
        setIsComparing(false);
        setComparisonLineup(null);
        setCompareRound(null);
        setComparisonMode('previous');
        setComparisonRivalId(null);
    };

    const loadComparisonLineup = async (mode, round, rivalId) => {
        setLoadingComparison(true);
        if (round) setCompareRound(round);
        if (rivalId) setComparisonRivalId(rivalId);

        // Target depends on mode. 
        // If 'round' or 'best'/'worst' (which use mode='round'), we target the currently viewed user (viewedUserId).
        // If 'rival', we target the rivalId.
        const targetUserId = mode === 'rival' ? rivalId : viewedUserId;

        if (!targetUserId) {
            setLoadingComparison(false);
            return;
        }

        try {
            const lineupRef = doc(db, 'leagues', league.id, 'seasons', season.id, 'lineups', `${round}-${targetUserId}`);
            const docSnap = await getDoc(lineupRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setComparisonLineup({
                    formation: data.formation || '4-4-2',
                    players: data.players || {},
                    coach: data.coach || {},
                    bench: data.bench || {},
                    captainSlot: data.captainSlot || null
                });
            } else {
                setComparisonLineup({ formation: '4-4-2', players: {}, coach: {}, bench: {}, captainSlot: null });
                if (mode === 'rival') toast('El rival no tiene alineación guardada para esta jornada.', { icon: 'ℹ️' });
                else toast(`La alineación de la jornada ${round} estaba vacía.`, { icon: 'ℹ️' });
            }
        } catch (error) {
            console.error("Error fetching comparison lineup:", error);
            toast.error("Error al cargar la alineación de comparación.");
        } finally {
            setLoadingComparison(false);
        }
    };

    const handleOpenComparison = async (type) => {
        setIsComparing(true);
        setComparisonLineup(null);

        if (type === 'round') {
            setComparisonMode('round');
            const targetRound = selectedRound > 1 ? selectedRound - 1 : 1;
            await loadComparisonLineup('round', targetRound, null);
        } else if (type === 'rival') {
            setComparisonMode('rival');
            setCompareRound(selectedRound);
            setComparisonRivalId(null); // Reset rival so user has to select
        } else if (type === 'best') {
            setComparisonMode('round');
            // Find best round
            let bestR = 1;
            let maxScore = -1;
            if (roundsData) {
                roundsData.forEach(r => {
                    const s = r.scores?.[viewedUserId] || 0;
                    if (s > maxScore) {
                        maxScore = s;
                        bestR = r.roundNumber;
                    }
                });
            }
            await loadComparisonLineup('round', bestR, null);
            toast.success(`Cillgada tu mejor jornada: J${bestR} (${maxScore} pts)`);
        } else if (type === 'worst') {
            setComparisonMode('round');
            // Find worst round
            let worstR = 1;
            let minScore = 9999;
            let found = false;
            if (roundsData) {
                roundsData.forEach(r => {
                    if (r.scores && r.scores[viewedUserId] !== undefined) {
                        const s = r.scores[viewedUserId];
                        if (s < minScore) {
                            minScore = s;
                            worstR = r.roundNumber;
                            found = true;
                        }
                    }
                });
            }
            if (!found) worstR = selectedRound > 1 ? selectedRound - 1 : 1;
            await loadComparisonLineup('round', worstR, null);
            toast.success(`Cillgada tu peor jornada: J${worstR} (${found ? minScore : 0} pts)`);
        }
    };

    const handleRivalChange = async (e) => {
        const rivalId = e.target.value;
        setComparisonRivalId(rivalId);
        if (!rivalId) return;
        await loadComparisonLineup('rival', selectedRound, rivalId);
    };

    const handleCompareRoundChange = async (e) => {
        const r = parseInt(e.target.value);
        setCompareRound(r);
        await loadComparisonLineup('round', r, null);
    }

    const handleComparisonModeChange = async (e) => {
        const mode = e.target.value;
        if (mode === 'round') {
            handleOpenComparison('round');
        } else {
            handleOpenComparison('rival');
        }
    };

    const handleSubTabChange = (tab) => { setActiveSubTab(tab); if (tab === 'myTeam') { setViewedUserId(userId); } else { const firstOtherUser = Object.keys(season.members).find(uid => uid !== userId); setViewedUserId(firstOtherUser || null); } };

    if (!memberData && activeSubTab === 'myTeam') {
        return <div className="text-center p-8 bg-white rounded-xl border">No eres miembro de esta temporada, por lo que no tienes una pestaña de "Mi Equipo".</div>;
    }

    const isScoreValidated = lineupPoints && lineupPoints.officialScore !== undefined && Math.abs(lineupPoints.totalScore - lineupPoints.officialScore) < 0.01;
    const budgetNum = parseFloat(String(finances.budget).replace(',', '.')) || 0;
    const teamValueNum = parseFloat(String(finances.teamValue).replace(',', '.')) || 0;

    const otherTeamBudgetNum = parseFloat(String(viewedMemberData?.finances?.budget || 0).replace(',', '.')) || 0;
    const otherTeamValueNumToDisplay = parseFloat(String(isEditingOtherTeamValue ? otherTeamValue : viewedMemberData?.finances?.teamValue || 0).replace(',', '.')) || 0;

    // Helper para diferencia de puntos
    const getPointDiff = () => {
        if (!comparisonPoints || !lineupPoints) return 0;
        const current = lineupPoints.officialScore ?? lineupPoints.totalScore;
        const prev = comparisonPoints.totalScore;
        return current - prev;
    };
    const pointDiff = getPointDiff();

    return (
        <div className="space-y-6">
            <EditSlotModal isOpen={isSlotModalOpen} onClose={() => setIsSlotModalOpen(false)} onSave={handleSaveSlot} initialData={editingSlot?.startsWith('coach') ? lineup.coach : editingSlot?.startsWith('bench') ? lineup.bench?.[editingSlot.split('-')[1]] : lineup.players?.[editingSlot]} />
            <div className="flex border-b"><button onClick={() => handleSubTabChange('myTeam')} className={`px-4 py-2 font-semibold ${activeSubTab === 'myTeam' ? 'border-b-2 border-emerald-500 text-emerald-500' : 'text-gray-500'}`}>Mi Equipo y Finanzas</button><button onClick={() => handleSubTabChange('viewOther')} className={`px-4 py-2 font-semibold ${activeSubTab === 'viewOther' ? 'border-b-2 border-emerald-500 text-emerald-500' : 'text-gray-500'}`}>Ver Otro Equipo</button></div>

            {activeSubTab === 'myTeam' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border p-6">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800">Mis Finanzas (Bloc de Notas)</h3>
                                {!isEditingTeamName ? (<div className="flex items-center gap-2"> <p className="text-2xl font-bold text-deep-blue">{teamName}</p> <button onClick={() => setIsEditingTeamName(true)} className="text-gray-500 hover:text-blue-600"><Edit size={16} /></button> </div>) : (<div className="flex items-center gap-2 mt-2"> <input type="text" value={teamName} onChange={e => setTeamName(e.target.value)} className="input !w-auto !py-1" /> <button onClick={() => setIsEditingTeamName(false)} className="text-gray-500 hover:text-red-600"><X size={20} /></button> <button onClick={handleSaveTeamName} className="text-gray-500 hover:text-emerald-600"><Save size={20} /></button> </div>)}
                                {lastUpdated && lastUpdated.toDate && <p className="text-xs text-gray-500 mt-1">Última actualización: {formatDistanceToNow(lastUpdated.toDate(), { addSuffix: true, locale: es })}</p>}
                            </div>
                            {!isEditingFinances && <button onClick={() => setIsEditingFinances(true)} className="btn-secondary flex items-center gap-2"><Edit size={16} /> Editar Finanzas</button>}
                        </div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Presupuesto</label>{isEditingFinances ? <input type="text" value={finances.budget} onChange={e => setFinances({ ...finances, budget: e.target.value })} className="input" placeholder="Ej: 50000000,50" /> : <p className="text-2xl font-bold text-emerald-600">{formatCurrency(finances.budget)}</p>}</div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Valor de Equipo</label>{isEditingFinances ? <input type="text" value={finances.teamValue} onChange={e => setFinances({ ...finances, teamValue: e.target.value })} className="input" placeholder="Ej: 250000000" /> : <p className="text-2xl font-bold text-vibrant-purple">{formatCurrency(finances.teamValue)}</p>}</div>
                            <div className="md:col-span-2 lg:col-span-1"><label className="block text-sm font-medium text-gray-700 mb-1">Patrimonio Total</label><p className="text-2xl font-bold text-deep-blue">{formatCurrency(budgetNum + teamValueNum)}</p></div>
                        </div>
                        {isEditingFinances && (<div className="flex justify-end gap-4 mt-6"><button onClick={handleCancelFinances} className="btn-secondary flex items-center gap-2"><X size={18} /> Cancelar</button><button onClick={handleSaveFinances} className="btn-primary flex items-center gap-2"><Check size={18} /> Guardar Cambios</button></div>)}
                    </div>

                    <div className={`p-4 rounded-lg border ${isScoreValidated ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        {isScoreValidated && lineupPoints.officialScore !== undefined ? (<div className="flex items-center gap-3"><CheckCircle size={24} className="text-emerald-600" /><div><p className="font-semibold text-emerald-800">Puntos validados</p><p className="text-2xl font-bold text-emerald-700">{lineupPoints.totalScore} pts</p></div></div>) : (<div className="space-y-2 text-sm"> <div className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle size={20} /> <p>La puntuación no coincide</p></div> <div className="flex justify-between pl-1"><span>Puntos Titulares (Cap. x2):</span><span className="font-bold">{lineupPoints.startersScore}</span></div> <div className="flex justify-between pl-1"><span>Puntos Banquillo (Activos):</span><span className="font-bold">{lineupPoints.benchScore}</span></div> <div className="flex justify-between pl-1"><span>Puntos Entrenador:</span><span className="font-bold">{lineupPoints.coachScore}</span></div> <div className="flex justify-between font-bold border-t pt-2 mt-2"><span>TOTAL ALINEACIÓN:</span><span>{lineupPoints.totalScore}</span></div> <div className="flex justify-between font-bold text-red-700"><span>TOTAL OFICIAL (Admin):</span><span>{lineupPoints.officialScore ?? 'N/A'}</span></div> </div>)}
                    </div>

                    <div className="flex justify-end">
                        <div className="flex flex-wrap gap-2 justify-end">
                            <button onClick={() => handleOpenComparison('round')} className="btn-secondary text-xs py-1 px-3 flex items-center gap-1" title="Comparar con cualquier jornada">
                                <Calendar size={14} /> Jornada
                            </button>
                            <button onClick={() => handleOpenComparison('rival')} className="btn-secondary text-xs py-1 px-3 flex items-center gap-1" title="Comparar con rival en esta jornada">
                                <Users size={14} /> Rival
                            </button>
                            <button onClick={() => handleOpenComparison('best')} className="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors" title="Ver tu mejor jornada">
                                <Trophy size={14} /> Mejor J.
                            </button>
                            <button onClick={() => handleOpenComparison('worst')} className="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors" title="Ver tu peor jornada">
                                <TrendingDown size={14} /> Peor J.
                            </button>
                        </div>
                    </div>

                    <LineupDisplay lineupData={lineup} setLineupData={setLineup} roundsData={roundsData} selectedRound={selectedRound} onRoundChange={setSelectedRound} onSlotClick={handleSlotClick} isEditable={true} onSetCaptain={handleSetCaptain} captainSlot={lineup.captainSlot} onToggleActive={handleToggleActive} totalRounds={season?.totalRounds || 38} />

                    {/* --- VISUALIZACIÓN DE COMPARACIÓN --- */}
                    {isComparing && (
                        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                            <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-7xl h-[90vh] overflow-y-auto flex flex-col">
                                {/* Header del Modal */}
                                <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 sticky top-0 z-10 flex-wrap gap-4">
                                    <div className="flex items-center gap-4">
                                        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                            <ArrowLeftRight className="text-emerald-500" />
                                            Comparar:
                                        </h3>
                                        <select
                                            value={comparisonMode}
                                            onChange={handleComparisonModeChange}
                                            className="input !w-auto !py-1"
                                        >
                                            <option value="round">Otra Jornada</option>
                                            <option value="rival">Rival (Misma Jornada)</option>
                                        </select>

                                        {comparisonMode === 'round' && (
                                            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded px-2">
                                                <span className="text-sm font-medium">Jornada:</span>
                                                <select
                                                    value={compareRound || ''}
                                                    onChange={handleCompareRoundChange}
                                                    className="bg-transparent border-none text-sm focus:ring-0 cursor-pointer"
                                                >
                                                    {Array.from({ length: season?.totalRounds || 38 }, (_, i) => i + 1).map(r => (
                                                        <option key={r} value={r}>J{r}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {comparisonMode === 'rival' && (
                                            <select
                                                value={comparisonRivalId || ''}
                                                onChange={handleRivalChange}
                                                className="input !w-auto !py-1"
                                            >
                                                <option value="">Selecciona un rival...</option>
                                                {Object.entries(season.members).map(([uid, member]) => {
                                                    if (uid === viewedUserId) return null; // Don't show self
                                                    return <option key={uid} value={uid}>{member.teamName}</option>
                                                })}
                                            </select>
                                        )}
                                    </div>

                                    <button onClick={handleCloseComparison} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                                        <X size={24} className="text-gray-600 dark:text-gray-300" />
                                    </button>
                                </div>

                                {/* Contenido de Comparación */}
                                <div className="flex-grow p-4 grid lg:grid-cols-2 gap-4">
                                    {/* IZQUIERDA: Jornada Anterior */}
                                    <div className="border-r dark:border-gray-700 pr-4 flex flex-col gap-4">
                                        <div className="flex justify-between items-center bg-gray-100 dark:bg-gray-700/50 p-3 rounded-lg">
                                            <span className="font-semibold text-gray-600 dark:text-gray-300">Jornada {compareRound} (Anterior)</span>
                                            <span className="text-xl font-bold text-gray-800 dark:text-gray-200">
                                                {comparisonPoints?.totalScore || 0} pts
                                            </span>
                                        </div>
                                        {loadingComparison ? (
                                            <LoadingSpinner text="Cargando jornada anterior..." />
                                        ) : (
                                            <div className="opacity-80 pointer-events-none scale-[0.9] origin-top">
                                                <LineupDisplay
                                                    lineupData={comparisonLineup}
                                                    setLineupData={() => { }}
                                                    roundsData={roundsData}
                                                    selectedRound={compareRound}
                                                    onRoundChange={() => { }}
                                                    onSlotClick={() => { }}
                                                    isEditable={false}
                                                    totalRounds={season?.totalRounds || 38}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* DERECHA: Jornada Actual */}
                                    <div className="pl-4 flex flex-col gap-4">
                                        <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800">
                                            <span className="font-semibold text-emerald-800 dark:text-emerald-300">Jornada {selectedRound} (Actual)</span>
                                            <div className="flex items-center gap-3">
                                                <span className={`flex items-center text-sm font-bold ${pointDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {pointDiff > 0 ? <TrendingUp size={16} className="mr-1" /> : pointDiff < 0 ? <TrendingDown size={16} className="mr-1" /> : <Minus size={16} className="mr-1" />}
                                                    {pointDiff > 0 ? '+' : ''}{pointDiff} pts
                                                </span>
                                                <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                                                    {lineupPoints.officialScore ?? lineupPoints.totalScore} pts
                                                </span>
                                            </div>
                                        </div>
                                        <div className="scale-[0.9] origin-top">
                                            <LineupDisplay
                                                lineupData={lineup}
                                                setLineupData={setLineup}
                                                roundsData={roundsData}
                                                selectedRound={selectedRound}
                                                onRoundChange={setSelectedRound}
                                                onSlotClick={handleSlotClick}
                                                isEditable={isEditableForLineup}
                                                onSetCaptain={handleSetCaptain}
                                                captainSlot={lineup.captainSlot}
                                                onToggleActive={handleToggleActive}
                                                totalRounds={season?.totalRounds || 38}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* --- FIN VISUALIZACIÓN DE COMPARACIÓN --- */}
                </div>
            )}

            {activeSubTab === 'viewOther' && (
                <div className="space-y-6">
                    {/* --- SECCIÓN DE FINANZAS DE OTRO USUARIO MODIFICADA --- */}
                    {viewedMemberData && userRole === 'admin' && (
                        <div className="bg-white rounded-xl shadow-sm border p-6">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-800">Finanzas de: <span className="text-deep-blue">{viewedMemberData.teamName}</span></h3>
                                    <p className="text-xs text-gray-500 mt-1">Como administrador, solo puedes editar el valor del equipo.</p>
                                </div>
                                {!isEditingOtherTeamValue && <button onClick={() => setIsEditingOtherTeamValue(true)} className="btn-secondary flex items-center gap-2"><Edit size={16} /> Editar Valor</button>}
                            </div>
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">Presupuesto</label><p className="text-2xl font-bold text-emerald-600 blur-sm select-none">12.345.678 €</p></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">Valor de Equipo</label>{isEditingOtherTeamValue ? <input type="text" value={otherTeamValue} onChange={e => setOtherTeamValue(e.target.value)} className="input" placeholder="Ej: 250000000" /> : <p className="text-2xl font-bold text-vibrant-purple">{formatCurrency(viewedMemberData.finances?.teamValue || 0)}</p>}</div>
                                <div className="md:col-span-2 lg:col-span-1"><label className="block text-sm font-medium text-gray-700 mb-1">Patrimonio Total</label><p className="text-2xl font-bold text-deep-blue blur-sm select-none">123.456.789 €</p></div>
                            </div>
                            {isEditingOtherTeamValue && (<div className="flex justify-end gap-4 mt-6"><button onClick={() => { setIsEditingOtherTeamValue(false); setOtherTeamValue(viewedMemberData.finances?.teamValue || 0); }} className="btn-secondary flex items-center gap-2"><X size={18} /> Cancelar</button><button onClick={handleSaveOtherTeamValue} className="btn-primary flex items-center gap-2"><Check size={18} /> Guardar Valor</button></div>)}
                        </div>
                    )}
                    {/* --- FIN DE LA SECCIÓN MODIFICADA --- */}

                    <div className="bg-white rounded-xl shadow-sm border p-6">
                        <div className="flex items-center gap-4 mb-6"><Eye size={20} className="text-gray-600" /><label className="text-lg font-semibold text-gray-800">Viendo el equipo de:</label><select value={viewedUserId || ''} onChange={e => setViewedUserId(e.target.value)} className="input !w-auto !py-1">{Object.entries(season.members).map(([uid, member]) => { if (uid === userId) return null; return <option key={uid} value={uid}>{member.teamName}</option> })}</select></div>
                        {loadingLineup ? <LoadingSpinner text="Cargando alineación..." /> : !viewedUserId ? <p className="text-center text-gray-500">No hay otros equipos en la liga para ver.</p> :
                            <div className="space-y-6">
                                <div className={`p-4 rounded-lg border ${isScoreValidated ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                                    {(isScoreValidated && lineupPoints.officialScore !== undefined) ? (<div className="flex items-center gap-3"><CheckCircle size={24} className="text-emerald-600" /><div><p className="font-semibold text-emerald-800">Puntos validados de {season.members[viewedUserId]?.teamName}</p><p className="text-2xl font-bold text-emerald-700">{lineupPoints.totalScore} pts</p></div></div>) : (<div className="space-y-2 text-sm"><div className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle size={20} /> <p>La puntuación de {season.members[viewedUserId]?.teamName} no coincide</p></div><div className="flex justify-between font-bold border-t pt-2 mt-2"><span>TOTAL ALINEACIÓN:</span><span>{lineupPoints.totalScore}</span></div><div className="flex justify-between font-bold text-red-700"><span>TOTAL OFICIAL (Admin):</span><span>{lineupPoints.officialScore ?? 'N/A'}</span></div></div>)}
                                </div>

                                {/* Botón de Comparar */}
                                <div className="flex justify-end">
                                    <div className="flex flex-wrap gap-2 justify-end">
                                        <button onClick={() => handleOpenComparison('round')} className="btn-secondary text-xs py-1 px-3 flex items-center gap-1" title="Comparar con cualquier jornada">
                                            <Calendar size={14} /> Jornada
                                        </button>
                                        <button onClick={() => handleOpenComparison('rival')} className="btn-secondary text-xs py-1 px-3 flex items-center gap-1" title="Comparar con rival en esta jornada">
                                            <Users size={14} /> Rival
                                        </button>
                                        <button onClick={() => handleOpenComparison('best')} className="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors" title="Ver tu mejor jornada">
                                            <Trophy size={14} /> Mejor J.
                                        </button>
                                        <button onClick={() => handleOpenComparison('worst')} className="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors" title="Ver tu peor jornada">
                                            <TrendingDown size={14} /> Peor J.
                                        </button>
                                    </div>
                                </div>
                                <LineupDisplay
                                    lineupData={lineup}
                                    setLineupData={setLineup}
                                    roundsData={roundsData}
                                    selectedRound={selectedRound}
                                    onRoundChange={setSelectedRound}
                                    onSlotClick={handleSlotClick}
                                    isEditable={isEditableForLineup}
                                    onSetCaptain={handleSetCaptain}
                                    captainSlot={lineup.captainSlot}
                                    onToggleActive={handleToggleActive}
                                    totalRounds={season?.totalRounds || 38}
                                />

                                {/* --- VISUALIZACIÓN DE COMPARACIÓN --- */}
                                {isComparing && (
                                    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                                        <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-7xl h-[90vh] overflow-y-auto flex flex-col">
                                            {/* Header del Modal */}
                                            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 sticky top-0 z-10 flex-wrap gap-4">
                                                <div className="flex items-center gap-4">
                                                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                                        <ArrowLeftRight className="text-emerald-500" />
                                                        Comparar:
                                                    </h3>
                                                    <select
                                                        value={comparisonMode}
                                                        onChange={handleComparisonModeChange}
                                                        className="input !w-auto !py-1"
                                                    >
                                                        <option value="round">Otra Jornada</option>
                                                        <option value="rival">Rival (Misma Jornada)</option>
                                                    </select>

                                                    {comparisonMode === 'round' && (
                                                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded px-2">
                                                            <span className="text-sm font-medium">Jornada:</span>
                                                            <select
                                                                value={compareRound || ''}
                                                                onChange={handleCompareRoundChange}
                                                                className="bg-transparent border-none text-sm focus:ring-0 cursor-pointer"
                                                            >
                                                                {Array.from({ length: season?.totalRounds || 38 }, (_, i) => i + 1).map(r => (
                                                                    <option key={r} value={r}>J{r}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}

                                                    {comparisonMode === 'rival' && (
                                                        <select
                                                            value={comparisonRivalId || ''}
                                                            onChange={handleRivalChange}
                                                            className="input !w-auto !py-1"
                                                        >
                                                            <option value="">Selecciona un rival...</option>
                                                            {Object.entries(season.members).map(([uid, member]) => {
                                                                if (uid === viewedUserId) return null; // Don't show self
                                                                return <option key={uid} value={uid}>{member.teamName}</option>
                                                            })}
                                                        </select>
                                                    )}
                                                </div>

                                                <button onClick={handleCloseComparison} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                                                    <X size={24} className="text-gray-600 dark:text-gray-300" />
                                                </button>
                                            </div>

                                            {/* Contenido de Comparación */}
                                            <div className="flex-grow p-4 grid lg:grid-cols-2 gap-4">
                                                {/* IZQUIERDA: Comparación (Anterior o Rival) */}
                                                <div className="border-r dark:border-gray-700 pr-4 flex flex-col gap-4">
                                                    <div className="flex justify-between items-center bg-gray-100 dark:bg-gray-700/50 p-3 rounded-lg">
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-gray-600 dark:text-gray-300">
                                                                {comparisonMode === 'round' ? `Jornada ${compareRound}` : `Rival: ${season.members[comparisonRivalId]?.teamName || '...'}`}
                                                            </span>
                                                            <span className="text-xs text-gray-400">
                                                                {comparisonMode === 'round' ? 'Alineación histórica' : `Su equipo en J${selectedRound}`}
                                                            </span>
                                                        </div>
                                                        <span className="text-xl font-bold text-gray-800 dark:text-gray-200">
                                                            {comparisonPoints?.totalScore || 0} pts
                                                        </span>
                                                    </div>
                                                    {loadingComparison ? (
                                                        <LoadingSpinner text="Cargando datos..." />
                                                    ) : !comparisonLineup ? (
                                                        <div className="h-full flex items-center justify-center text-gray-400 italic">
                                                            {comparisonMode === 'rival' && !comparisonRivalId ? 'Selecciona un rival arriba' : 'No hay datos'}
                                                        </div>
                                                    ) : (
                                                        <div className="opacity-80 pointer-events-none scale-[0.9] origin-top">
                                                            <LineupDisplay
                                                                lineupData={comparisonLineup}
                                                                setLineupData={() => { }}
                                                                roundsData={roundsData}
                                                                selectedRound={compareRound}
                                                                onRoundChange={() => { }}
                                                                onSlotClick={() => { }}
                                                                isEditable={false}
                                                                totalRounds={season?.totalRounds || 38}
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* DERECHA: Jornada Actual (Mi Equipo) */}
                                                <div className="pl-4 flex flex-col gap-4">
                                                    <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800">
                                                        <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                                                            {comparisonMode === 'round' ? `Jornada ${selectedRound} (Actual)` : `Tu Equipo (Jornada ${selectedRound})`}
                                                        </span>
                                                        <div className="flex items-center gap-3">
                                                            <span className={`flex items-center text-sm font-bold ${pointDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                {pointDiff > 0 ? <TrendingUp size={16} className="mr-1" /> : pointDiff < 0 ? <TrendingDown size={16} className="mr-1" /> : <Minus size={16} className="mr-1" />}
                                                                {pointDiff > 0 ? '+' : ''}{pointDiff} pts
                                                            </span>
                                                            <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                                                                {lineupPoints.officialScore ?? lineupPoints.totalScore} pts
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="scale-[0.9] origin-top">
                                                        <LineupDisplay
                                                            lineupData={lineup}
                                                            setLineupData={setLineup}
                                                            roundsData={roundsData}
                                                            selectedRound={selectedRound}
                                                            onRoundChange={setSelectedRound}
                                                            onSlotClick={handleSlotClick}
                                                            isEditable={isEditableForLineup}
                                                            onSetCaptain={handleSetCaptain}
                                                            captainSlot={lineup.captainSlot}
                                                            onToggleActive={handleToggleActive}
                                                            totalRounds={season?.totalRounds || 38}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {/* --- FIN VISUALIZACIÓN DE COMPARACIÓN --- */}
                            </div>
                        }
                    </div>
                </div>
            )}
        </div>
    );
}