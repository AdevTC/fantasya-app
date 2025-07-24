import React from 'react';
import { Award, DollarSign, TrendingUp, Shield, BarChart2, Star, Flame, ThumbsDown, UserCheck, Sofa, ShoppingCart, Info } from 'lucide-react';

const trophyIcons = {
    CHAMPION: <Award className="text-yellow-500" />,
    RUNNER_UP: <Award className="text-gray-400" />,
    THIRD_PLACE: <Award className="text-orange-400" />,
    TOP_SCORER: <Star className="text-blue-500" />,
    MARKET_KING: <DollarSign className="text-emerald-500" />,
    LEAGUE_SHARK: <TrendingUp className="text-green-500" />,
    MOST_WINS: <Award className="text-blue-400" />,
    MOST_PODIUMS: <Award className="text-purple-400" />,
    MOST_REGULAR: <Shield className="text-gray-500" />,
    LANTERN_ROUGE: <Award className="text-red-400" />,
    STONE_HAND: <ThumbsDown className="text-stone-500" />,
    CAPTAIN_FANTASTIC: <UserCheck className="text-teal-500" />,
    GOLDEN_BENCH: <Sofa className="text-indigo-500" />,
    SPECULATOR: <ShoppingCart className="text-cyan-500" />,
    GALACTIC_SIGNING: <Star className="text-purple-500" />,
    COMEBACK_KING: <TrendingUp className="text-orange-500" />,
    STREAK_MASTER: <Flame className="text-red-500" />,
};

const Trophy = ({ achievement, count, onInfoClick }) => {
    const { name, description, wins } = achievement;
    const icon = trophyIcons[achievement.trophyId] || <BarChart2 />;

    return (
        <div className="relative group flex flex-col items-center text-center">
            {onInfoClick && (
                 <button 
                    onClick={(e) => { e.stopPropagation(); onInfoClick(); }}
                    className="absolute -top-2 -right-2 p-1 bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-blue-400 dark:hover:bg-blue-600 text-white transition-colors z-10"
                    title="Ver detalles"
                >
                    <Info size={12} />
                </button>
            )}
            <div className="text-4xl">{icon}</div>
            <p className="text-xs font-semibold mt-1 text-gray-700 dark:text-gray-300">{name}</p>
            
            <div className="absolute bottom-full mb-2 w-56 p-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
                <p className="font-bold">{name}</p>
                <p className="text-gray-300">{description}</p>
                {wins && wins.length > 0 && (
                    <div className="mt-2 border-t border-gray-600 pt-1">
                        {wins.map((win, index) => (
                            <p key={index} className="text-xs italic text-gray-400">{win.leagueName} - {win.seasonName}</p>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Trophy;