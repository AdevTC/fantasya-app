import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '../config/firebase';
import { doc, updateDoc, setDoc, getDoc, serverTimestamp, collection, query, getDocs } from 'firebase/firestore';
import { Edit, X, Check, Eye, CheckCircle, AlertTriangle, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import LineupDisplay from './LineupDisplay';
import EditSlotModal from './EditSlotModal';
import { formatCurrency } from '../utils/helpers';
import LoadingSpinner from './LoadingSpinner';

export default function MyTeamTab({ league, roundsData }) {
    const userId = auth.currentUser?.uid;
    const userRole = league.members[userId]?.role;
    const memberData = league.members[userId];
    const [isEditingFinances, setIsEditingFinances] = useState(false);
    const [finances, setFinances] = useState({});
    const [activeSubTab, setActiveSubTab] = useState('myTeam');
    const [viewedUserId, setViewedUserId] = useState(userId);
    const [selectedRound, setSelectedRound] = useState(roundsData.length > 0 ? roundsData[roundsData.length - 1].roundNumber : 1);
    const [lineup, setLineup] = useState({ formation: '4-4-2', players: {}, coach: {}, bench: {}, captainSlot: null });
    const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
    const [editingSlot, setEditingSlot] = useState(null);
    const [loadingLineup, setLoadingLineup] = useState(true);
    
    const [isEditingTeamName, setIsEditingTeamName] = useState(false);
    const [teamName, setTeamName] = useState(memberData?.teamName || '');

    const isEditable = activeSubTab === 'myTeam' || (activeSubTab === 'viewOther' && userRole === 'admin');

    const fetchLineup = useCallback(async (round, uId) => {
        if (!uId) {
            setLoadingLineup(false);
            setLineup({ formation: '4-4-2', players: {}, coach: {}, bench: {}, captainSlot: null });
            return;
        }
        setLoadingLineup(true);
        const lineupRef = doc(db, 'leagues', league.id, 'lineups', `${round}-${uId}`);
        const docSnap = await getDoc(lineupRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            setLineup({ formation: data.formation || '4-4-2', players: data.players || {}, coach: data.coach || {}, bench: data.bench || {}, captainSlot: data.captainSlot || null });
        } else {
            setLineup({ formation: '4-4-2', players: {}, coach: {}, bench: {}, captainSlot: null });
        }
        setLoadingLineup(false);
    }, [league.id]);

    useEffect(() => {
        fetchLineup(selectedRound, viewedUserId);
    }, [viewedUserId, selectedRound, fetchLineup]);

    useEffect(() => { 
        setFinances({ budget: memberData?.finances?.budget || 0, teamValue: memberData?.finances?.teamValue || 0 }); 
        setTeamName(memberData?.teamName || '');
    }, [memberData]);
    
    const lastUpdated = memberData?.finances?.lastUpdated;

    const handleCancelFinances = () => {
        setIsEditingFinances(false);
        setFinances({ budget: memberData?.finances?.budget || 0, teamValue: memberData?.finances?.teamValue || 0 });
    };
    
    const handleSaveFinances = async () => {
        const loadingToast = toast.loading('Guardando...');
        const leagueRef = doc(db, 'leagues', league.id);
        const budgetToSave = parseFloat(String(finances.budget).replace(',', '.')) || 0;
        const teamValueToSave = parseFloat(String(finances.teamValue).replace(',', '.')) || 0;
        try {
            await updateDoc(leagueRef, { [`members.${userId}.finances`]: { budget: budgetToSave, teamValue: teamValueToSave, lastUpdated: serverTimestamp() } });
            toast.success('Finanzas actualizadas', { id: loadingToast });
            setIsEditingFinances(false);
        } catch (error) {
            toast.error('No se pudo guardar.', { id: loadingToast });
        }
    };
    
    const handleSaveTeamName = async () => {
        if (!teamName.trim() || teamName.length > 24) {
            toast.error("El nombre del equipo no es válido (máx. 24 caracteres).");
            return;
        }
        const loadingToast = toast.loading('Actualizando nombre...');
        const leagueRef = doc(db, 'leagues', league.id);
        try {
            await updateDoc(leagueRef, { [`members.${userId}.teamName`]: teamName.trim() });
            toast.success('Nombre del equipo actualizado', { id: loadingToast });
            setIsEditingTeamName(false);
        } catch (error) {
            toast.error('No se pudo guardar el nombre.', { id: loadingToast });
        }
    };

    const handleSlotClick = (slotId) => { if (isEditable) { setEditingSlot(slotId); setIsSlotModalOpen(true); } };
    const validateAndSaveLineup = useCallback(async (currentLineup) => { const lineupRef = doc(db, 'leagues', league.id, 'lineups', `${selectedRound}-${viewedUserId}`); await setDoc(lineupRef, currentLineup, { merge: true }); toast.success(`Alineación de ${league.members[viewedUserId]?.teamName} guardada.`); }, [league.id, selectedRound, viewedUserId, league.members]);
    const handleSaveSlot = useCallback(async (playerData) => { const updatedLineup = JSON.parse(JSON.stringify(lineup)); const slotType = editingSlot.split('-')[0]; const slotKey = editingSlot.split('-')[1]; if (playerData === null) { if (slotType === 'players') delete updatedLineup.players[editingSlot]; else if (slotType === 'bench') delete updatedLineup.bench[slotKey]; else if (slotType === 'coach') updatedLineup.coach = {}; } else { if (slotType === 'players') updatedLineup.players[editingSlot] = playerData; else if (slotType === 'bench') updatedLineup.bench[slotKey] = playerData; else if (slotType === 'coach') updatedLineup.coach = playerData; } setLineup(updatedLineup); await validateAndSaveLineup(updatedLineup); }, [lineup, editingSlot, validateAndSaveLineup]);
    const handleSetCaptain = useCallback(async (slotId) => { if (!isEditable) return; const newCaptainSlot = lineup.captainSlot === slotId ? null : slotId; const updatedLineup = { ...lineup, captainSlot: newCaptainSlot }; setLineup(updatedLineup); await validateAndSaveLineup(updatedLineup); }, [isEditable, lineup, validateAndSaveLineup]);
    const handleToggleActive = useCallback(async (slotId) => { if (!isEditable) return; const [slotType, slotKey] = slotId.split('-'); const updatedLineup = JSON.parse(JSON.stringify(lineup)); let playerToUpdate; if (slotType === 'bench') { playerToUpdate = updatedLineup.bench[slotKey]; } if (!playerToUpdate || !playerToUpdate.playerId) { toast.error("Primero debes añadir un jugador a esta posición."); return; } playerToUpdate.active = !playerToUpdate.active; setLineup(updatedLineup); await validateAndSaveLineup(updatedLineup); }, [isEditable, lineup, validateAndSaveLineup]);
    const lineupPoints = useMemo(() => { const officialRoundData = roundsData.find(r => r.roundNumber === selectedRound); const officialScore = officialRoundData?.scores?.[viewedUserId]; let startersScore = 0, benchScore = 0; const inactivePositions = { DF: 0, MF: 0, FW: 0, GK: 0 }; Object.entries(lineup.players || {}).forEach(([slotId, player]) => { if (player.status === 'playing') { let points = player.points || 0; if (slotId === lineup.captainSlot) { points *= 2; } startersScore += points; } else if (player.status === 'did_not_play' || player.status === 'not_called_up') { const positionType = slotId.split('-')[1]; if(inactivePositions[positionType] !== undefined) { inactivePositions[positionType]++; } } }); const benchOrder = ['GK', 'DF', 'MF', 'FW']; benchOrder.forEach(pos => { const player = lineup.bench?.[pos]; if (player?.active && player.status === 'playing' && inactivePositions[pos] > 0) { let points = player.points || 0; if (`bench-${pos}` === lineup.captainSlot) { points *= 2; } benchScore += points; inactivePositions[pos]--; } }); const coach = lineup.coach; const coachScore = (coach?.status === 'playing') ? (coach.points || 0) * (lineup.captainSlot === 'coach-COACH' ? 2 : 1) : 0; const totalScore = startersScore + benchScore + coachScore; return { startersScore, benchScore, coachScore, totalScore, officialScore }; }, [lineup, roundsData, selectedRound, viewedUserId]);
    
    const handleSubTabChange = (tab) => {
        setActiveSubTab(tab);
        if (tab === 'myTeam') {
            setViewedUserId(userId);
        } else {
            const firstOtherUser = Object.keys(league.members).find(uid => uid !== userId);
            setViewedUserId(firstOtherUser || null);
        }
    };
    
    const isScoreValidated = lineupPoints && lineupPoints.officialScore !== undefined && Math.abs(lineupPoints.totalScore - lineupPoints.officialScore) < 0.01;
    const budgetNum = parseFloat(String(finances.budget).replace(',', '.')) || 0;
    const teamValueNum = parseFloat(String(finances.teamValue).replace(',', '.')) || 0;

    return (
        <div className="space-y-6">
            <EditSlotModal isOpen={isSlotModalOpen} onClose={() => setIsSlotModalOpen(false)} onSave={handleSaveSlot} initialData={ editingSlot?.startsWith('coach') ? lineup.coach : editingSlot?.startsWith('bench') ? lineup.bench?.[editingSlot.split('-')[1]] : lineup.players?.[editingSlot] } />
            <div className="flex border-b"><button onClick={() => handleSubTabChange('myTeam')} className={`px-4 py-2 font-semibold ${activeSubTab === 'myTeam' ? 'border-b-2 border-emerald-500 text-emerald-500' : 'text-gray-500'}`}>Mi Equipo y Finanzas</button><button onClick={() => handleSubTabChange('viewOther')} className={`px-4 py-2 font-semibold ${activeSubTab === 'viewOther' ? 'border-b-2 border-emerald-500 text-emerald-500' : 'text-gray-500'}`}>Ver Otro Equipo</button></div>
            
            {activeSubTab === 'myTeam' && (
                 <div className="space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border p-6">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800">Mis Finanzas (Bloc de Notas)</h3>
                                {!isEditingTeamName ? (
                                    <div className="flex items-center gap-2">
                                        <p className="text-2xl font-bold text-deep-blue">{teamName}</p>
                                        <button onClick={() => setIsEditingTeamName(true)} className="text-gray-500 hover:text-blue-600"><Edit size={16}/></button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 mt-2">
                                        <input type="text" value={teamName} onChange={e => setTeamName(e.target.value)} className="input !w-auto !py-1"/>
                                        <button onClick={() => setIsEditingTeamName(false)} className="text-gray-500 hover:text-red-600"><X size={20}/></button>
                                        <button onClick={handleSaveTeamName} className="text-gray-500 hover:text-emerald-600"><Save size={20}/></button>
                                    </div>
                                )}
                                {lastUpdated && lastUpdated.toDate && <p className="text-xs text-gray-500 mt-1">Última actualización: {formatDistanceToNow(lastUpdated.toDate(), { addSuffix: true, locale: es })}</p>}
                            </div>
                            {!isEditingFinances && <button onClick={() => setIsEditingFinances(true)} className="btn-secondary flex items-center gap-2"><Edit size={16}/> Editar Finanzas</button>}
                        </div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                           <div><label className="block text-sm font-medium text-gray-700 mb-1">Presupuesto</label>{isEditingFinances ? <input type="text" value={finances.budget} onChange={e => setFinances({...finances, budget: e.target.value})} className="input" placeholder="Ej: 50000000,50"/> : <p className="text-2xl font-bold text-emerald-600">{formatCurrency(finances.budget)}</p>}</div>
                           <div><label className="block text-sm font-medium text-gray-700 mb-1">Valor de Equipo</label>{isEditingFinances ? <input type="text" value={finances.teamValue} onChange={e => setFinances({...finances, teamValue: e.target.value})} className="input" placeholder="Ej: 250000000"/> : <p className="text-2xl font-bold text-vibrant-purple">{formatCurrency(finances.teamValue)}</p>}</div>
                           <div className="md:col-span-2 lg:col-span-1"><label className="block text-sm font-medium text-gray-700 mb-1">Patrimonio Total</label><p className="text-2xl font-bold text-deep-blue">{formatCurrency(budgetNum + teamValueNum)}</p></div>
                        </div>
                        {isEditingFinances && (<div className="flex justify-end gap-4 mt-6"><button onClick={handleCancelFinances} className="btn-secondary flex items-center gap-2"><X size={18}/> Cancelar</button><button onClick={handleSaveFinances} className="btn-primary flex items-center gap-2"><Check size={18}/> Guardar Cambios</button></div>)}
                    </div>
                    
                    <div className={`p-4 rounded-lg border ${isScoreValidated ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        {isScoreValidated && lineupPoints.officialScore !== undefined ? ( <div className="flex items-center gap-3"><CheckCircle size={24} className="text-emerald-600"/><div><p className="font-semibold text-emerald-800">Puntos validados</p><p className="text-2xl font-bold text-emerald-700">{lineupPoints.totalScore} pts</p></div></div> ) : ( <div className="space-y-2 text-sm"> <div className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle size={20}/> <p>La puntuación no coincide</p></div> <div className="flex justify-between pl-1"><span>Puntos Titulares (Cap. x2):</span><span className="font-bold">{lineupPoints.startersScore}</span></div> <div className="flex justify-between pl-1"><span>Puntos Banquillo (Activos):</span><span className="font-bold">{lineupPoints.benchScore}</span></div> <div className="flex justify-between pl-1"><span>Puntos Entrenador:</span><span className="font-bold">{lineupPoints.coachScore}</span></div> <div className="flex justify-between font-bold border-t pt-2 mt-2"><span>TOTAL ALINEACIÓN:</span><span>{lineupPoints.totalScore}</span></div> <div className="flex justify-between font-bold text-red-700"><span>TOTAL OFICIAL (Admin):</span><span>{lineupPoints.officialScore ?? 'N/A'}</span></div> </div> )}
                    </div>
                    
                    <LineupDisplay lineupData={lineup} setLineupData={setLineup} roundsData={roundsData} selectedRound={selectedRound} onRoundChange={setSelectedRound} onSlotClick={handleSlotClick} isEditable={true} onSetCaptain={handleSetCaptain} captainSlot={lineup.captainSlot} onToggleActive={handleToggleActive} />
                </div>
            )}

            {activeSubTab === 'viewOther' && (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <div className="flex items-center gap-4 mb-6"><Eye size={20} className="text-gray-600"/><label className="text-lg font-semibold text-gray-800">Viendo el equipo de:</label><select value={viewedUserId || ''} onChange={e => setViewedUserId(e.target.value)} className="input !w-auto !py-1">{Object.entries(league.members).map(([uid, member]) => { if (uid === userId) return null; return <option key={uid} value={uid}>{member.teamName}</option>})}</select></div>
                     {loadingLineup ? <LoadingSpinner text="Cargando alineación..." /> : !viewedUserId ? <p className="text-center text-gray-500">No hay otros equipos en la liga para ver.</p> :
                        <div className="space-y-6">
                            <div className={`p-4 rounded-lg border ${isScoreValidated ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                                {(isScoreValidated && lineupPoints.officialScore !== undefined) ? (<div className="flex items-center gap-3"><CheckCircle size={24} className="text-emerald-600"/><div><p className="font-semibold text-emerald-800">Puntos validados de {league.members[viewedUserId]?.teamName}</p><p className="text-2xl font-bold text-emerald-700">{lineupPoints.totalScore} pts</p></div></div>) : (<div className="space-y-2 text-sm"><div className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle size={20}/> <p>La puntuación de {league.members[viewedUserId]?.teamName} no coincide</p></div><div className="flex justify-between font-bold border-t pt-2 mt-2"><span>TOTAL ALINEACIÓN:</span><span>{lineupPoints.totalScore}</span></div><div className="flex justify-between font-bold text-red-700"><span>TOTAL OFICIAL (Admin):</span><span>{lineupPoints.officialScore ?? 'N/A'}</span></div></div>)}
                            </div>
                            <LineupDisplay lineupData={lineup} setLineupData={setLineup} roundsData={roundsData} selectedRound={selectedRound} onRoundChange={setSelectedRound} onSlotClick={handleSlotClick} isEditable={isEditable} onSetCaptain={handleSetCaptain} captainSlot={lineup.captainSlot} onToggleActive={handleToggleActive} />
                        </div>
                     }
                </div>
            )}
        </div>
    );
}
