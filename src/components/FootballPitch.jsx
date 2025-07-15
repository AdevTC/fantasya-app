import React from 'react';
import PlayerSlot from './PlayerSlot';
import { formationLayouts } from '../utils/formationLayouts'; // <-- Importamos desde el nuevo archivo

export default function FootballPitch({ formation, lineup, onSlotClick, onSetCaptain, captainSlot, isEditable }) {
    const layout = formationLayouts[formation] || formationLayouts['4-4-2'];

    const renderSlots = () => {
        const allSlots = [];
        if (!layout) return allSlots;

        Object.keys(layout).forEach(posType => {
            layout[posType].forEach((position, index) => {
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
        <div className="bg-green-600 bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-lg h-[500px] md:h-[600px] relative overflow-hidden shadow-inner">
            <div className="absolute top-0 left-1/2 w-px h-full bg-white/20"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 md:w-40 md:h-40 border-2 border-white/20 rounded-full"></div>
            <div className="absolute top-0 left-0 w-full h-12 md:h-16 border-b-2 border-white/20"></div>
            <div className="absolute bottom-0 left-0 w-full h-12 md:h-16 border-t-2 border-white/20"></div>
            {renderSlots()}
        </div>
    );
}
