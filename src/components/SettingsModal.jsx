import React, { useState, useEffect } from 'react';
import { doc, updateDoc, writeBatch, collection, getDocs, deleteDoc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, storage } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Copy, Star, Edit, X, Check, Upload, Save } from 'lucide-react';
import { calculateAndAwardTrophies, revokeTrophiesForSeason } from '../utils/trophyUtils';

export default function SettingsModal({ isOpen, onClose, league, seasons }) {
    const navigate = useNavigate();
    const [leagueName, setLeagueName] = useState('');
    const [rules, setRules] = useState('');
    const [loading, setLoading] = useState(false);
    const [newSeasonName, setNewSeasonName] = useState('');
    const [editingSeason, setEditingSeason] = useState({ id: null, name: '' });
    const [newSeasonTeamName, setNewSeasonTeamName] = useState('');
    const [seasonDetails, setSeasonDetails] = useState({});

    useEffect(() => {
        if (isOpen) {
            setLeagueName(league.name);
            setRules(league.rules || '');
            setNewSeasonName(`Temporada ${seasons.length + 1}`);
            setEditingSeason({ id: null, name: '' });
            setNewSeasonTeamName('');

            const details = {};
            seasons.forEach(s => {
                details[s.id] = {
                    description: s.description || '',
                    prizes: s.prizes || ''
                };
            });
            setSeasonDetails(details);
        }
    }, [isOpen, league, seasons]);

    const handleSaveLeagueSettings = async (e) => {
        e.preventDefault();
        if (!leagueName.trim()) {
            toast.error("El nombre de la liga no puede estar vacío.");
            return;
        }
        setLoading(true);
        const loadingToast = toast.loading('Guardando cambios de la liga...');
        try {
            const leagueRef = doc(db, 'leagues', league.id);
            await updateDoc(leagueRef, { 
                name: leagueName.trim(),
                rules: rules.trim(),
            });
            toast.success('Ajustes de la liga actualizados', { id: loadingToast });
        } catch (error) {
            toast.error('No se pudieron guardar los cambios.', { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };
    
    const handleSaveSeasonDetails = async (seasonId) => {
        setLoading(true);
        const loadingToast = toast.loading('Guardando detalles de la temporada...');
        try {
            const seasonRef = doc(db, 'leagues', league.id, 'seasons', seasonId);
            await updateDoc(seasonRef, {
                description: seasonDetails[seasonId].description.trim(),
                prizes: seasonDetails[seasonId].prizes.trim(),
            });
            toast.success('Detalles de la temporada actualizados.', {id: loadingToast});
        } catch (error) {
             toast.error('No se pudieron guardar los detalles.', {id: loadingToast});
        } finally {
            setLoading(false);
        }
    };
    
    const handleSeasonDetailChange = (seasonId, field, value) => {
        setSeasonDetails(prev => ({
            ...prev,
            [seasonId]: {
                ...prev[seasonId],
                [field]: value
            }
        }));
    };

    const handleCreateNewSeason = async () => {
        if (!newSeasonName.trim() || !newSeasonTeamName.trim()) {
            toast.error("Debes rellenar el nombre de la temporada y el de tu equipo.");
            return;
        }
        setLoading(true);
        const loadingToast = toast.loading(`Creando "${newSeasonName}"...`);
        const user = auth.currentUser;
        if (!user) {
            toast.error("No estás autenticado.", { id: loadingToast });
            setLoading(false);
            return;
        }

        try {
            const userProfileRef = doc(db, 'users', user.uid);
            const userProfileSnap = await getDoc(userProfileRef);
            if (!userProfileSnap.exists()) throw new Error("No se encontró el perfil del usuario.");
            const username = userProfileSnap.data().username;
            
            const newSeasonNumber = seasons.length > 0 ? Math.max(...seasons.map(s => s.seasonNumber)) + 1 : 1;
            const newSeasonId = `season_${Date.now()}`;
            const seasonRef = doc(db, 'leagues', league.id, 'seasons', newSeasonId);

            await setDoc(seasonRef, {
                name: newSeasonName.trim(),
                seasonNumber: newSeasonNumber,
                createdAt: serverTimestamp(),
                status: 'Activa',
                members: {
                    [user.uid]: {
                        username: username,
                        teamName: newSeasonTeamName.trim(),
                        role: 'admin',
                        isPlaceholder: false,
                        totalPoints: 0,
                        finances: { budget: 200, teamValue: 0 }
                    }
                },
                inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
                currentRound: 1,
            });
            
            toast.success(`Temporada "${newSeasonName.trim()}" creada.`, { id: loadingToast });
            setNewSeasonName('');
            setNewSeasonTeamName('');
        } catch (error) {
            console.error(error);
            toast.error("No se pudo crear la temporada.", { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };
    
    const handleUpdateSeasonName = async () => {
        if (!editingSeason.name.trim()) {
            toast.error("El nombre de la temporada no puede estar vacío.");
            return;
        }
        setLoading(true);
        const seasonRef = doc(db, 'leagues', league.id, 'seasons', editingSeason.id);
        try {
            await updateDoc(seasonRef, { name: editingSeason.name.trim() });
            toast.success("Nombre de la temporada actualizado.");
            setEditingSeason({ id: null, name: '' });
        } catch (error) {
            toast.error("No se pudo actualizar el nombre.");
        } finally {
            setLoading(false);
        }
    };
    
    const handleCopyCode = (code) => {
        navigator.clipboard.writeText(code);
        toast.success("¡Código copiado al portapapeles!");
    };
    
    const handleSetActiveSeason = async (seasonId) => {
        if (league.activeSeason === seasonId) return;
        setLoading(true);
        const leagueRef = doc(db, 'leagues', league.id);
        try {
            await updateDoc(leagueRef, { activeSeason: seasonId });
            toast.success("Temporada activa actualizada.");
        } catch (error) {
            toast.error("No se pudo actualizar la temporada activa.");
        } finally {
            setLoading(false);
        }
    };

    const handleSetSeasonStatus = async (seasonId, newStatus) => {
        const seasonToUpdate = seasons.find(s => s.id === seasonId);
        const oldStatus = seasonToUpdate.status;

        if(oldStatus === newStatus) return;

        setLoading(true);
        let loadingToast;

        try {
            if (newStatus === 'Finalizada') {
                loadingToast = toast.loading('Finalizando temporada y calculando trofeos...');
                await calculateAndAwardTrophies(league, seasonToUpdate); // <-- CORRECCIÓN AQUÍ
                toast.success('¡Trofeos calculados y asignados!', { id: loadingToast });
            } else if (newStatus === 'Activa' && oldStatus === 'Finalizada') {
                loadingToast = toast.loading('Reactivando temporada y eliminando trofeos...');
                await revokeTrophiesForSeason(league.id, seasonToUpdate);
                toast.success('Trofeos de la temporada revocados.', { id: loadingToast });
            } else {
                 loadingToast = toast.loading('Actualizando estado...');
            }

            const seasonRef = doc(db, 'leagues', league.id, 'seasons', seasonId);
            await updateDoc(seasonRef, { status: newStatus });
            toast.success("Estado de la temporada actualizado.", { id: loadingToast });

        } catch (error) {
            console.error("Error al cambiar el estado o gestionar trofeos:", error);
            toast.error("No se pudo completar la operación.", { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };


    const handleDeleteSeason = async (seasonId, seasonName) => {
        if (seasons.length <= 1) {
            toast.error("No puedes eliminar la única temporada de la liga.");
            return;
        }
        if(league.activeSeason === seasonId) {
            toast.error("No puedes eliminar la temporada que está activa.");
            return;
        }
        
        const confirmationText = prompt(`Esta acción borrará la temporada "${seasonName}" y todos sus datos (jornadas, fichajes, etc.).\n\nPara confirmar, escribe el nombre de la temporada: "${seasonName}"`);
        if (confirmationText !== seasonName) {
            toast.error("La confirmación no coincide. Eliminación cancelada.");
            return;
        }

        setLoading(true);
        const loadingToast = toast.loading(`Eliminando ${seasonName}...`);
        try {
            const batch = writeBatch(db);
            const seasonRef = doc(db, 'leagues', league.id, 'seasons', seasonId);
            const subcollections = ['rounds', 'lineups', 'transfers', 'achievements'];

            for (const sub of subcollections) {
                const subcollectionRef = collection(db, 'leagues', league.id, 'seasons', seasonId, sub);
                const snapshot = await getDocs(subcollectionRef);
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
            }

            batch.delete(seasonRef);
            await batch.commit();
            toast.success(`Temporada "${seasonName}" eliminada.`, { id: loadingToast });
        } catch (error) {
            console.error("Error al eliminar la temporada:", error);
            toast.error(`No se pudo eliminar "${seasonName}".`, { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteLeague = async () => {
        const confirmationText = prompt(`Esta acción es IRREVERSIBLE y borrará la liga "${league.name}" y TODAS sus temporadas. Para confirmar, escribe el nombre de la liga: "${league.name}"`);
        if (confirmationText !== league.name) {
            toast.error("La confirmación no coincide. Eliminación cancelada.");
            return;
        }

        setLoading(true);
        const loadingToast = toast.loading('Eliminando liga y todos sus datos...');
        try {
            const batch = writeBatch(db);

            for (const season of seasons) {
                const seasonSubcollections = ['rounds', 'lineups', 'transfers', 'achievements'];
                 for (const sub of seasonSubcollections) {
                    const subcollectionRef = collection(db, 'leagues', league.id, 'seasons', season.id, sub);
                    const snapshot = await getDocs(subcollectionRef);
                    snapshot.docs.forEach(doc => batch.delete(doc.ref));
                }
                const seasonRef = doc(db, 'leagues', league.id, 'seasons', season.id);
                batch.delete(seasonRef);
            }

            const leagueRef = doc(db, 'leagues', league.id);
            batch.delete(leagueRef);
            
            await batch.commit();

            toast.success('Liga eliminada con éxito.', { id: loadingToast });
            navigate('/dashboard');
        } catch (error) {
            console.error("Error al eliminar la liga:", error);
            toast.error("No se pudo eliminar la liga.", { id: loadingToast });
            setLoading(false);
        }
    };

    const handleSeasonImageUpload = async (e, seasonId) => {
        const file = e.target.files[0];
        if (!file) return;

        const loadingToast = toast.loading('Subiendo imagen...');
        setLoading(true);
        try {
            const imageRef = ref(storage, `season-pictures/${league.id}/${seasonId}`);
            await uploadBytes(imageRef, file);
            const photoURL = await getDownloadURL(imageRef);

            const seasonRef = doc(db, 'leagues', league.id, 'seasons', seasonId);
            await updateDoc(seasonRef, { seasonPhotoURL: photoURL });
            
            toast.success('Imagen de la temporada actualizada', { id: loadingToast });
        } catch (error) {
            console.error("Error subiendo imagen:", error);
            toast.error('No se pudo subir la imagen.', { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-3xl shadow-lg overflow-y-auto max-h-[90vh]">
                <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-6">Ajustes de la Liga</h3>
                <form onSubmit={handleSaveLeagueSettings} className="space-y-4">
                    <div>
                        <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Nombre General de la Liga</label>
                        <input type="text" value={leagueName} onChange={(e) => setLeagueName(e.target.value)} className="input" />
                    </div>
                     <div>
                        <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Reglamento de la Liga (Común para todas las temporadas)</label>
                        <textarea value={rules} onChange={(e) => setRules(e.target.value)} className="input h-40" placeholder="Detalla aquí las reglas de puntuación, fichajes, premios, etc."/>
                    </div>
                     <div className="flex justify-end gap-4 pt-4 mt-4 border-t dark:border-gray-700">
                        <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">
                            {loading ? 'Guardando...' : 'Guardar Ajustes de Liga'}
                        </button>
                    </div>
                </form>

                <div className="mt-8 border-t-2 border-emerald-200 pt-6">
                     <h4 className="text-lg font-bold text-emerald-600 mb-4">Gestión de Temporadas</h4>
                     <div className="space-y-4">
                        {seasons.map(season => (
                            <div key={season.id} className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg border dark:border-gray-700 space-y-4">
                                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                    <div className="flex items-center gap-3 flex-grow mr-2">
                                        <input type="file" id={`file-${season.id}`} className="hidden" accept="image/*" onChange={(e) => handleSeasonImageUpload(e, season.id)} />
                                        <label htmlFor={`file-${season.id}`} className="cursor-pointer p-2 text-gray-500 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
                                            <Upload size={18}/>
                                        </label>
                                        {editingSeason.id === season.id ? (
                                            <input type="text" value={editingSeason.name} onChange={(e) => setEditingSeason({...editingSeason, name: e.target.value})} className="input text-lg font-semibold !py-1"/>
                                        ) : (
                                            <span className="font-semibold text-lg text-gray-800 dark:text-gray-200">{season.name}</span>
                                        )}
                                        {league.activeSeason === season.id && <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-800 font-bold px-2 py-0.5 rounded-full"><Star size={12}/> Activa</span>}
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0 self-end sm:self-center">
                                        {editingSeason.id === season.id ? (
                                            <>
                                                <button onClick={() => setEditingSeason({id: null, name: ''})} className="p-2 text-gray-500 hover:text-red-600"><X size={18}/></button>
                                                <button onClick={handleUpdateSeasonName} disabled={loading} className="p-2 text-gray-500 hover:text-emerald-600"><Check size={18}/></button>
                                            </>
                                        ) : (
                                            <button onClick={() => setEditingSeason({id: season.id, name: season.name})} disabled={loading} title="Editar nombre" className="p-2 text-gray-500 hover:text-blue-600"><Edit size={16}/></button>
                                        )}
                                        <button onClick={() => handleCopyCode(season.inviteCode)} disabled={loading} title="Copiar código de invitación" className="p-2 text-gray-500 hover:text-deep-blue"><Copy size={16}/></button>
                                        {league.activeSeason !== season.id && (
                                            <button onClick={() => handleSetActiveSeason(season.id)} disabled={loading} title="Hacer activa" className="p-2 text-gray-500 hover:text-emerald-500"><Star size={16}/></button>
                                        )}
                                        <button onClick={() => handleDeleteSeason(season.id, season.name)} disabled={loading} title="Eliminar temporada" className="p-2 text-gray-500 hover:text-red-600"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                     <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Descripción de la Temporada</label>
                                     <textarea value={seasonDetails[season.id]?.description || ''} onChange={(e) => handleSeasonDetailChange(season.id, 'description', e.target.value)} className="input h-20 text-sm" placeholder={`Breve descripción para la ${season.name}`}/>
                                </div>
                                <div className="space-y-2">
                                     <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Premios de la Temporada</label>
                                     <textarea value={seasonDetails[season.id]?.prizes || ''} onChange={(e) => handleSeasonDetailChange(season.id, 'prizes', e.target.value)} className="input h-24 text-sm" placeholder={`Premios para el 1er, 2º, 3er puesto, pichichi, etc. de la ${season.name}`}/>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Estado de la Temporada</label>
                                        <select 
                                            value={season.status || 'Activa'} 
                                            onChange={(e) => handleSetSeasonStatus(season.id, e.target.value)} 
                                            className="input text-sm !py-1 mt-1 !w-auto"
                                            disabled={loading}
                                        >
                                            <option value="Activa">Activa</option>
                                            <option value="Finalizada">Finalizada</option>
                                        </select>
                                    </div>
                                    <button onClick={() => handleSaveSeasonDetails(season.id)} className="btn-secondary !py-1.5 text-sm flex items-center gap-2">
                                        <Save size={14}/> Guardar Detalles
                                    </button>
                                </div>
                            </div>
                        ))}
                     </div>
                      <div className="mt-6 pt-4 border-t dark:border-gray-600">
                        <label className="font-semibold text-gray-700 dark:text-gray-300">Crear nueva temporada:</label>
                        <div className="mt-2 space-y-3">
                            <input type="text" value={newSeasonName} onChange={e => setNewSeasonName(e.target.value)} className="input" placeholder="Nombre de la nueva temporada"/>
                            <input type="text" value={newSeasonTeamName} onChange={e => setNewSeasonTeamName(e.target.value)} className="input" placeholder="Tu nombre de equipo para esta temporada"/>
                            <button onClick={handleCreateNewSeason} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 whitespace-nowrap"><Plus size={18}/> Crear y Unirme</button>
                         </div>
                     </div>
                </div>

                <div className="mt-8 border-t-2 border-red-200 pt-6">
                    <h4 className="text-lg font-bold text-red-600">Zona de Peligro</h4>
                    <p className="text-sm text-gray-500 mt-1">Esta acción es irreversible.</p>
                    <div className="mt-4">
                        <button onClick={handleDeleteLeague} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg w-full disabled:opacity-50">
                            {loading ? 'Eliminando...' : 'Eliminar Liga (y todas sus temporadas)'}
                        </button>
                    </div>
                </div>
                 <div className="flex justify-end mt-8 pt-4 border-t dark:border-gray-700">
                    <button onClick={onClose} className="btn-secondary">Cerrar</button>
                </div>
            </div>
        </div>
    );
}