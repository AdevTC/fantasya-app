import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, runTransaction, getDoc, deleteField, collectionGroup } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import toast from 'react-hot-toast';

export default function JoinLeagueModal({ isOpen, onClose, onLeagueJoined }) {
  const [step, setStep] = useState(1);
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [leagueToJoin, setLeagueToJoin] = useState(null);
  const [seasonToJoin, setSeasonToJoin] = useState(null);
  const [unclaimedTeams, setUnclaimedTeams] = useState([]);
  const [joinOption, setJoinOption] = useState('claim');
  const [selectedClaim, setSelectedClaim] = useState('');

  const resetState = () => {
    setStep(1); setInviteCode(''); setTeamName(''); setError(''); setLeagueToJoin(null); setSeasonToJoin(null);
    setUnclaimedTeams([]); setJoinOption('claim'); setSelectedClaim('');
  };

  const handleFindLeague = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) { setError('Debes rellenar el código.'); return; }
    setLoading(true); setError('');

    try {
      const leaguesRef = collection(db, 'leagues');
      const allLeaguesSnapshot = await getDocs(leaguesRef);
      let foundLeague = null;
      let foundSeason = null;

      for (const leagueDoc of allLeaguesSnapshot.docs) {
        const seasonsRef = collection(db, 'leagues', leagueDoc.id, 'seasons');
        const q = query(seasonsRef, where("inviteCode", "==", inviteCode.trim().toUpperCase()));
        const seasonSnapshot = await getDocs(q);

        if (!seasonSnapshot.empty) {
          const seasonDoc = seasonSnapshot.docs[0];
          foundLeague = { id: leagueDoc.id, ...leagueDoc.data() };
          foundSeason = { id: seasonDoc.id, ...seasonDoc.data() };
          break;
        }
      }

      if (!foundLeague || !foundSeason) throw new Error("No se encontró ninguna temporada con ese código de invitación.");
      
      if (foundSeason.members[auth.currentUser.uid]) throw new Error("Ya eres miembro de esta temporada.");

      const availableTeams = Object.entries(foundSeason.members)
        .filter(([, member]) => member.isPlaceholder)
        .map(([id, member]) => ({ id, teamName: member.teamName }));

      setUnclaimedTeams(availableTeams);
      if (availableTeams.length > 0) {
        setSelectedClaim(availableTeams[0].id);
        setJoinOption('claim');
      } else {
        setJoinOption('create');
      }
      setLeagueToJoin(foundLeague);
      setSeasonToJoin(foundSeason);
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
      const seasonRef = doc(db, 'leagues', leagueToJoin.id, 'seasons', seasonToJoin.id);

      await runTransaction(db, async (transaction) => {
        const freshSeasonDoc = await transaction.get(seasonRef);
        if (!freshSeasonDoc.exists()) throw new Error("La temporada ya no existe.");

        const currentMembers = freshSeasonDoc.data().members;
        
        if (joinOption === 'claim') {
          if (!selectedClaim) throw new Error("Debes seleccionar un equipo para reclamar.");
          
          const placeholderData = currentMembers[selectedClaim];
          if (!placeholderData || !placeholderData.isPlaceholder) throw new Error("Este equipo ya ha sido reclamado o no existe.");

          const newMemberData = { ...placeholderData, username: username, isPlaceholder: false, claimedBy: user.uid };
          
          transaction.update(seasonRef, {
            [`members.${user.uid}`]: newMemberData,
            [`members.${selectedClaim}`]: deleteField()
          });

          // Migrar trofeos
          const achievementRef = doc(db, 'leagues', leagueToJoin.id, 'seasons', seasonToJoin.id, 'achievements', selectedClaim);
          const achievementSnap = await transaction.get(achievementRef);

          if (achievementSnap.exists()) {
            const userAchievementRef = doc(db, 'users', user.uid, 'achievements', seasonToJoin.id);
            const achievementData = achievementSnap.data();
            transaction.set(userAchievementRef, {
                seasonName: seasonToJoin.name,
                leagueName: leagueToJoin.name,
                trophies: achievementData.trophies
            });
            transaction.update(achievementRef, { isPlaceholder: false });
          }

        } else {
          if (!teamName.trim() || teamName.length > 24) throw new Error('El nombre de equipo no es válido.');
          const newMember = { username: username, teamName: teamName.trim(), role: 'member', isPlaceholder: false, totalPoints: 0, finances: { budget: 200, teamValue: 0 } };
          transaction.update(seasonRef, { [`members.${user.uid}`]: newMember });
        }
      });
      
      toast.success(`¡Te has unido a la temporada "${seasonToJoin.name}" de la liga "${leagueToJoin.name}"!`);
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-md shadow-lg">
        <div className="flex justify-between items-center mb-6"><h3 className="text-2xl font-bold text-gray-800">Unirse a una Temporada</h3><button onClick={onClose} className="text-gray-500 hover:text-gray-700">&times;</button></div>
        
        {step === 1 && (
          <form onSubmit={handleFindLeague} className="space-y-4">
            <div><label className="block text-gray-700 text-sm font-bold mb-2">Código de Invitación de Temporada</label><input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="input uppercase" placeholder="CÓDIGO"/></div>
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <div className="flex justify-end gap-4 pt-2"><button type="button" onClick={onClose} className="btn-secondary">Cancelar</button><button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">{loading ? 'Buscando...' : 'Siguiente'}</button></div>
          </form>
        )}
        
        {step === 2 && leagueToJoin && seasonToJoin && (
            <form onSubmit={handleJoinLeague} className="space-y-4">
                <h4 className="font-semibold text-lg text-center">Te estás uniendo a: <span className="text-emerald-600">{leagueToJoin.name} - {seasonToJoin.name}</span></h4>
                
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
                <div className="flex justify-end gap-4 pt-2"><button type="button" onClick={() => setStep(1)} className="btn-secondary">Atrás</button><button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">{loading ? 'Uniéndote...' : 'Unirse a Temporada'}</button></div>
            </form>
        )}
      </div>
    </div>
  );
}