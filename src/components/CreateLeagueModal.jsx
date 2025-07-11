import React, { useState, useEffect } from 'react';
import { addDoc, collection, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import toast from 'react-hot-toast';

export default function CreateLeagueModal({ isOpen, onClose, onLeagueCreated }) {
  const [leagueName, setLeagueName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    if (!leagueName.trim() || !teamName.trim()) {
      toast.error('Debes rellenar el nombre de la liga y de tu equipo.');
      return;
    }
    if (teamName.length > 24) {
        toast.error('El nombre del equipo no puede tener más de 24 caracteres.');
        return;
    }
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Usuario no autenticado");

      // Obtenemos el perfil del usuario para coger su nombre de usuario global
      const userProfileRef = doc(db, 'users', user.uid);
      const userProfileSnap = await getDoc(userProfileRef);
      if (!userProfileSnap.exists()) throw new Error("No se encontró el perfil del usuario.");
      const username = userProfileSnap.data().username;

      await addDoc(collection(db, 'leagues'), {
        name: leagueName,
        createdAt: serverTimestamp(),
        ownerId: user.uid,
        members: {
          [user.uid]: {
            username: username, // <-- Guardamos el nombre de usuario global
            teamName: teamName.trim(),
            role: 'admin',
            budget: 200,
            team: [],
            totalPoints: 0
          }
        },
        inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase()
      });
      
      toast.success('¡Liga creada con éxito!');
      onLeagueCreated();
      onClose();

    } catch (err) {
      console.error("Error al crear la liga:", err);
      toast.error("No se pudo crear la liga. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!isOpen) { setLeagueName(''); setTeamName(''); } }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-lg">
        <div className="flex justify-between items-center mb-6"><h3 className="text-2xl font-bold text-gray-800">Crear Nueva Liga</h3><button onClick={onClose} className="text-gray-500 hover:text-gray-700">&times;</button></div>
        <form onSubmit={handleCreateLeague} className="space-y-4">
          <div><label className="block text-gray-700 text-sm font-bold mb-2">Nombre de la Liga</label><input type="text" value={leagueName} onChange={(e) => setLeagueName(e.target.value)} className="input" placeholder="Ej: Liga de los Lunes"/></div>
          <div><label className="block text-gray-700 text-sm font-bold mb-2">Nombre de tu Equipo en esta Liga</label><input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} className="input" placeholder="Ej: Los Máquinas FC"/></div>
          <div className="flex justify-end gap-4 pt-2"><button type="button" onClick={onClose} className="btn-secondary">Cancelar</button><button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">{loading ? 'Creando...' : 'Crear Liga'}</button></div>
        </form>
      </div>
    </div>
  );
}