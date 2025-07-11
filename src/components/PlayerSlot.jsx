import React from 'react';
import { Plus, CheckCircle2, XCircle, MinusCircle, HelpCircle } from 'lucide-react';

export default function PlayerSlot({ player, position, onClick, onSetCaptain, isCaptain, isEditable, onToggleActive, isInline = false }) {
    const hasPlayer = player && player.name;

    const handleActionClick = (e, action) => {
        e.stopPropagation();
        if (isEditable && action) {
            action();
        }
    };
    
    let statusIcon = null;
    let borderColor = 'border-transparent';

    if (hasPlayer) {
        if (isCaptain) {
            borderColor = 'border-yellow-500';
        } else if (player.status === 'playing' || player.active) {
            borderColor = 'border-emerald-500';
        } else if (player.status === 'did_not_play') {
            borderColor = 'border-red-500';
        } else if (player.status === 'not_called_up') {
            borderColor = 'border-yellow-500';
        } else if (player.status === 'por_definir') {
            borderColor = 'border-gray-400';
        }
        
        // El botón 'T' es para suplentes y entrenador
        if (typeof onToggleActive === 'function') {
            statusIcon = (
                <button type="button" onClick={(e) => handleActionClick(e, onToggleActive)} title={player.active ? "Puntuación Activada" : "Puntuación Desactivada"} className={`absolute -bottom-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${player.active ? 'bg-emerald-500 text-white shadow-lg' : 'bg-gray-300 text-gray-600'} ${isEditable ? 'hover:bg-emerald-400' : 'cursor-default'}`}>
                    <span className="font-bold text-sm">T</span>
                </button>
            );
        } else if(player.status) { // El icono de estado es para los titulares
             switch (player.status) {
                case 'playing': statusIcon = <div title="Jugando" className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center"><CheckCircle2 size={16}/></div>; break;
                case 'did_not_play': statusIcon = <div title="No jugó" className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center"><XCircle size={16}/></div>; break;
                case 'not_called_up': statusIcon = <div title="No convocado" className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-yellow-500 text-white flex items-center justify-center"><MinusCircle size={16}/></div>; break;
                case 'por_definir': statusIcon = <div title="Por definir" className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-gray-400 text-white flex items-center justify-center"><HelpCircle size={16}/></div>; break;
                default: break;
            }
        }
    }

    return (
        <div className={`w-16 h-16 ${!isInline ? 'absolute' : 'relative'}`} style={position} onClick={onClick}>
            <div className={`relative w-full h-full rounded-full flex items-center justify-center text-center cursor-pointer transition-all duration-300 ease-in-out transform hover:scale-105 ${hasPlayer ? `bg-white/90 border-2 ${borderColor}` : 'bg-white/30 border-2 border-dashed border-white/60'}`}>
                {hasPlayer && onSetCaptain && (
                    <button type="button" onClick={(e) => handleActionClick(e, onSetCaptain)} title="Hacer Capitán" className={`absolute -bottom-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${isCaptain ? 'bg-yellow-500 text-white shadow-lg' : 'bg-gray-300 text-gray-600'} ${isEditable ? 'hover:bg-yellow-400' : 'cursor-default'}`}>
                        <span className="font-bold text-sm">C</span>
                    </button>
                )}
                {statusIcon}
                {hasPlayer ? (
                    <div className="flex flex-col items-center justify-center w-full px-1">
                        <p className="text-xs font-bold text-gray-800 whitespace-nowrap">{player.name}</p>
                        <p className="text-[10px] text-gray-500 whitespace-nowrap">{player.teamAtTheTime}</p>
                        <p className={`text-xs font-semibold ${isCaptain ? 'text-yellow-600' : 'text-emerald-600'}`}>{player.points || 0} pts</p>
                    </div>
                ) : (<Plus size={24} className="text-white/80" />)}
            </div>
        </div>
    );
}