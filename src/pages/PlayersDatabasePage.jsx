import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Plus, Trash2, Edit, Search, UserX } from 'lucide-react'; // <-- AÑADIMOS ICONOS
import EditPlayerModal from '../components/EditPlayerModal';
import LoadingSpinner from '../components/LoadingSpinner';

export default function PlayersDatabasePage() {
    const [players, setPlayers] = useState([]);
    const [newPlayer, setNewPlayer] = useState({
        name: '',
        position: 'POR',
        team: '',
        value: 1000000,
    });
    const [loading, setLoading] = useState(true);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [searchTerm, setSearchTerm] = useState(''); // <-- NUEVO ESTADO PARA LA BÚSQUEDA

    useEffect(() => {
        const fetchPlayers = async () => {
            setLoading(true);
            try {
                const querySnapshot = await getDocs(collection(db, 'players'));
                const playersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setPlayers(playersData.sort((a, b) => a.name.localeCompare(b.name)));
            } catch (error) {
                toast.error('Error al cargar los jugadores.');
                console.error("Error fetching players: ", error);
            }
            setLoading(false);
        };
        fetchPlayers();
    }, []);
    
    // Filtramos los jugadores según el término de búsqueda
    const filteredPlayers = players.filter(player => 
        player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.team.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleAddPlayer = async (e) => {
        e.preventDefault();
        if (!newPlayer.name || !newPlayer.team || newPlayer.value <= 0) {
            toast.error('Por favor, completa todos los campos correctamente.');
            return;
        }

        try {
            await addDoc(collection(db, 'players'), {
                ...newPlayer,
                value: Number(newPlayer.value),
            });
            toast.success('¡Jugador añadido con éxito!');
            setNewPlayer({ name: '', position: 'POR', team: '', value: 1000000 });
            // Recargar la lista de jugadores
            const querySnapshot = await getDocs(collection(db, 'players'));
            const playersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPlayers(playersData.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (error) {
            toast.error('Error al añadir el jugador.');
            console.error("Error adding player: ", error);
        }
    };

    const handleDeletePlayer = async (playerId, playerName) => {
        if (window.confirm(`¿Estás seguro de que quieres eliminar a ${playerName}?`)) {
            try {
                await deleteDoc(doc(db, 'players', playerId));
                toast.success(`${playerName} eliminado.`);
                setPlayers(players.filter(p => p.id !== playerId));
            } catch (error) {
                toast.error('Error al eliminar el jugador.');
                console.error("Error deleting player: ", error);
            }
        }
    };
    
    const handleOpenEditModal = (player) => {
        setEditingPlayer(player);
        setIsEditModalOpen(true);
    };

    const handleUpdatePlayer = (updatedPlayer) => {
        setPlayers(players.map(p => p.id === updatedPlayer.id ? updatedPlayer : p).sort((a, b) => a.name.localeCompare(b.name)));
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const text = event.target.result;
                const lines = text.split('\n');
                const playersToAdd = [];
                for (let i = 1; i < lines.length; i++) { // Empezar en 1 para saltar la cabecera
                    const [name, position, team, valueStr] = lines[i].split(',');
                    if (name && position && team && valueStr) {
                         const value = parseInt(valueStr.trim(), 10);
                        if (!isNaN(value)) {
                            playersToAdd.push({
                                name: name.trim(),
                                position: position.trim(),
                                team: team.trim(),
                                value: value
                            });
                        }
                    }
                }
                
                if (playersToAdd.length > 0) {
                    const loadingToast = toast.loading(`Importando ${playersToAdd.length} jugadores...`);
                    try {
                        const batch = writeBatch(db);
                        playersToAdd.forEach(player => {
                            const newPlayerRef = doc(collection(db, "players"));
                            batch.set(newPlayerRef, player);
                        });
                        await batch.commit();
                        toast.success(`${playersToAdd.length} jugadores importados con éxito!`, { id: loadingToast });

                        // Recargar jugadores
                        const querySnapshot = await getDocs(collection(db, 'players'));
                        const playersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        setPlayers(playersData.sort((a, b) => a.name.localeCompare(b.name)));
                    } catch (error) {
                        toast.error('Error durante la importación masiva.', { id: loadingToast });
                        console.error("Error batch importing players:", error);
                    }
                } else {
                    toast.error("El archivo CSV no contenía jugadores válidos.");
                }
            };
            reader.readAsText(file);
        }
    };

    if (loading) {
        return <LoadingSpinner fullScreen text="Cargando base de datos de jugadores..." />;
    }

    return (
        <div className="p-4 sm:p-6 md:p-8">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-200 mb-6">Base de Datos de Jugadores</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Columna de añadir jugador y búsqueda */}
                <div className="lg:col-span-1 space-y-8">
                    <div className="bento-card">
                        <h3 className="text-xl font-bold mb-4">Añadir Nuevo Jugador</h3>
                        <form onSubmit={handleAddPlayer} className="space-y-4">
                            <input type="text" placeholder="Nombre" value={newPlayer.name} onChange={e => setNewPlayer({ ...newPlayer, name: e.target.value })} className="input" />
                            <select value={newPlayer.position} onChange={e => setNewPlayer({ ...newPlayer, position: e.target.value })} className="input">
                                <option value="POR">Portero</option>
                                <option value="DEF">Defensa</option>
                                <option value="MED">Centrocampista</option>
                                <option value="DEL">Delantero</option>
                            </select>
                            <input type="text" placeholder="Equipo" value={newPlayer.team} onChange={e => setNewPlayer({ ...newPlayer, team: e.target.value })} className="input" />
                            <input type="number" placeholder="Valor" value={newPlayer.value} onChange={e => setNewPlayer({ ...newPlayer, value: e.target.value })} className="input" />
                            <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2"><Plus size={18} />Añadir Jugador</button>
                        </form>
                    </div>

                    <div className="bento-card">
                        <h3 className="text-xl font-bold mb-4">Importación Masiva</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Sube un archivo .csv con las columnas: name, position, team, value.</p>
                        <input type="file" accept=".csv" onChange={handleFileUpload} className="input" />
                    </div>

                </div>

                {/* Columna de lista de jugadores */}
                <div className="lg:col-span-2 bento-card">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-4">
                        <h3 className="text-xl font-bold">Lista de Jugadores ({filteredPlayers.length})</h3>
                        {/* --- CAMPO DE BÚSQUEDA --- */}
                        <div className="relative w-full sm:w-64">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o equipo..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="input pl-10"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                        <table className="w-full text-left">
                             <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800">
                                <tr>
                                    <th className="p-3 font-bold">Nombre</th>
                                    <th className="p-3 font-bold">Posición</th>
                                    <th className="p-3 font-bold">Equipo</th>
                                    <th className="p-3 font-bold">Valor</th>
                                    <th className="p-3 font-bold">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPlayers.map(player => (
                                    <tr key={player.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="p-3 font-medium">{player.name}</td>
                                        <td className="p-3">{player.position}</td>
                                        <td className="p-3">{player.team}</td>
                                        <td className="p-3">{player.value.toLocaleString('es-ES')} €</td>
                                        <td className="p-3 flex items-center gap-2">
                                            <button onClick={() => handleOpenEditModal(player)} className="text-blue-600 hover:text-blue-800"><Edit size={16} /></button>
                                            <button onClick={() => handleDeletePlayer(player.id, player.name)} className="text-red-600 hover:text-red-800"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {/* --- MENSAJE SI NO HAY RESULTADOS --- */}
                        {filteredPlayers.length === 0 && (
                             <div className="text-center py-12">
                                 <UserX size={48} className="mx-auto text-gray-400" />
                                 <p className="mt-4 font-semibold text-gray-700 dark:text-gray-300">No se encontraron jugadores</p>
                                 <p className="text-sm text-gray-500 dark:text-gray-400">Prueba a cambiar los términos de búsqueda.</p>
                             </div>
                        )}
                    </div>
                </div>
            </div>

            {isEditModalOpen && (
                <EditPlayerModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    player={editingPlayer}
                    onPlayerUpdated={handleUpdatePlayer}
                />
            )}
        </div>
    );
}