import React from 'react';
import { Flame, ArrowUp, Zap, Crown, Gem, Shield, Info } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const featIcons = {
    RACHA_IMPARABLE: Flame,
    REY_DE_LA_REMONTADA: ArrowUp,
    DOMINIO_ABSOLUTO: Crown,
    FICHAJE_GALACTICO: Gem,
    OJO_DE_HALCON: Zap,
    default: Shield,
};

export default function FeatBadge({ feat, onInfoClick }) {
    if (!feat.instances || feat.instances.length === 0) {
        return null;
    }
    
    const firstInstance = feat.instances[0];
    const Icon = featIcons[feat.id] || featIcons.default;
    const count = feat.instances.length;

    return (
        <div className="relative group flex flex-col items-center text-center gap-2">
             <button 
                onClick={(e) => { e.stopPropagation(); onInfoClick(); }}
                className="absolute -top-2 -right-2 p-1 bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-blue-400 dark:hover:bg-blue-600 text-white transition-colors z-10"
                title="Ver detalles"
            >
                <Info size={12} />
            </button>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 group-hover:border-emerald-500 transition-colors text-emerald-500`}>
                <Icon className="w-8 h-8" />
            </div>
            <p className="font-bold text-sm text-gray-800 dark:text-gray-200">{firstInstance.challengeTitle}</p>
            {count > 1 && (
                <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900">
                    x{count}
                </span>
            )}
            
            <div className="absolute bottom-full mb-2 w-72 p-3 bg-gray-900 dark:bg-gray-700 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                <h4 className="font-bold border-b border-gray-600 pb-1 mb-2">{firstInstance.challengeTitle} ({count})</h4>
                <p className="text-gray-300 italic mb-2 text-xs">"{firstInstance.description}"</p>
                <ul className="space-y-1 max-h-40 overflow-y-auto text-xs pr-2">
                    {feat.instances.sort((a, b) => (b.date?.toDate() || 0) - (a.date?.toDate() || 0)).map((inst, index) => (
                        <li key={index} className="bg-gray-800 dark:bg-gray-600 p-1.5 rounded">
                            <span className="font-semibold">{inst.leagueName}</span> - {inst.seasonName}
                            <br/>
                            {inst.date && inst.date.toDate && (
                               <span className="text-gray-400">{format(inst.date.toDate(), 'dd MMM yyyy', { locale: es })}</span>
                            )}
                        </li>
                    ))}
                </ul>
                 <div className="absolute left-1/2 -translate-x-1/2 bottom-[-8px] w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-gray-900 dark:border-t-gray-700"></div>
            </div>
        </div>
    );
}