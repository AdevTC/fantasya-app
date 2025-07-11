import React from 'react';
import FootballPitch from './FootballPitch';
import PlayerSlot from './PlayerSlot';

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

    const handleFormationChange = (newFormation) => { if (isEditable) { setLineupData(current => ({...current, formation: newFormation})); } };
    
    return (
        <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2"><label className="text-sm font-medium text-gray-700">Jornada:</label><select value={selectedRound} onChange={(e) => onRoundChange(Number(e.target.value))} className="input !w-auto !py-1" disabled={!roundsData || roundsData.length === 0}>{roundsData.length > 0 ? roundsData.map(r => <option key={r.id} value={r.roundNumber}>{r.roundNumber}</option>) : <option>{selectedRound}</option>}</select></div>
                    <div className="flex items-center gap-2"><label className="text-sm font-medium text-gray-700">Formación:</label><select value={lineupData?.formation || '4-4-2'} onChange={(e) => handleFormationChange(e.target.value)} className="input !w-auto !py-1" disabled={!isEditable}>{formations.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                </div>
            </div>
            <div className="mb-4">
                <h4 className="text-md font-semibold text-gray-700 mb-2 pl-2">Entrenador</h4>
                <div className="relative h-24 bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-lg flex items-center justify-center p-2">
                    <PlayerSlot player={lineupData?.coach || null} isEditable={isEditable} isInline={true} onClick={() => onSlotClick('coach-COACH')} onSetCaptain={() => onSetCaptain('coach-COACH')} isCaptain={captainSlot === 'coach-COACH'} onToggleActive={() => onToggleActive('coach-COACH')} />
                </div>
            </div>

            <div className="mt-6">
                 <h4 className="text-md font-semibold text-gray-700 mb-2 pl-2">11 de la Jornada</h4>
                 <FootballPitch formation={lineupData?.formation || '4-4-2'} lineup={lineupData?.players || {}} onSlotClick={onSlotClick} onSetCaptain={onSetCaptain} captainSlot={captainSlot} isEditable={isEditable}/>
            </div>

             <div className="mt-6">
                <h4 className="text-md font-semibold text-gray-700 mb-2 pl-2">Banquillo</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-lg p-4">
                    <div className="flex flex-col items-center"><span className="text-xs font-bold text-white/70 mb-1">POR</span><PlayerSlot player={lineupData?.bench?.GK} isEditable={isEditable} isInline={true} onClick={() => onSlotClick('bench-GK')} onToggleActive={() => onToggleActive('bench-GK')} onSetCaptain={() => onSetCaptain('bench-GK')} isCaptain={captainSlot === 'bench-GK'} /></div>
                    <div className="flex flex-col items-center"><span className="text-xs font-bold text-white/70 mb-1">DEF</span><PlayerSlot player={lineupData?.bench?.DF} isEditable={isEditable} isInline={true} onClick={() => onSlotClick('bench-DF')} onToggleActive={() => onToggleActive('DF')} onSetCaptain={() => onSetCaptain('bench-DF')} isCaptain={captainSlot === 'bench-DF'} /></div>
                    <div className="flex flex-col items-center"><span className="text-xs font-bold text-white/70 mb-1">CEN</span><PlayerSlot player={lineupData?.bench?.MF} isEditable={isEditable} isInline={true} onClick={() => onSlotClick('bench-MF')} onToggleActive={() => onToggleActive('MF')} onSetCaptain={() => onSetCaptain('bench-MF')} isCaptain={captainSlot === 'bench-MF'} /></div>
                    <div className="flex flex-col items-center"><span className="text-xs font-bold text-white/70 mb-1">DEL</span><PlayerSlot player={lineupData?.bench?.FW} isEditable={isEditable} isInline={true} onClick={() => onSlotClick('bench-FW')} onToggleActive={() => onToggleActive('FW')} onSetCaptain={() => onSetCaptain('bench-FW')} isCaptain={captainSlot === 'bench-FW'} /></div>
                </div>
            </div>
        </div>
    );
}