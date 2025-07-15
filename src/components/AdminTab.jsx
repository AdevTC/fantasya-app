import React, { useState, useEffect } from 'react';
import { doc, runTransaction, updateDoc, deleteField, getDoc, collection, query, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

export default function AdminTab({ league }) {
    const [round, setRound] = useState(league.currentRound || 1);
    const [scores, setScores] = useState({});
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [newTeamName, setNewTeamName] = useState('');

    useEffect(() => {
        const initialScores = {};
        Object.keys(league.members).forEach(uid => {
            initialScores[uid] = '';
        });
        
        const roundDataRef = doc(db, 'leagues', league.id, 'rounds', String(round));
        getDoc(roundDataRef).then(docSnap => {
            if (docSnap.exists()) {
                const roundScores = docSnap.data().scores;
                setScores(prevScores => ({...prevScores, ...roundScores}));
            } else {
                 setScores(initialScores);
            }
        });

    }, [league.members, round, league.id]);

    const handleScoreChange = (uid, value) => {
        setScores(prevScores => ({ ...prevScores, [uid]: value === '' ? '' : Number(value) }));
    };

    const handleSaveScores = async () => {
        setLoading(true);
        setMessage('');
        try {
            const leagueRef = doc(db, 'leagues', league.id);
            const roundRef = doc(db, 'leagues', league.id, 'rounds', String(round));
            
            const allRoundsQuery = query(collection(db, 'leagues', league.id, 'rounds'));
            const allRoundsSnap = await getDocs(allRoundsQuery);

            await runTransaction(db, async (transaction) => {
                const leagueDoc = await transaction.get(leagueRef);
                if (!leagueDoc.exists()) throw "¡La liga no existe!";
                
                const currentMembers = leagueDoc.data().members;
                const updatedMembers = JSON.parse(JSON.stringify(currentMembers));

                for (const uid in updatedMembers) {
                    updatedMembers[uid].totalPoints = 0;
                }

                allRoundsSnap.forEach(roundDoc => {
                    const roundNum = roundDoc.id;
                    const roundScores = roundDoc.data().scores;
                    const scoresToProcess = (roundNum === String(round)) ? scores : roundScores;

                    for (const uid in scoresToProcess) {
                        if (updatedMembers[uid] && typeof scoresToProcess[uid] === 'number') {
                            updatedMembers[uid].totalPoints += scoresToProcess[uid];
                        }
                    }
                });

                const newScoresToSave = {};
                for (const uid in scores) {
                    if (scores[uid] !== '') newScoresToSave[uid] = scores[uid];
                }

                transaction.set(roundRef, { scores: newScoresToSave, roundNumber: round }, { merge: true });
                transaction.update(leagueRef, { 
                    members: updatedMembers, 
                    currentRound: Math.max(leagueDoc.data().currentRound || 0, round) 
                });
            });

            toast.success(`Puntuaciones de la jornada ${round} guardadas.`);
            setMessage(`Puntuaciones de la jornada ${round} guardadas y totales recalculados.`);
        } catch (error) {
            console.error("Error al guardar las puntuaciones:", error);
            setMessage(`Error al guardar: ${error.message}`);
            toast.error("Error al guardar las puntuaciones.");
        } finally {
            setLoading(false);
        }
    };
    
    const handleSetRole = async (targetUid, newRole) => {
        if (targetUid === league.ownerId) {
            toast.error("No se puede cambiar el rol del propietario de la liga.");
            return;
        }
        const leagueRef = doc(db, 'leagues', league.id);
        await updateDoc(leagueRef, { [`members.${targetUid}.role`]: newRole });
        toast.success("Rol actualizado.");
    };

    const handleKickUser = async (targetUid) => {
        if (targetUid === league.ownerId) {
            toast.error("No se puede expulsar al propietario de la liga.");
            return;
        }
        if (window.confirm(`¿Estás seguro de que quieres expulsar a ${league.members[targetUid].teamName}? Esta acción es irreversible.`)) {
            const leagueRef = doc(db, 'leagues', league.id);
            await updateDoc(leagueRef, { [`members.${targetUid}`]: deleteField() });
            toast.success("Usuario expulsado.");
        }
    };

    const handleAddGhostTeam = async () => {
        if (!newTeamName.trim()) {
            toast.error("El nombre del equipo no puede estar vacío.");
            return;
        }
        setLoading(true);
        const placeholderId = `placeholder_${uuidv4()}`;
        const leagueRef = doc(db, 'leagues', league.id);

        const newMemberData = {
            teamName: newTeamName.trim(),
            role: 'member',
            isPlaceholder: true,
            claimedBy: null,
            totalPoints: 0,
            finances: { budget: 200, teamValue: 0 }
        };

        try {
            await updateDoc(leagueRef, {
                [`members.${placeholderId}`]: newMemberData
            });
            toast.success(`Equipo "${newTeamName.trim()}" añadido como participante.`);
            setNewTeamName('');
        } catch (error) {
            console.error("Error al añadir equipo fantasma:", error);
            toast.error("No se pudo añadir el equipo.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Añadir Participantes (sin registro)</h3>
                <p className="text-sm text-gray-500 mb-4">Añade equipos a la liga antes de que sus dueños se registren. Podrán reclamarlos al unirse con el código de invitación.</p>
                <div className="flex gap-4">
                    <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} className="input" placeholder="Nombre del nuevo equipo"/>
                    <button onClick={handleAddGhostTeam} disabled={loading} className="btn-primary whitespace-nowrap">
                        {loading ? 'Añadiendo...' : 'Añadir Equipo'}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Gestión de Jornadas</h3>
                <div className="mb-6"><label className="block text-sm font-medium text-gray-700 mb-2">Seleccionar Jornada a Editar</label><input type="number" value={round} onChange={(e) => setRound(Number(e.target.value))} className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald" min="1" /></div>
                <div className="space-y-4"><h4 className="font-semibold text-gray-800">Puntuaciones de la Jornada {round}</h4>{Object.keys(league.members).map(uid => (<div key={uid} className="flex items-center justify-between"><span className="text-gray-700">{league.members[uid].teamName}</span><input type="number" placeholder="0" value={scores[uid] ?? ''} onChange={(e) => handleScoreChange(uid, e.target.value)} className="w-24 text-center px-2 py-1 border border-gray-300 rounded-md" /></div>))}<div className="mt-8"><button onClick={handleSaveScores} disabled={loading} className="btn-primary disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar Puntos'}</button>{message && <p className={`mt-4 text-sm ${message.startsWith('Error') ? 'text-red-500' : 'text-gray-600'}`}>{message}</p>}</div></div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Gestión de Miembros</h3>
                <div className="space-y-3">{Object.entries(league.members).map(([uid, member]) => (<div key={uid} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><div><p className="font-semibold text-gray-800">{member.teamName} {member.isPlaceholder && <span className="text-xs font-bold text-gray-500">(Sin reclamar)</span>}</p><p className={`text-sm font-bold ${member.role === 'admin' ? 'text-emerald-600' : 'text-gray-500'}`}>{uid === league.ownerId ? 'Propietario' : member.role === 'admin' ? 'Admin' : 'Miembro'}</p></div>
                    <div className="flex gap-2">
                        {uid !== league.ownerId && (
                            <>
                                {member.isPlaceholder ? (
                                    <button onClick={() => handleKickUser(uid)} className="btn-action bg-red-500 hover:bg-red-600">Expulsar</button>
                                ) : (
                                    <>
                                        {member.role === 'member' ? (
                                            <button onClick={() => handleSetRole(uid, 'admin')} className="btn-action bg-blue-500 hover:bg-blue-600">Hacer Admin</button>
                                        ) : (
                                            <button onClick={() => handleSetRole(uid, 'member')} className="btn-action bg-gray-500 hover:bg-gray-600">Quitar Admin</button>
                                        )}
                                        <button onClick={() => handleKickUser(uid)} className="btn-action bg-red-500 hover:bg-red-600">Expulsar</button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>))}</div>
            </div>
        </div>
    );
}
