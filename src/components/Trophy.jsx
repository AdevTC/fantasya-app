import React from 'react';
import { Award, DollarSign, TrendingUp, Shield, BarChart2, Star, Flame, ThumbsDown, UserCheck, Sofa, ShoppingCart } from 'lucide-react';

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
};

const Trophy = ({ achievement }) => {
    const { name, description, seasonName, leagueName } = achievement;
    const icon = trophyIcons[achievement.trophyId] || <BarChart2 />;

    return (
        <div className="relative group flex flex-col items-center text-center">
            <div className="text-4xl">{icon}</div>
            <p className="text-xs font-semibold mt-1 text-gray-700 dark:text-gray-300">{name}</p>
            <div className="absolute bottom-full mb-2 w-48 p-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10">
                <p className="font-bold">{name}</p>
                <p className="text-gray-300">{description}</p>
                <p className="text-xs italic mt-1 text-gray-400">{leagueName} - {seasonName}</p>
            </div>
        </div>
    );
};

export default Trophy;