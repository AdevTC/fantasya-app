import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, runTransaction, getDoc, writeBatch, deleteField } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import toast from 'react-hot-toast';

export default function JoinLeagueModal({ isOpen, onClose, onLeagueJoined }) {
  const [step, setStep] = useState(1); // 1: Enter code, 2: Choose team
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [leagueToJoin, setLeagueToJoin] = useState(null);
  const [unclaimedTeams, setUnclaimedTeams] = useState([]);
  const [joinOption, setJoinOption] = useState('claim'); // 'claim' or 'create'
  const [selectedClaim, setSelectedClaim] = useState('');

  const resetState = () => {
    setStep(1); setInviteCode(''); setTeamName(''); setError(''); setLeagueToJoin(null);
    setUnclaimedTeams([]); setJoinOption('claim'); setSelectedClaim('');
  };

  const handleFindLeague = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) { setError('Debes rellenar el código.'); return; }
    setLoading(true); setError('');

    try {
        const leaguesRef = collection(db, 'leagues');
        const q = query(leaguesRef, where("inviteCode", "==", inviteCode.trim().toUpperCase()));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) throw new Error("No se encontró ninguna liga con ese código.");
        
        const leagueDoc = querySnapshot.docs[0];
        const leagueData = { id: leagueDoc.id, ...leagueDoc.data() };
        
        if (leagueData.members[auth.currentUser.uid]) throw new Error("Ya eres miembro de esta liga.");

        const availableTeams = Object.entries(leagueData.members)
            .filter(([, member]) => member.isPlaceholder)
            .map(([id, member]) => ({ id, teamName: member.teamName }));

        setUnclaimedTeams(availableTeams);
        if (availableTeams.length > 0) {
            setSelectedClaim(availableTeams[0].id);
        } else {
            setJoinOption('create'); // Forzar creación si no hay equipos que reclamar
        }
        setLeagueToJoin(leagueData);
        setStep(2);

    } catch(err) {
        setError(err.message);
        toast.error(err.message);
    } finally {
        setLoading(false);
    }
  };
  
  const handleJoinLeague = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Usuario no autenticado.");

        const userProfileRef = doc(db, 'users', user.uid);
        const userProfileSnap = await getDoc(userProfileRef);
        if (!userProfileSnap.exists()) throw new Error("No se encontró tu perfil de usuario.");
        const username = userProfileSnap.data().username;
        const leagueRef = doc(db, 'leagues', leagueToJoin.id);

        await runTransaction(db, async (transaction) => {
            const freshLeagueDoc = await transaction.get(leagueRef);
            if (!freshLeagueDoc.exists()) throw new Error("La liga ya no existe.");

            const currentMembers = freshLeagueDoc.data().members;
            
            if (joinOption === 'claim') {
                if (!selectedClaim) throw new Error("Debes seleccionar un equipo para reclamar.");
                
                const placeholderData = currentMembers[selectedClaim];
                if (!placeholderData || !placeholderData.isPlaceholder) throw new Error("Este equipo ya ha sido reclamado o no existe.");

                const newMemberData = {
                    ...placeholderData,
                    username: username,
                    isPlaceholder: false,
                    claimedBy: user.uid,
                };
                
                transaction.update(leagueRef, {
                    [`members.${user.uid}`]: newMemberData,
                    [`members.${selectedClaim}`]: deleteField()
                });

            } else { // Crear nuevo equipo
                if (!teamName.trim() || teamName.length > 24) throw new Error('El nombre de equipo no es válido.');
                const newMember = {
                    username: username,
                    teamName: teamName.trim(),
                    role: 'member',
                    isPlaceholder: false,
                    totalPoints: 0,
                    finances: { budget: 200, teamValue: 0 }
                };
                transaction.update(leagueRef, { [`members.${user.uid}`]: newMember });
            }
        });
        
        toast.success(`¡Te has unido a la liga "${leagueToJoin.name}"!`);
        onLeagueJoined();
        onClose();

    } catch (err) {
        setError(err.message);
        toast.error(err.message);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => { if (!isOpen) resetState(); }, [isOpen]);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-lg">
        <div className="flex justify-between items-center mb-6"><h3 className="text-2xl font-bold text-gray-800">Unirse a una Liga</h3><button onClick={onClose} className="text-gray-500 hover:text-gray-700">&times;</button></div>
        
        {step === 1 && (
            <form onSubmit={handleFindLeague} className="space-y-4">
            <div><label className="block text-gray-700 text-sm font-bold mb-2">Código de Invitación</label><input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="input uppercase" placeholder="CÓDIGO"/></div>
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <div className="flex justify-end gap-4 pt-2"><button type="button" onClick={onClose} className="btn-secondary">Cancelar</button><button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">{loading ? 'Buscando...' : 'Siguiente'}</button></div>
            </form>
        )}
        
        {step === 2 && leagueToJoin && (
            <form onSubmit={handleJoinLeague} className="space-y-4">
                <h4 className="font-semibold text-lg text-center">Te estás uniendo a: <span className="text-emerald-600">{leagueToJoin.name}</span></h4>
                
                {unclaimedTeams.length > 0 && (
                    <div className="space-y-2">
                        <label className="flex items-center gap-3 p-3 border rounded-lg">
                            <input type="radio" name="join-option" value="claim" checked={joinOption === 'claim'} onChange={() => setJoinOption('claim')} className="w-5 h-5"/>
                            <div>
                                <span className="font-semibold">Reclamar un equipo existente</span>
                                {joinOption === 'claim' && (
                                    <select value={selectedClaim} onChange={e => setSelectedClaim(e.target.value)} className="input mt-2">
                                        {unclaimedTeams.map(team => <option key={team.id} value={team.id}>{team.teamName}</option>)}
                                    </select>
                                )}
                            </div>
                        </label>
                    </div>
                )}
                
                <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 border rounded-lg">
                        <input type="radio" name="join-option" value="create" checked={joinOption === 'create'} onChange={() => setJoinOption('create')} className="w-5 h-5"/>
                         <div>
                            <span className="font-semibold">Crear un nuevo equipo</span>
                             {joinOption === 'create' && (
                                <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} className="input mt-2" placeholder="Ej: Los Fieras FC"/>
                            )}
                        </div>
                    </label>
                </div>
                
                {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                <div className="flex justify-end gap-4 pt-2"><button type="button" onClick={() => setStep(1)} className="btn-secondary">Atrás</button><button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">{loading ? 'Uniéndote...' : 'Unirse a Liga'}</button></div>
            </form>
        )}
      </div>
    </div>
  );
}
