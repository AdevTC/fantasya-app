import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import PlayerAutocomplete from './PlayerAutocomplete';

export default function EditSlotModal({ isOpen, onClose, onSave, initialData }) {
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [selectedTeam, setSelectedTeam] = useState('');
    const [selectedPosition, setSelectedPosition] = useState('');
    const [points, setPoints] = useState('');
    const [status, setStatus] = useState('por_definir');
    
    useEffect(() => {
        if (isOpen) {
            if (initialData?.playerId) {
                const playerWithHistory = { 
                    id: initialData.playerId, 
                    name: initialData.name, 
                    teamHistory: initialData.teamHistory || [], 
                    positionHistory: initialData.positionHistory || []
                };
                setSelectedPlayer(playerWithHistory);
                setSelectedTeam(initialData.teamAtTheTime || '');
                setSelectedPosition(initialData.positionAtTheTime || '');
                setPoints(initialData.points || '');
                setStatus(initialData.status || 'por_definir');
            } else {
                setSelectedPlayer(null); setPoints(''); setStatus('por_definir'); setSelectedTeam(''); setSelectedPosition('');
            }
        }
    }, [isOpen, initialData]);

    const handlePlayerSelected = (player) => {
        setSelectedPlayer(player);
        const currentTeam = player.teamHistory?.find(h => h.endDate === null)?.teamName || player.teamHistory?.[0]?.teamName || '';
        const currentPosition = player.positionHistory?.find(h => h.endDate === null)?.position || player.positionHistory?.[0]?.position || '';
        setSelectedTeam(currentTeam);
        setSelectedPosition(currentPosition);
    };

    const handleSave = () => {
        if (!selectedPlayer) { toast.error("Debes seleccionar un jugador de la lista."); return; }
        if (!selectedTeam || !selectedPosition) { toast.error("Debes seleccionar el equipo y la posición del jugador para esta jornada."); return; }
        
        onSave({
            playerId: selectedPlayer.id, name: selectedPlayer.name,
            teamHistory: selectedPlayer.teamHistory, positionHistory: selectedPlayer.positionHistory,
            teamAtTheTime: selectedTeam, positionAtTheTime: selectedPosition,
            points: Number(points) || 0,
            status: status, // El estado ahora se guarda para todos
            active: initialData?.active || false,
        });
        onClose();
    };

    const handleRemove = () => { onSave(null); onClose(); };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-lg">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">Añadir / Editar Jugador</h3>
                <div className="space-y-4">
                    <div><label className="label">1. Buscar Jugador</label><PlayerAutocomplete onPlayerSelect={handlePlayerSelected} initialValue={initialData?.name}/></div>
                    {selectedPlayer && (
                        <>
                            <div><label className="label">2. Equipo en esta jornada</label><select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} className="input"><option value="" disabled>Elige un equipo...</option>{selectedPlayer.teamHistory?.map((h, i) => (<option key={i} value={h.teamName}>{h.teamName}</option>))}</select></div>
                            <div><label className="label">3. Posición en esta jornada</label><select value={selectedPosition} onChange={e => setSelectedPosition(e.target.value)} className="input"><option value="" disabled>Elige una posición...</option>{selectedPlayer.positionHistory?.map((h, i) => (<option key={i} value={h.position}>{h.position}</option>))}</select></div>
                            <div><label className="label">4. Puntos Obtenidos</label><input type="number" value={points} onChange={e => setPoints(e.target.value)} className="input" placeholder="0"/></div>
                            <div><label className="label">5. Estado del Jugador</label><select value={status} onChange={e => setStatus(e.target.value)} className="input"><option value="por_definir">Por definir</option><option value="playing">Jugando</option><option value="did_not_play">No jugó</option><option value="not_called_up">No convocado</option></select></div>
                        </>
                    )}
                    <div className="flex justify-between items-center gap-4 pt-4">
                        {initialData?.playerId ? (<button type="button" onClick={handleRemove} className="btn-secondary !bg-red-100 !text-red-700 hover:!bg-red-200">Quitar Jugador</button>) : <div></div>}
                        <div className="flex gap-4"><button type="button" onClick={onClose} className="btn-secondary">Cancelar</button><button type="button" onClick={handleSave} className="btn-primary" disabled={!selectedPlayer}>Guardar</button></div>
                    </div>
                </div>
            </div>
        </div>
    );
}