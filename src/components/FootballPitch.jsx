import React from 'react';
import PlayerSlot from './PlayerSlot';

export default function FootballPitch({ formationLayout, lineup, onSlotClick, onSetCaptain, captainSlot, isEditable }) {
    
    const renderSlots = () => {
        const allSlots = [];
        if (!formationLayout) return allSlots;

        Object.keys(formationLayout).forEach(posType => {
            formationLayout[posType].forEach((position, index) => {
                const slotId = `players-${posType}-${index}`;
                allSlots.push(
                    <PlayerSlot 
                        key={slotId} 
                        position={position}
                        player={lineup[slotId] || null}
                        onClick={() => onSlotClick(slotId)}
                        onSetCaptain={() => onSetCaptain(slotId)}
                        isCaptain={captainSlot === slotId}
                        isEditable={isEditable}
                    />
                );
            });
        });
        return allSlots;
    };

    return (
        <div className="bg-green-600 bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-lg h-[500px] relative overflow-hidden shadow-inner">
            {/* --- LÍNEAS RESPONSIVAS --- */}
            <div className="absolute top-0 left-1/2 w-px h-full bg-white/20"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-40 h-40 border-2 border-white/20 rounded-full"></div>
            {/* Áreas (Porterías) Corregidas */}
            <div className="absolute top-1/2 left-0 -translate-y-1/2 w-24 h-48 rounded-r-lg border-t-2 border-b-2 border-r-2 border-white/20"></div>
            <div className="absolute top-1/2 right-0 -translate-y-1/2 w-24 h-48 rounded-l-lg border-t-2 border-b-2 border-l-2 border-white/20"></div>
            
            {renderSlots()}
        </div>
    );
}