import React, { useState } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const positions = ['Portero', 'Defensa', 'Centrocampista', 'Delantero', 'Entrenador'];
const teams = ['Athletic Club', 'Atlético de Madrid', 'CA Osasuna', 'Deportivo Alavés', 'Elche CF', 'FC Barcelona', 'Getafe CF', 'Girona FC', 'Levante UD', 'Rayo Vallecano', 'RC Celta de Vigo', 'RCD Espanyol', 'RCD Mallorca', 'Real Betis Balompié', 'Real Madrid', 'Real Oviedo', 'Real Sociedad', 'Sevilla FC', 'Valencia CF', 'Villarreal CF'].sort();

export default function EditPlayerModal({ isOpen, onClose, player, onPlayerUpdated }) {
    const [newTeam, setNewTeam] = useState(teams[0]);
    const [newPosition, setNewPosition] = useState(positions[0]);
    const [loading, setLoading] = useState(false);

    if (!isOpen || !player) return null;

    const handleUpdateHistory = async (historyType, newValue) => {
        setLoading(true);
        const loadingToast = toast.loading('Actualizando historial...');

        const historyField = historyType === 'team' ? 'teamHistory' : 'positionHistory';
        const playerRef = doc(db, 'players', player.id);

        try {
            // Creamos una copia del historial para modificarla
            const updatedHistory = [...player[historyField]];
            
            // Encontramos la entrada actual (la que no tiene fecha de fin)
            const currentIndex = updatedHistory.findIndex(h => h.endDate === null);
            if (currentIndex !== -1) {
                // Le ponemos una fecha de fin a la entrada anterior
                updatedHistory[currentIndex].endDate = new Date();
            }

            // Añadimos la nueva entrada
            const newEntry = historyType === 'team'
                ? { teamName: newValue, startDate: new Date(), endDate: null }
                : { position: newValue, startDate: new Date(), endDate: null };
            
            updatedHistory.push(newEntry);

            await updateDoc(playerRef, {
                [historyField]: updatedHistory
            });

            toast.success('Historial actualizado', { id: loadingToast });
            onPlayerUpdated(); // Para refrescar la lista en la página principal
        } catch (error) {
            console.error("Error al actualizar historial:", error);
            toast.error("No se pudo actualizar el historial.", { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 w-full max-w-2xl shadow-lg">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">Editar Historial de: {player.name}</h3>
                
                <div className="grid md:grid-cols-2 gap-8">
                    {/* Sección Historial de Equipos */}
                    <div>
                        <h4 className="font-semibold mb-2">Historial de Equipos</h4>
                        <div className="space-y-2 border rounded-lg p-2 max-h-40 overflow-y-auto">
                            {player.teamHistory?.map((h, i) => (
                                <p key={i} className="text-sm text-gray-600">{h.teamName} (Desde: {h.startDate ? format(h.startDate.toDate(), 'dd/MM/yyyy') : 'N/A'})</p>
                            ))}
                        </div>
                        <div className="mt-4 space-y-2">
                             <select value={newTeam} onChange={e => setNewTeam(e.target.value)} className="input">{teams.map(t => <option key={t} value={t}>{t}</option>)}</select>
                             <button onClick={() => handleUpdateHistory('team', newTeam)} disabled={loading} className="btn-secondary w-full text-sm">Añadir nuevo equipo</button>
                        </div>
                    </div>
                    {/* Sección Historial de Posiciones */}
                    <div>
                        <h4 className="font-semibold mb-2">Historial de Posiciones</h4>
                        <div className="space-y-2 border rounded-lg p-2 max-h-40 overflow-y-auto">
                            {player.positionHistory?.map((h, i) => (
                                <p key={i} className="text-sm text-gray-600">{h.position} (Desde: {h.startDate ? format(h.startDate.toDate(), 'dd/MM/yyyy') : 'N/A'})</p>
                            ))}
                        </div>
                         <div className="mt-4 space-y-2">
                             <select value={newPosition} onChange={e => setNewPosition(e.target.value)} className="input">{positions.map(p => <option key={p} value={p}>{p}</option>)}</select>
                             <button onClick={() => handleUpdateHistory('position', newPosition)} disabled={loading} className="btn-secondary w-full text-sm">Añadir nueva posición</button>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-6 mt-6 border-t">
                    <button onClick={onClose} className="btn-primary">Cerrar</button>
                </div>
            </div>
        </div>
    );
}