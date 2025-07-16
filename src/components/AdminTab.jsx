import React, { useState, useEffect } from 'react';
import { doc, updateDoc, deleteField, collection, query, onSnapshot, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import LoadingSpinner from './LoadingSpinner';
import { Calendar, List } from 'lucide-react';

export default function AdminTab({ league, season }) {
    const [viewMode, setViewMode] = useState('single');
    const [round, setRound] = useState(season?.currentRound || 1);
    const [totalRounds, setTotalRounds] = useState(season?.totalRounds || 38);
    const [scores, setScores] = useState({});
    const [loading, setLoading] = useState(false);
    const [members, setMembers] = useState(season?.members || {});
    const [newTeamName, setNewTeamName] = useState('');

    useEffect(() => {
        if (!season) return;
        const seasonRef = doc(db, 'leagues', league.id, 'seasons', season.id);
        const unsubscribe = onSnapshot(seasonRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setMembers(data.members || {});
                setTotalRounds(data.totalRounds || 38);
                setRound(data.currentRound || 1);
            }
        });
        return () => unsubscribe();
    }, [league.id, season.id]);
    
    useEffect(() => {
        if (!season) return;
        const roundsRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'rounds');
        const q = query(roundsRef);
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allScores = {};
            snapshot.forEach(doc => {
                allScores[doc.id] = doc.data().scores;
            });
            setScores(allScores);
        });
        return () => unsubscribe();
    }, [league.id, season.id]);

    const handleScoreChange = (roundNum, uid, value) => {
        const newScores = { ...scores };
        if (!newScores[roundNum]) {
            newScores[roundNum] = {};
        }
        newScores[roundNum][uid] = value; // Guardar el valor como string para permitir texto
        setScores(newScores);
    };

    const handleSaveScores = async () => {
        setLoading(true);
        const loadingToast = toast.loading('Guardando y recalculando...');
        try {
            const batch = writeBatch(db);
            const seasonRef = doc(db, 'leagues', league.id, 'seasons', season.id);
            const roundsRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'rounds');

            batch.update(seasonRef, { totalRounds });

            for (const roundNum in scores) {
                if (Number(roundNum) <= totalRounds) {
                    const roundRef = doc(roundsRef, String(roundNum));
                    const scoresForRound = {};
                    for (const uid in scores[roundNum]) {
                        const rawValue = scores[roundNum][uid];
                        if (rawValue === null || rawValue === undefined || rawValue === '') continue;

                        const upperCaseValue = String(rawValue).toUpperCase();
                        if (upperCaseValue === 'NO11' || upperCaseValue === 'NR') {
                            scoresForRound[uid] = upperCaseValue;
                        } else {
                            const numValue = Number(rawValue);
                            if (!isNaN(numValue)) {
                                scoresForRound[uid] = numValue;
                            }
                        }
                    }
                    batch.set(roundRef, { scores: scoresForRound, roundNumber: Number(roundNum) }, { merge: true });
                }
            }
            
            const existingRoundsSnap = await getDocs(roundsRef);
            existingRoundsSnap.forEach(doc => {
                if (Number(doc.id) > totalRounds) {
                    batch.delete(doc.ref);
                }
            });

            const updatedMembers = JSON.parse(JSON.stringify(members));
            for (const uid in updatedMembers) {
                updatedMembers[uid].totalPoints = 0;
            }

            for (const roundNum in scores) {
                if(Number(roundNum) <= totalRounds) { // Solo sumar puntos de jornadas válidas
                    for (const uid in scores[roundNum]) {
                        if (updatedMembers[uid] && typeof scores[roundNum][uid] === 'number') {
                            updatedMembers[uid].totalPoints += scores[roundNum][uid];
                        }
                    }
                }
            }
            batch.update(seasonRef, { members: updatedMembers });

            await batch.commit();
            toast.success('Datos guardados y totales recalculados.', { id: loadingToast });
        } catch (error) {
            console.error("Error al guardar los datos:", error);
            toast.error("Error al guardar los datos.", { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };

    const handleAddGhostTeam = async () => { /* ... */ };
    const handleSetRole = async (targetUid, newRole) => { /* ... */ };
    const handleKickUser = async (targetUid, teamName) => { /* ... */ };
    
    if (!season || !members) {
        return <LoadingSpinner text="Cargando datos de administrador..." />;
    }

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Gestión de Puntuaciones</h3>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setViewMode('single')} className={`p-2 rounded-md ${viewMode === 'single' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="Vista de Jornada Única"><List size={20} /></button>
                        <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="Vista de Calendario Completo"><Calendar size={20} /></button>
                    </div>
                </div>

                {viewMode === 'single' ? (
                    <div>
                        <div className="mb-6"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Seleccionar Jornada a Editar</label><input type="number" value={round} onChange={(e) => setRound(Number(e.target.value))} className="input dark:bg-gray-700 dark:border-gray-600 !w-32" min="1" /></div>
                        <div className="space-y-4">
                            <h4 className="font-semibold text-gray-800 dark:text-gray-200">Puntuaciones de la Jornada {round}</h4>
                            {Object.keys(members).map(uid => (
                                <div key={uid} className="flex items-center justify-between">
                                    <span className="text-gray-700 dark:text-gray-300">{members[uid].teamName}</span>
                                    <input 
                                        type="text" // CORRECCIÓN: Cambiado a 'text'
                                        placeholder="--"
                                        value={scores[round]?.[uid] ?? ''} 
                                        onChange={(e) => handleScoreChange(round, uid, e.target.value)} 
                                        className="input dark:bg-gray-700 dark:border-gray-600 !w-24 text-center"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nº Total de Jornadas en la Temporada</label><input type="number" value={totalRounds} onChange={(e) => setTotalRounds(Number(e.target.value))} className="input dark:bg-gray-700 dark:border-gray-600 !w-32" min="1" max="50"/></div>
                        <div className="overflow-x-auto border dark:border-gray-700 rounded-lg">
                            <table className="min-w-full text-sm text-center">
                                <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <th className="p-2 text-left sticky left-0 bg-gray-50 dark:bg-gray-800 font-semibold text-gray-600 dark:text-gray-300 z-10 w-48">Jugador</th>
                                        {Array.from({ length: totalRounds }, (_, i) => i + 1).map(r => (<th key={r} className="p-2 font-semibold text-gray-600 dark:text-gray-300 min-w-[5rem]">{r}</th>))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {Object.entries(members).map(([uid, member]) => (
                                        <tr key={uid} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="p-2 text-left sticky left-0 bg-white dark:bg-gray-700/80 backdrop-blur-sm font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap z-10">{member.teamName}</td>
                                            {Array.from({ length: totalRounds }, (_, i) => i + 1).map(r => (
                                                <td key={r} className="p-0">
                                                    <input
                                                        type="text" // CORRECCIÓN: Cambiado a 'text'
                                                        placeholder="-"
                                                        value={scores[r]?.[uid] ?? ''}
                                                        onChange={(e) => handleScoreChange(r, uid, e.target.value)}
                                                        className="w-full h-full p-1 text-center bg-transparent dark:text-white border-none focus:outline-none focus:bg-emerald-50 dark:focus:bg-emerald-900/50 rounded-sm"
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                <div className="mt-8 pt-4 border-t dark:border-gray-700 flex justify-end">
                    <button onClick={handleSaveScores} disabled={loading} className="btn-primary disabled:opacity-50">
                        {loading ? 'Guardando...' : 'Guardar y Recalcular Puntos'}
                    </button>
                </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Añadir Participantes (sin registro)</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Añade equipos a la temporada. Podrán reclamarlos al unirse con el código de invitación.</p>
                <div className="flex gap-4">
                    <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} className="input dark:bg-gray-700 dark:border-gray-600" placeholder="Nombre del nuevo equipo"/>
                    <button onClick={handleAddGhostTeam} disabled={loading} className="btn-primary whitespace-nowrap">{loading ? 'Añadiendo...' : 'Añadir Equipo'}</button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Gestión de Miembros</h3>
                <div className="space-y-3">{Object.entries(members).map(([uid, member]) => (<div key={uid} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"><div><p className="font-semibold text-gray-800 dark:text-gray-200">{member.teamName} {member.isPlaceholder && <span className="text-xs font-bold text-gray-500 dark:text-gray-400">(Sin reclamar)</span>}</p><p className={`text-sm font-bold ${member.role === 'admin' ? 'text-emerald-600' : 'text-gray-500 dark:text-gray-400'}`}>{uid === league.ownerId ? 'Propietario' : member.role === 'admin' ? 'Admin' : 'Miembro'}</p></div>
                    <div className="flex gap-2">
                        {uid !== league.ownerId && ( <>
                            {member.isPlaceholder ? ( <button onClick={() => handleKickUser(uid, member.teamName)} className="btn-action bg-red-500 hover:bg-red-600">Expulsar</button> ) : ( <>
                                {member.role === 'member' ? ( <button onClick={() => handleSetRole(uid, 'admin')} className="btn-action bg-blue-500 hover:bg-blue-600">Hacer Admin</button> ) : ( <button onClick={() => handleSetRole(uid, 'member')} className="btn-action bg-gray-500 hover:bg-gray-600">Quitar Admin</button> )}
                                <button onClick={() => handleKickUser(uid, member.teamName)} className="btn-action bg-red-500 hover:bg-red-600">Expulsar</button>
                            </> )}
                        </>)}
                    </div>
                </div>))}</div>
            </div>
        </div>
    );
}