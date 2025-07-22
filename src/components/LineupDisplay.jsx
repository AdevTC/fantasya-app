import React from 'react';
import FootballPitch from './FootballPitch';
import PlayerSlot from './PlayerSlot';
import { formationLayouts } from '../utils/formationLayouts';
import toast from 'react-hot-toast';

const formations = [ '3-3-4', '3-4-3', '3-5-2', '3-6-1', '4-2-4', '4-3-3', '4-4-2', '4-5-1', '4-6-0', '5-2-3', '5-3-2', '5-4-1' ];

export default function LineupDisplay({ 
    lineupData,
    setLineupData,
    roundsData, 
    selectedRound, 
    onRoundChange, 
    onSlotClick,
    isEditable,
    onSetCaptain,
    captainSlot,
    onToggleActive
}) {
    const handleFormationChange = (newFormation) => {
        if (!isEditable) return;

        setLineupData(current => {
            const newLayout = formationLayouts[newFormation];
            const oldPlayers = Object.values(current.players || {});
            
            const playersByPos = {
                GK: oldPlayers.filter(p => p.positionAtTheTime === 'Portero'),
                DF: oldPlayers.filter(p => p.positionAtTheTime === 'Defensa'),
                MF: oldPlayers.filter(p => p.positionAtTheTime === 'Centrocampista'),
                FW: oldPlayers.filter(p => p.positionAtTheTime === 'Delantero'),
            };

            const newPlayersOnPitch = {};
            const remainingPlayers = [];

            Object.keys(newLayout).forEach(posType => {
                const slotsForPos = newLayout[posType]?.length || 0;
                for (let i = 0; i < slotsForPos; i++) {
                    const playerToPlace = playersByPos[posType]?.shift();
                    if (playerToPlace) {
                        newPlayersOnPitch[`players-${posType}-${i}`] = playerToPlace;
                    }
                }
            });
            
            Object.values(playersByPos).forEach(arr => remainingPlayers.push(...arr));

            const newBench = { ...current.bench };
            let playersDiscarded = 0;

            remainingPlayers.forEach(player => {
                const benchPos = player.positionAtTheTime === 'Portero' ? 'GK' : player.positionAtTheTime === 'Defensa' ? 'DF' : player.positionAtTheTime === 'Centrocampista' ? 'MF' : 'FW';
                if (!newBench[benchPos]) {
                    newBench[benchPos] = player;
                } else {
                    playersDiscarded++;
                }
            });
            
            if (playersDiscarded > 0) {
                toast.error(`${playersDiscarded} jugador(es) no caben en el nuevo esquema ni en el banquillo y han sido descartados.`);
            }

            return {
                ...current,
                formation: newFormation,
                players: newPlayersOnPitch,
                bench: newBench
            };
        });
    };
    
    return (
        <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-2 sm:p-6">
            <div className="flex flex-col sm:flex-row flex-wrap justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2"><label className="text-sm font-medium text-gray-700 dark:text-gray-300">Jornada:</label><select value={selectedRound} onChange={(e) => onRoundChange(Number(e.target.value))} className="input !w-auto !py-1" disabled={!roundsData || roundsData.length === 0}>{roundsData.length > 0 ? roundsData.map(r => <option key={r.id} value={r.roundNumber}>{r.roundNumber}</option>) : <option>{selectedRound}</option>}</select></div>
                    <div className="flex items-center gap-2"><label className="text-sm font-medium text-gray-700 dark:text-gray-300">Formación:</label><select value={lineupData?.formation || '4-4-2'} onChange={(e) => handleFormationChange(e.target.value)} className="input !w-auto !py-1" disabled={!isEditable}>{formations.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                </div>
            </div>
            <div className="mb-4">
                <h4 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-2 pl-2">Entrenador</h4>
                <div className="relative h-24 bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-lg flex items-center justify-center p-2">
                    <PlayerSlot 
                        player={lineupData?.coach || null} 
                        isEditable={isEditable} 
                        isInline={true} 
                        isCoach={true}
                        onClick={() => onSlotClick('coach-COACH')} 
                        onSetCaptain={() => onSetCaptain('coach-COACH')} 
                        isCaptain={captainSlot === 'coach-COACH'} 
                    />
                </div>
            </div>

            <div className="mt-6">
                 <h4 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-2 pl-2">11 de la Jornada</h4>
                 <div className="overflow-x-auto">
                    <FootballPitch formationLayout={formationLayouts[lineupData?.formation || '4-4-2']} lineup={lineupData?.players || {}} onSlotClick={onSlotClick} onSetCaptain={onSetCaptain} captainSlot={captainSlot} isEditable={isEditable}/>
                 </div>
            </div>

             <div className="mt-6">
                <h4 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-2 pl-2">Banquillo</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gradient-to-b from-gray-700 to-gray-800 rounded-lg p-4">
                    <div className="flex flex-col items-center gap-2"><span className="text-xs font-bold text-white/70">POR</span><PlayerSlot player={lineupData?.bench?.GK} isEditable={isEditable} isInline={true} onClick={() => onSlotClick('bench-GK')} onToggleActive={() => onToggleActive('bench-GK')} onSetCaptain={() => onSetCaptain('bench-GK')} isCaptain={captainSlot === 'bench-GK'} /></div>
                    <div className="flex flex-col items-center gap-2"><span className="text-xs font-bold text-white/70">DEF</span><PlayerSlot player={lineupData?.bench?.DF} isEditable={isEditable} isInline={true} onClick={() => onSlotClick('bench-DF')} onToggleActive={() => onToggleActive('bench-DF')} onSetCaptain={() => onSetCaptain('bench-DF')} isCaptain={captainSlot === 'bench-DF'} /></div>
                    <div className="flex flex-col items-center gap-2"><span className="text-xs font-bold text-white/70">CEN</span><PlayerSlot player={lineupData?.bench?.MF} isEditable={isEditable} isInline={true} onClick={() => onSlotClick('bench-MF')} onToggleActive={() => onToggleActive('bench-MF')} onSetCaptain={() => onSetCaptain('bench-MF')} isCaptain={captainSlot === 'bench-MF'} /></div>
                    <div className="flex flex-col items-center gap-2"><span className="text-xs font-bold text-white/70">DEL</span><PlayerSlot player={lineupData?.bench?.FW} isEditable={isEditable} isInline={true} onClick={() => onSlotClick('bench-FW')} onToggleActive={() => onToggleActive('bench-FW')} onSetCaptain={() => onSetCaptain('bench-FW')} isCaptain={captainSlot === 'bench-FW'} /></div>
                </div>
            </div>
        </div>
    );
}