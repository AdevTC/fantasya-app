import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, runTransaction, getDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import toast from 'react-hot-toast';

export default function JoinLeagueModal({ isOpen, onClose, onLeagueJoined }) {
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoinLeague = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim() || !teamName.trim()) { setError('Debes rellenar el código y el nombre de tu equipo.'); return; }
    if (teamName.length > 24) { setError('El nombre del equipo no puede tener más de 24 caracteres.'); return; }
    setLoading(true);
    setError('');

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Usuario no autenticado");

      const leaguesRef = collection(db, 'leagues');
      const q = query(leaguesRef, where("inviteCode", "==", inviteCode.trim().toUpperCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) throw new Error("No se encontró ninguna liga con ese código.");
      
      const leagueDoc = querySnapshot.docs[0];
      const leagueId = leagueDoc.id;
      const leagueData = leagueDoc.data();

      if (leagueData.members[user.uid]) throw new Error("Ya eres miembro de esta liga.");

      const userProfileRef = doc(db, 'users', user.uid);
      const userProfileSnap = await getDoc(userProfileRef);
      if (!userProfileSnap.exists()) throw new Error("No se encontró tu perfil de usuario.");
      const username = userProfileSnap.data().username;

      const leagueRef = doc(db, 'leagues', leagueId);
      await runTransaction(db, async (transaction) => {
        const freshLeagueDoc = await transaction.get(leagueRef);
        if (!freshLeagueDoc.exists()) throw "La liga ya no existe.";
        
        const newMember = {
            username: username, // <-- Guardamos el nombre de usuario global
            teamName: teamName.trim(),
            role: 'member',
            budget: 200,
            team: [],
            totalPoints: 0
        };
        
        transaction.update(leagueRef, { [`members.${user.uid}`]: newMember });
      });

      toast.success(`¡Te has unido a la liga "${leagueData.name}"!`);
      onLeagueJoined();
      onClose();

    } catch (err) {
      console.error("Error al unirse a la liga:", err);
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
    
  useEffect(() => { if (!isOpen) { setInviteCode(''); setTeamName(''); setError(''); } }, [isOpen]);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-lg">
        <div className="flex justify-between items-center mb-6"><h3 className="text-2xl font-bold text-gray-800">Unirse a una Liga</h3><button onClick={onClose} className="text-gray-500 hover:text-gray-700">&times;</button></div>
        <form onSubmit={handleJoinLeague} className="space-y-4">
          <div><label className="block text-gray-700 text-sm font-bold mb-2">Código de Invitación</label><input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="input uppercase" placeholder="CÓDIGO"/></div>
          <div><label className="block text-gray-700 text-sm font-bold mb-2">Nombre de tu Equipo en esta Liga</label><input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} className="input" placeholder="Ej: Los Fieras FC"/></div>
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <div className="flex justify-end gap-4 pt-2"><button type="button" onClick={onClose} className="btn-secondary">Cancelar</button><button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">{loading ? 'Buscando...' : 'Unirse a Liga'}</button></div>
        </form>
      </div>
    </div>
  );
}