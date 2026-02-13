import React, { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, getDocs, orderBy, query, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { ShieldPlus, UserPlus, Edit, Trash2, RefreshCw, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import EditPlayerModal from '../components/EditPlayerModal'; // <-- Importamos el nuevo modal
import PlayersSyncTab from '../components/PlayersSyncTab'; // <-- Importamos la nueva pestaña de sincronización

const positions = ['Portero', 'Defensa', 'Centrocampista', 'Delantero', 'Entrenador'];
const teams = ['Athletic Club', 'Atlético de Madrid', 'CA Osasuna', 'Deportivo Alavés', 'Elche CF', 'FC Barcelona', 'Getafe CF', 'Girona FC', 'Levante UD', 'Rayo Vallecano', 'RC Celta de Vigo', 'RCD Espanyol', 'RCD Mallorca', 'Real Betis Balompié', 'Real Madrid', 'Real Oviedo', 'Real Sociedad', 'Sevilla FC', 'Valencia CF', 'Villarreal CF'].sort();

export default function PlayersDatabasePage() {
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [position, setPosition] = useState(positions[0]);
    const [team, setTeam] = useState(teams[0]);
    const [activeTab, setActiveTab] = useState('manual'); // 'manual' or 'sync'

    // --- ESTADOS PARA CONTROLAR EL MODAL DE EDICIÓN ---
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [playerToEdit, setPlayerToEdit] = useState(null);

    const fetchPlayers = useCallback(async () => {
        setLoading(true);
        const playersRef = collection(db, "players");
        const q = query(playersRef, orderBy("name"));
        const querySnapshot = await getDocs(q);
        setPlayers(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
    }, []);

    useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

    const handleAddPlayer = async (e) => {
        e.preventDefault();
        if (!name.trim()) { toast.error("El nombre es obligatorio."); return; }
        const loadingToast = toast.loading('Añadiendo jugador...');
        try {
            await addDoc(collection(db, "players"), {
                name: name.trim(),
                teamHistory: [{ teamName: team, startDate: new Date(), endDate: null }],
                positionHistory: [{ position: position, startDate: new Date(), endDate: null }]
            });
            toast.success('¡Jugador añadido con éxito!', { id: loadingToast });
            setName(''); setPosition(positions[0]); setTeam(teams[0]);
            fetchPlayers();
        } catch (error) { toast.error('No se pudo añadir el jugador.', { id: loadingToast }); console.error("Error al añadir jugador: ", error); }
    };

    const handleDeletePlayer = async (playerId, playerName) => {
        if (!window.confirm(`¿Estás seguro de que quieres eliminar a ${playerName}? Esta acción no se puede deshacer.`)) return;
        
        const loadingToast = toast.loading('Eliminando jugador...');
        try {
            await deleteDoc(doc(db, "players", playerId));
            toast.success('Jugador eliminado.', { id: loadingToast });
            fetchPlayers();
        } catch (error) {
            toast.error('No se pudo eliminar el jugador.', { id: loadingToast });
            console.error("Error al eliminar jugador: ", error);
        }
    };
    
    const handleOpenEditModal = (player) => {
        setPlayerToEdit(player);
        setIsEditModalOpen(true);
    };

    const getCurrentInfo = (historyArray, key) => {
        if (!historyArray || historyArray.length === 0) return 'N/A';
        const current = historyArray.find(h => h.endDate === null);
        return current ? current[key] : 'Histórico';
    };

    return (
        <>
            <EditPlayerModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} player={playerToEdit} onPlayerUpdated={fetchPlayers} />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <h1 className="text-3xl font-bold text-gray-800">Base de Datos de Jugadores</h1>
                    <div className="flex items-center gap-4">
                        <Link to="/dashboard" className="text-deep-blue hover:underline font-semibold">Volver al Dashboard</Link>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
                    <nav className="flex gap-8">
                        <button
                            onClick={() => setActiveTab('manual')}
                            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === 'manual'
                                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                        >
                            <UserPlus size={18} />
                            Gestión Manual
                        </button>
                        <button
                            onClick={() => setActiveTab('sync')}
                            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === 'sync'
                                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                        >
                            <RefreshCw size={18} />
                            Sincronización La Liga
                        </button>
                    </nav>
                </div>

                {/* Tab Content */}
                {activeTab === 'sync' ? (
                    <PlayersSyncTab />
                ) : (
                <div className="grid lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1">
                        <form onSubmit={handleAddPlayer} className="bg-white p-6 rounded-xl shadow-sm border space-y-4 sticky top-8">
                            <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2"><UserPlus size={20}/>Añadir Nuevo Jugador</h2>
                            <div><label className="label">Nombre Completo</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Ej: Lionel Messi"/></div>
                            <div><label className="label">Posición Inicial</label><select value={position} onChange={e => setPosition(e.target.value)} className="input">{positions.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                            <div><label className="label">Equipo Inicial</label><select value={team} onChange={e => setTeam(e.target.value)} className="input">{teams.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2"><ShieldPlus size={18}/> Añadir a la Base de Datos</button>
                        </form>
                    </div>
                    <div className="lg:col-span-2">
                         <div className="bg-white rounded-xl shadow-sm border">
                             <div className="p-4 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50"><tr><th className="p-3 text-left font-semibold text-gray-600">Nombre</th><th className="p-3 text-left font-semibold text-gray-600">Posición Actual</th><th className="p-3 text-left font-semibold text-gray-600">Equipo Actual</th><th className="p-3 text-left font-semibold text-gray-600">Acciones</th></tr></thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="4" className="p-4 text-center">Cargando jugadores...</td></tr>
                                        ) : (
                                            players.map(player => (
                                                <tr key={player.id} className="border-b last:border-b-0 hover:bg-gray-50">
                                                    <td className="p-3 font-semibold text-gray-800">{player.name}</td>
                                                    <td className="p-3 text-gray-600">{getCurrentInfo(player.positionHistory, 'position')}</td>
                                                    <td className="p-3 text-gray-600">{getCurrentInfo(player.teamHistory, 'teamName')}</td>
                                                    <td className="p-3 text-gray-600">
                                                        <div className="flex gap-4">
                                                            <button onClick={() => handleOpenEditModal(player)} className="text-blue-600 hover:underline text-xs flex items-center gap-1"><Edit size={12}/> Editar</button>
                                                            <button onClick={() => handleDeletePlayer(player.id, player.name)} className="text-red-600 hover:underline text-xs flex items-center gap-1"><Trash2 size={12}/> Eliminar</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                             </div>
                         </div>
                    </div>
                </div>
                )}
            </div>
        </>
    );
}