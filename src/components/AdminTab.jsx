import React, { useState, useEffect } from 'react';
import { doc, runTransaction, updateDoc, deleteField } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

export default function AdminTab({ league }) {
    const [round, setRound] = useState(league.currentRound || 1);
    const [scores, setScores] = useState({});
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const initialScores = {};
        Object.keys(league.members).forEach(uid => {
            initialScores[uid] = '';
        });
        setScores(initialScores);
    }, [league.members, round]);

    const handleScoreChange = (uid, value) => {
        setScores(prevScores => ({ ...prevScores, [uid]: value === '' ? '' : Number(value) }));
    };

    const handleSaveScores = async () => {
        setLoading(true);
        setMessage('');
        try {
            const leagueRef = doc(db, 'leagues', league.id);
            const roundRef = doc(db, 'leagues', league.id, 'rounds', String(round));
            await runTransaction(db, async (transaction) => {
                const leagueDoc = await transaction.get(leagueRef);
                const roundDoc = await transaction.get(roundRef);
                if (!leagueDoc.exists()) throw "¡La liga no existe!";
                const currentLeagueData = leagueDoc.data();
                const oldScores = roundDoc.exists() ? roundDoc.data().scores : {};
                const updatedMembers = { ...currentLeagueData.members };
                for (const uid in updatedMembers) {
                    const oldScore = oldScores[uid] || 0;
                    const newScore = scores[uid] === '' ? 0 : (scores[uid] || 0);
                    const difference = newScore - oldScore;
                    if (difference !== 0) {
                        updatedMembers[uid].totalPoints = (updatedMembers[uid].totalPoints || 0) + difference;
                    }
                }
                const newScoresToSave = {};
                for (const uid in scores) {
                    if (scores[uid] !== '') newScoresToSave[uid] = scores[uid];
                }
                transaction.set(roundRef, { scores: newScoresToSave, roundNumber: round }, { merge: true });
                transaction.update(leagueRef, { members: updatedMembers, currentRound: Math.max(currentLeagueData.currentRound || 0, round) });
            });
            setMessage(`Puntuaciones de la jornada ${round} guardadas y totales recalculados.`);
        } catch (error) {
            console.error("Error al guardar las puntuaciones:", error);
            setMessage("Error: No se pudieron guardar las puntuaciones.");
        } finally {
            setLoading(false);
        }
    };
    
    // --- NUEVAS FUNCIONES PARA GESTIONAR MIEMBROS ---
    const handleSetRole = async (targetUid, newRole) => {
        if (targetUid === league.ownerId) {
            alert("No se puede cambiar el rol del propietario de la liga.");
            return;
        }
        const leagueRef = doc(db, 'leagues', league.id);
        await updateDoc(leagueRef, {
            [`members.${targetUid}.role`]: newRole
        });
    };

    const handleKickUser = async (targetUid) => {
        if (targetUid === league.ownerId) {
            alert("No se puede expulsar al propietario de la liga.");
            return;
        }
        if (window.confirm(`¿Estás seguro de que quieres expulsar a ${league.members[targetUid].teamName}? Esta acción es irreversible.`)) {
            const leagueRef = doc(db, 'leagues', league.id);
            await updateDoc(leagueRef, {
                [`members.${targetUid}`]: deleteField()
            });
        }
    };


    return (
        <div className="space-y-6">
            {/* Sección de Gestión de Jornadas (sin cambios) */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Gestión de Jornadas</h3>
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Seleccionar Jornada a Editar</label>
                    <input type="number" value={round} onChange={(e) => setRound(Number(e.target.value))} className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald" min="1" />
                </div>
                <div className="space-y-4">
                    <h4 className="font-semibold text-gray-800">Puntuaciones de la Jornada {round}</h4>
                    {Object.keys(league.members).map(uid => (
                        <div key={uid} className="flex items-center justify-between">
                            <span className="text-gray-700">{league.members[uid].teamName}</span>
                            <input type="number" placeholder="0" value={scores[uid] ?? ''} onChange={(e) => handleScoreChange(uid, e.target.value)} className="w-24 text-center px-2 py-1 border border-gray-300 rounded-md" />
                        </div>
                    ))}
                </div>
                <div className="mt-8">
                    <button onClick={handleSaveScores} disabled={loading} className="btn-primary disabled:opacity-50">
                        {loading ? 'Guardando...' : 'Guardar Puntos'}
                    </button>
                    {message && <p className={`mt-4 text-sm ${message.startsWith('Error') ? 'text-red-500' : 'text-gray-600'}`}>{message}</p>}
                </div>
            </div>

            {/* --- NUEVA SECCIÓN DE GESTIÓN DE MIEMBROS --- */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Gestión de Miembros</h3>
                <div className="space-y-3">
                    {Object.entries(league.members).map(([uid, member]) => (
                        <div key={uid} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p className="font-semibold text-gray-800">{member.teamName}</p>
                                <p className={`text-sm font-bold ${member.role === 'admin' ? 'text-emerald-600' : 'text-gray-500'}`}>
                                    {uid === league.ownerId ? 'Propietario' : member.role === 'admin' ? 'Admin' : 'Miembro'}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                {uid !== league.ownerId && (
                                    <>
                                        {member.role === 'member' ? (
                                            <button onClick={() => handleSetRole(uid, 'admin')} className="btn-action bg-blue-500 hover:bg-blue-600">Hacer Admin</button>
                                        ) : (
                                            <button onClick={() => handleSetRole(uid, 'member')} className="btn-action bg-gray-500 hover:bg-gray-600">Quitar Admin</button>
                                        )}
                                        <button onClick={() => handleKickUser(uid)} className="btn-action bg-red-500 hover:bg-red-600">Expulsar</button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}