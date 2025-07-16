import React, { useState, useMemo, useEffect } from 'react';
import { db, auth } from '../config/firebase';
import { Link } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { Award, Star, TrendingUp, Zap, Scale, Filter, ChevronsUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { useTheme } from '../context/ThemeContext';

const StatHighlightCard = ({ title, value, subValue, colorClass, icon }) => (
    <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6 h-full flex flex-col justify-between">
        <div>
            <div className="flex justify-between items-start">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200">{title}</h4>
                <div className={`text-xl ${colorClass}`}>{icon}</div>
            </div>
            <p className={`text-3xl font-bold ${colorClass} mt-2`}>{value}</p>
        </div>
        {subValue && <p className="text-sm text-gray-500 dark:text-gray-400 truncate" title={subValue}>{subValue}</p>}
    </div>
);

const calculateStandardDeviation = (array) => {
    const n = array.length;
    if (n < 2) return 0;
    const mean = array.reduce((a, b) => a + b) / n;
    return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / (n - 1));
};

const formatHolderNames = (names) => {
    if (!names || names.length === 0) return 'N/A';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names.join(' y ');
    const allButLast = names.slice(0, -1);
    const last = names[names.length - 1];
    return `${allButLast.join(', ')}, y ${last}`;
};

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F', '#FFBB28', '#FF8042', '#0088FE', '#A4DE6C', '#DE6C8A'];
const PODIUM_COLORS = { Oro: '#FFD700', Plata: '#C0C0C0', Bronce: '#CD7F32' };

export default function StatsTab({ season, roundsData }) {
    const { theme } = useTheme();
    const tickColor = theme === 'dark' ? '#9ca3af' : '#6b7280';
    const gridColor = theme === 'dark' ? '#374151' : '#e5e7eb';
    
    const userId = auth.currentUser?.uid;
    const memberCount = season?.members ? Object.keys(season.members).length : 0;
    const [sortConfig, setSortConfig] = useState({ key: 'totalPoints', direction: 'desc' });
    const [positionSortConfig, setPositionSortConfig] = useState({ key: 'participations', direction: 'desc' });
    const [startRound, setStartRound] = useState(1);
    const [endRound, setEndRound] = useState(roundsData.length > 0 ? roundsData.length : 1);
    const memberIds = season?.members ? Object.keys(season.members) : [];
    const [selectedPlayer, setSelectedPlayer] = useState(userId || memberIds[0] || '');
    const [player1, setPlayer1] = useState(memberIds[0] || '');
    const [player2, setPlayer2] = useState(memberIds[1] || '');

    useEffect(() => {
        if (roundsData && roundsData.length > 0) {
            setEndRound(roundsData.length);
        }
    }, [roundsData]);
    
    const { detailedPlayerStats, positionStats, headToHeadStats, leagueRecords, scoreDistribution, playerConsistencyData, podiumDistributionForPie, lastPlaceFinishes, nonScoringRoundsData } = useMemo(() => {
        if (!roundsData || roundsData.length === 0 || !season || !season.members) {
            return { detailedPlayerStats: [], positionStats: [], headToHeadStats: {}, leagueRecords: {}, scoreDistribution: [], playerConsistencyData: [], podiumDistributionForPie: [], lastPlaceFinishes: [], nonScoringRoundsData: [] };
        }
        
        const stats = {};
        Object.entries(season.members).forEach(([uid, data]) => {
            stats[uid] = { uid, name: data.teamName, username: data.username, scores: [], totalPoints: 0, weeksAtNum1: 0, weeksInPodium: 0, weeksInTop5: 0, roundFinishes: Array(memberCount).fill(0), lastPlaces: 0, participations: 0, h2h: {}, nonScoringRounds: 0 };
            Object.keys(season.members).forEach(opId => { if (opId !== uid) stats[uid].h2h[opId] = 0; });
        });

        const cumulativeScores = {};
        roundsData.forEach(round => {
            const scoresForRound = round.scores || {};
            const participatingUids = Object.keys(scoresForRound).filter(uid => typeof scoresForRound[uid] === 'number' && stats[uid]);
            
            Object.entries(scoresForRound).forEach(([uid, score]) => {
                if(stats[uid]) {
                    if (typeof score === 'number') {
                        stats[uid].scores.push(score);
                        stats[uid].totalPoints += score;
                        stats[uid].participations++;
                    } else if (String(score).toUpperCase() === 'NR' || String(score).toUpperCase() === 'NO11') {
                        stats[uid].nonScoringRounds++;
                    }
                }
            });

            participatingUids.forEach(uid1 => {
                participatingUids.forEach(uid2 => {
                    if (uid1 !== uid2 && scoresForRound[uid1] > scoresForRound[uid2]) {
                        stats[uid1].h2h[uid2]++;
                    }
                });
            });

            const rankedRound = participatingUids.map(uid => ({ uid, points: scoresForRound[uid] })).sort((a,b) => b.points - a.points);
            if (rankedRound.length > 0) {
                const lowestScore = rankedRound[rankedRound.length - 1].points;
                rankedRound.forEach((p, index) => {
                    let rank = index;
                    while(rank > 0 && rankedRound[rank - 1].points === p.points) { rank--; }
                    stats[p.uid].roundFinishes[rank]++;
                    if (p.points === lowestScore) stats[p.uid].lastPlaces++;
                });
            }

            Object.keys(stats).forEach(uid => cumulativeScores[uid] = stats[uid].totalPoints);
            const rankedGeneral = Object.keys(cumulativeScores).map(uid => ({uid, points: cumulativeScores[uid]})).sort((a,b) => b.points - a.points);
            rankedGeneral.forEach((p, index) => {
                let rank = index;
                while(rank > 0 && rankedGeneral[rank - 1].points === p.points) { rank--; }
                if (rank === 0) stats[p.uid].weeksAtNum1++;
                if (rank < 3) stats[p.uid].weeksInPodium++;
                if (rank < 5) stats[p.uid].weeksInTop5++;
            });
        });

        const finalDetailedStats = Object.values(stats).map(p => {
            const participations = p.scores.length;
            const best = participations > 0 ? Math.max(...p.scores) : 0;
            const worst = participations > 0 ? Math.min(...p.scores) : 0;
            const averageNum = participations > 0 ? (p.totalPoints / participations) : 0;
            const regularityNum = calculateStandardDeviation(p.scores);
            const avgPos = p.participations > 0 ? (p.roundFinishes.reduce((sum, count, i) => sum + (count * (i + 1)), 0) / p.participations) : 0;
            return { ...p, best, worst, average: averageNum.toFixed(1), regularity: regularityNum.toFixed(2), averagePosition: avgPos > 0 ? avgPos.toFixed(2) : 'N/A' };
        });

        const finalPositionStats = Object.values(stats).map(p => ({
            name: p.name, username: p.username, positionCounts: p.roundFinishes, podiums: p.roundFinishes.slice(0,3).reduce((a,b) => a + b, 0), top5: p.roundFinishes.slice(0,5).reduce((a,b) => a + b, 0), top10: p.roundFinishes.slice(0,10).reduce((a,b) => a + b, 0), lastPlaces: p.lastPlaces, participations: p.participations,
        }));
        
        const finalH2HStats = {};
        Object.values(stats).forEach(p => { finalH2HStats[p.uid] = { name: p.name, username: p.username, wins: p.h2h }; });

        const mostWinsValue = Math.max(0, ...finalPositionStats.map(p => p.positionCounts[0]));
        const mostWinsHolders = finalPositionStats.filter(p => p.positionCounts[0] === mostWinsValue).map(p => p.name);
        const mostPodiumsValue = Math.max(0, ...finalPositionStats.map(p => p.podiums));
        const mostPodiumsHolders = finalPositionStats.filter(p => p.podiums === mostPodiumsValue).map(p => p.name);
        const bestScoreRecordValue = Math.max(0, ...finalDetailedStats.map(p => p.best));
        const bestScoreHolders = finalDetailedStats.filter(p => p.best === bestScoreRecordValue).map(p => p.name);
        const mostRegularValue = Math.min(...finalDetailedStats.filter(p=>p.participations > 1).map(p => parseFloat(p.regularity)));
        const mostRegularHolders = finalDetailedStats.filter(p => parseFloat(p.regularity) === mostRegularValue).map(p => p.name);

        const records = { bestScore: { value: bestScoreRecordValue, holders: bestScoreHolders }, mostWins: { value: mostWinsValue, holders: mostWinsHolders }, mostPodiums: { value: mostPodiumsValue, holders: mostPodiumsHolders }, mostRegular: { value: mostRegularValue, holders: mostRegularHolders } };
        
        const scoreBrackets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81+': 0 };
        finalDetailedStats.forEach(p => p.scores.forEach(score => { if (score <= 20) scoreBrackets['0-20']++; else if (score <= 40) scoreBrackets['21-40']++; else if (score <= 60) scoreBrackets['41-60']++; else if (score <= 80) scoreBrackets['61-80']++; else scoreBrackets['81+']++; }));
        const finalScoreDistribution = Object.entries(scoreBrackets).map(([name, value]) => ({ name, value }));

        const consistencyData = finalDetailedStats.map(p => ({ subject: p.name, A: parseFloat(p.average), B: p.best, fullMark: Math.max(...finalDetailedStats.map(stat => stat.best)) }));

        const totalPodiums = finalPositionStats.reduce((acc, p) => { acc.Oro += p.positionCounts[0] || 0; acc.Plata += p.positionCounts[1] || 0; acc.Bronce += p.positionCounts[2] || 0; return acc; }, { Oro: 0, Plata: 0, Bronce: 0 });
        const podiumDistributionForPie = Object.entries(totalPodiums).map(([name, value]) => ({ name, value })).filter(item => item.value > 0);
        
        const lastPlacesData = finalPositionStats.map(p => ({name: p.name, 'Último Puesto': p.lastPlaces})).filter(p => p['Último Puesto'] > 0).sort((a,b) => b['Último Puesto'] - a['Último Puesto']);
        const nonScoringData = finalDetailedStats.map(p => ({name: p.name, 'Jornadas sin puntuar': p.nonScoringRounds})).filter(p => p['Jornadas sin puntuar'] > 0).sort((a,b) => b['Jornadas sin puntuar'] - a['Jornadas sin puntuar']);

        return { detailedPlayerStats: finalDetailedStats, positionStats: finalPositionStats, headToHeadStats: finalH2HStats, leagueRecords: records, scoreDistribution: finalScoreDistribution, playerConsistencyData: consistencyData, podiumDistributionForPie, lastPlaceFinishes: lastPlacesData, nonScoringRoundsData: nonScoringData };
    }, [roundsData, season, memberCount]);

    const sortedDetailedPlayerStats = useMemo(() => {
        let sortableItems = [...detailedPlayerStats];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                if (sortConfig.key === 'name') {
                    return sortConfig.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
                }
                const valA = a[sortConfig.key] === 'N/A' ? (sortConfig.direction === 'asc' ? Infinity : -Infinity) : parseFloat(a[sortConfig.key]);
                const valB = b[sortConfig.key] === 'N/A' ? (sortConfig.direction === 'asc' ? Infinity : -Infinity) : parseFloat(b[sortConfig.key]);
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [detailedPlayerStats, sortConfig]);

    const sortedPositionStats = useMemo(() => {
        let sortableItems = [...positionStats];
        if (positionSortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                const valA = positionSortConfig.key === 'name' ? a.name : a[positionSortConfig.key] ?? a.positionCounts[positionSortConfig.key];
                const valB = positionSortConfig.key === 'name' ? b.name : b[positionSortConfig.key] ?? b.positionCounts[positionSortConfig.key];

                if (typeof valA === 'string') {
                    return positionSortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                }
                if (valA < valB) return positionSortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return positionSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [positionStats, positionSortConfig]);


    const requestSort = (key) => { let direction = 'desc'; if (sortConfig.key === key && sortConfig.direction === 'desc') { direction = 'asc'; } setSortConfig({ key, direction }); };
    const requestPositionSort = (key) => { let direction = 'desc'; if (positionSortConfig.key === key && positionSortConfig.direction === 'desc') { direction = 'asc'; } setPositionSortConfig({ key, direction }); };
    
    const getSortIndicator = (key, type = 'main') => {
        const config = type === 'main' ? sortConfig : positionSortConfig;
        if (config.key !== key) return <ChevronsUpDown size={14} className="ml-1 text-gray-400" />;
        if (config.direction === 'asc') return <ArrowUp size={14} className="ml-1 text-gray-800 dark:text-gray-200" />;
        return <ArrowDown size={14} className="ml-1 text-gray-800 dark:text-gray-200" />;
    };
    
    const { sanitizedPointsEvolution, sanitizedPositionEvolution, sanitizedPlayerPerformance, sanitizedH2hChart } = useMemo(() => {
        if (!season || !season.members) return { sanitizedPointsEvolution: [], sanitizedPositionEvolution: [], sanitizedPlayerPerformance: [], sanitizedH2hChart: [] };
    
        const pointsEvolution = [];
        const positionEvolution = [];
        const playerPerformance = [];
        const h2hEvolution = [];
    
        const cumulativeScores = {};
        const h2hCumulative = {};
        Object.keys(season.members).forEach(uid => {
            cumulativeScores[uid] = 0;
            if (uid === player1 || uid === player2) h2hCumulative[uid] = 0;
        });
    
        const filteredRounds = roundsData.slice(startRound - 1, endRound);
    
        filteredRounds.forEach(round => {
            const scoresForRound = round.scores || {};
            let roundTotal = 0;
            let roundParticipants = 0;
    
            Object.keys(season.members).forEach(uid => {
                const score = scoresForRound[uid];
                if (typeof score === 'number') {
                    cumulativeScores[uid] += score;
                    if (h2hCumulative[uid] !== undefined) h2hCumulative[uid] += score;
                    roundTotal += score;
                    roundParticipants++;
                }
            });
    
            const rankedPlayers = Object.keys(cumulativeScores).map(uid => ({ uid, points: cumulativeScores[uid] })).sort((a, b) => b.points - a.points);
            const roundRanks = {};
            rankedPlayers.forEach((player, index) => {
                let rank = index + 1;
                if (index > 0 && player.points === rankedPlayers[index - 1].points) {
                    rank = roundRanks[rankedPlayers[index - 1].uid];
                }
                roundRanks[player.uid] = rank;
            });
    
            const pointsDataPoint = { name: `J${round.roundNumber}` };
            const positionDataPoint = { name: `J${round.roundNumber}` };
            Object.keys(season.members).forEach(uid => {
                pointsDataPoint[season.members[uid].teamName] = cumulativeScores[uid];
                positionDataPoint[season.members[uid].teamName] = roundRanks[uid];
            });
            pointsEvolution.push(pointsDataPoint);
            positionEvolution.push(positionDataPoint);
    
            const selectedPlayerScore = scoresForRound[selectedPlayer];
            playerPerformance.push({
                name: `J${round.roundNumber}`,
                "Puntos del Jugador": typeof selectedPlayerScore === 'number' ? selectedPlayerScore : null,
                "Media de la Liga": roundParticipants > 0 ? parseFloat((roundTotal / roundParticipants).toFixed(1)) : null,
            });
    
            if (player1 && player2 && season.members[player1] && season.members[player2]) {
                h2hEvolution.push({
                    name: `J${round.roundNumber}`,
                    [season.members[player1].teamName]: h2hCumulative[player1],
                    [season.members[player2].teamName]: h2hCumulative[player2],
                });
            }
        });
    
        return { sanitizedPointsEvolution: pointsEvolution, sanitizedPositionEvolution: positionEvolution, sanitizedPlayerPerformance: playerPerformance, sanitizedH2hChart: h2hEvolution };
    }, [roundsData, season.members, userId, selectedPlayer, player1, player2, startRound, endRound]);
    
    const memberColors = useMemo(() => {
        if (!season || !season.members) return {};
        const assignedColors = {};
        Object.keys(season.members).forEach((uid, index) => { assignedColors[season.members[uid].teamName] = COLORS[index % COLORS.length]; });
        return assignedColors;
    }, [season.members]);

    if (!detailedPlayerStats || !leagueRecords) {
        return <LoadingSpinner text="Calculando estadísticas avanzadas..." />;
    }

    return (
        <div className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                 <StatHighlightCard title="Récord de Puntos" value={`${leagueRecords.bestScore?.value || 0} pts`} subValue={`por ${formatHolderNames(leagueRecords.bestScore?.holders || [])}`} colorClass="text-energetic-orange" icon={<Zap/>}/>
                 <StatHighlightCard title="Más Victorias de Jornada" value={`${leagueRecords.mostWins?.value || 0}`} subValue={`por ${formatHolderNames(leagueRecords.mostWins?.holders || [])}`} colorClass="text-yellow-500" icon={<Award/>}/>
                 <StatHighlightCard title="Más Podios de Jornada" value={`${leagueRecords.mostPodiums?.value || 0}`} subValue={`por ${formatHolderNames(leagueRecords.mostPodiums?.holders || [])}`} colorClass="text-vibrant-purple" icon={<Star/>}/>
                 <StatHighlightCard title="Más Regular (σ)" value={`${leagueRecords.mostRegular.value ? leagueRecords.mostRegular.value.toFixed(2) : 'N/A'}`} subValue={`por ${formatHolderNames(leagueRecords.mostRegular?.holders || [])}`} colorClass="text-deep-blue" icon={<Scale/>}/>
            </div>

            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700">
                <div className="p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Estadísticas Detalladas por Jugador</h3></div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/60"><tr className="border-b dark:border-gray-700">
                            <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestSort('name')} className="flex items-center">Jugador {getSortIndicator('name')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestSort('averagePosition')} className="flex items-center justify-center w-full">Pos. Media {getSortIndicator('averagePosition')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestSort('totalPoints')} className="flex items-center justify-center w-full">Total Pts {getSortIndicator('totalPoints')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestSort('average')} className="flex items-center justify-center w-full">Media Pts {getSortIndicator('average')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestSort('best')} className="flex items-center justify-center w-full">Mejor Jornada {getSortIndicator('best')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestSort('worst')} className="flex items-center justify-center w-full">Peor Jornada {getSortIndicator('worst')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestSort('regularity')} className="flex items-center justify-center w-full">Regularidad {getSortIndicator('regularity')}</button></th>
                        </tr></thead>
                        <tbody className="divide-y dark:divide-gray-700">
                            {sortedDetailedPlayerStats.map(member => (
                                <tr key={member.uid} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td className="p-3 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap"><Link to={`/profile/${member.username}`} className="hover:text-deep-blue dark:hover:text-blue-400 hover:underline">{member.name}</Link></td>
                                    <td className="p-3 text-center font-mono text-gray-600 dark:text-gray-300">{member.averagePosition}</td>
                                    <td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-200">{member.totalPoints}</td>
                                    <td className="p-3 text-center font-mono font-bold text-blue-600 dark:text-blue-400">{member.average}</td>
                                    <td className="p-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{member.best}</td>
                                    <td className="p-3 text-center font-mono font-bold text-red-600 dark:text-red-500">{member.worst}</td>
                                    <td className="p-3 text-center font-mono text-gray-600 dark:text-gray-300">{member.regularity}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700"><div className="p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Resumen de Posiciones por Jornada</h3></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 dark:bg-gray-800/60"><tr className="border-b dark:border-gray-700"><th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-800/60 z-10"><button onClick={() => requestPositionSort('name')} className="flex items-center">Participante {getSortIndicator('name', 'pos')}</button></th>{Array.from({ length: memberCount }, (_, i) => i).map(pos => (<th key={pos} className={`p-3 text-center font-semibold text-gray-600 dark:text-gray-300 ${pos < 3 ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}><button onClick={() => requestPositionSort(pos)} className="flex items-center justify-center w-full">{pos+1}º {getSortIndicator(pos, 'pos')}</button></th>))}<th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20"><button onClick={() => requestPositionSort('podiums')} className="flex items-center justify-center w-full">Podios {getSortIndicator('podiums', 'pos')}</button></th><th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20"><button onClick={() => requestPositionSort('top5')} className="flex items-center justify-center w-full">Top 5 {getSortIndicator('top5', 'pos')}</button></th><th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20"><button onClick={() => requestPositionSort('top10')} className="flex items-center justify-center w-full">Top 10 {getSortIndicator('top10', 'pos')}</button></th><th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300 bg-red-50 dark:bg-red-900/20"><button onClick={() => requestPositionSort('lastPlaces')} className="flex items-center justify-center w-full">Último {getSortIndicator('lastPlaces', 'pos')}</button></th><th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300 bg-emerald-50 dark:bg-emerald-900/20"><button onClick={() => requestPositionSort('participations')} className="flex items-center justify-center w-full">Participaciones {getSortIndicator('participations', 'pos')}</button></th></tr></thead><tbody className="divide-y dark:divide-gray-700">{sortedPositionStats.map(member => (<tr key={member.name} className="hover:bg-gray-50 dark:hover:bg-gray-800"><td className="p-3 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 z-10"><Link to={`/profile/${member.username}`} className="hover:text-deep-blue dark:hover:text-blue-400 hover:underline">{member.name}</Link></td>{member.positionCounts.map((count, index) => (<td key={index} className={`p-3 text-center font-mono ${count > 0 ? 'font-bold text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'} ${index < 3 ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}>{count}</td>))}<td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-200 bg-blue-50 dark:bg-blue-900/20">{member.podiums}</td><td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-200 bg-blue-50 dark:bg-blue-900/20">{member.top5}</td><td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-200 bg-blue-50 dark:bg-blue-900/20">{member.top10}</td><td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-200 bg-red-50 dark:bg-red-900/20">{member.lastPlaces}</td><td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-200 bg-emerald-50 dark:bg-emerald-900/20">{member.participations}</td></tr>))}</tbody></table></div></div>
            
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700"><div className="p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Cara a Cara (Victorias por jornada)</h3><p className="text-sm text-gray-500 dark:text-gray-400 mb-4">El número indica las victorias del jugador de la fila sobre el de la columna.</p></div><div className="overflow-x-auto px-6 pb-6"><table className="w-full text-sm border-collapse table-fixed"><thead className="bg-gray-50 dark:bg-gray-800/60"><tr><th className="p-2 border dark:border-gray-700 sticky left-0 bg-gray-50 dark:bg-gray-800/60 z-10 font-semibold text-gray-600 dark:text-gray-300 w-32">vs</th>{Object.values(season.members).map(m => <th key={m.teamName} className="p-1.5 border dark:border-gray-700 align-bottom h-24 w-12"><div className="transform -rotate-45 origin-bottom-left whitespace-nowrap font-semibold text-gray-600 dark:text-gray-300 text-xs"><span>{m.teamName}</span></div></th>)}</tr></thead><tbody className="divide-y dark:divide-gray-700">{Object.entries(headToHeadStats).map(([uid, data]) => (<tr key={uid} className="hover:bg-gray-50 dark:hover:bg-gray-800"><td className="p-2 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 z-10 border dark:border-gray-700"><Link to={`/profile/${data.username}`} className="hover:text-deep-blue dark:hover:text-blue-400 hover:underline">{data.name}</Link></td>{Object.keys(season.members).map(opponentUid => { if (uid === opponentUid) return <td key={opponentUid} className="p-2 text-center font-mono bg-gray-200 dark:bg-gray-700 border dark:border-gray-600">X</td>; const wins = data.wins[opponentUid] || 0; const losses = headToHeadStats[opponentUid]?.wins[uid] || 0; let bgColor = 'bg-white dark:bg-gray-800/50'; if (wins > losses) bgColor = 'bg-emerald-100 dark:bg-emerald-900/30'; else if (losses > wins) bgColor = 'bg-red-100 dark:bg-red-900/30'; else if (wins === losses && wins > 0) bgColor = 'bg-yellow-100 dark:bg-yellow-900/30'; return <td key={opponentUid} title={`${data.name} ${wins} - ${losses} ${headToHeadStats[opponentUid]?.name}`} className={`p-2 text-center font-mono border dark:border-gray-700 ${bgColor} transition-colors`}>{wins}</td> })}</tr>))}</tbody></table></div></div>
            
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"> <div className="flex items-center gap-2 mb-4"><Filter size={18} className="text-gray-600 dark:text-gray-400" /><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Filtros para Gráficos de Evolución</h3></div> <div className="flex flex-wrap items-center gap-4"><div className="flex items-center gap-2"><label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Desde Jornada:</label><select value={startRound} onChange={e => setStartRound(Number(e.target.value))} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">{Array.from({ length: roundsData.length }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}</select></div><div className="flex items-center gap-2"><label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Hasta Jornada:</label><select value={endRound} onChange={e => setEndRound(Number(e.target.value))} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">{Array.from({ length: roundsData.length }, (_, i) => i + 1).filter(r => r >= startRound).map(r => <option key={r} value={r}>{r}</option>)}</select></div></div> </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Evolución de Puntos Totales</h3><ResponsiveContainer width="100%" height={300}><LineChart data={sanitizedPointsEvolution}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="name" tick={{ fill: tickColor }} /><YAxis tick={{ fill: tickColor }} domain={['dataMin - 20', 'dataMax + 20']}/><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }} /><Legend wrapperStyle={{ color: tickColor }}/><>{Object.keys(memberColors).map(name => (<Line key={name} type="monotone" dataKey={name} stroke={memberColors[name]} strokeWidth={2} dot={false} activeDot={{ r: 6 }}/>))}</></LineChart></ResponsiveContainer></div>
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Evolución de Posiciones</h3><ResponsiveContainer width="100%" height={300}><LineChart data={sanitizedPositionEvolution}><CartesianGrid strokeDasharray="3 3" stroke={gridColor}/><XAxis dataKey="name" tick={{ fill: tickColor }} /><YAxis reversed={true} domain={[1, 'dataMax + 1']} allowDecimals={false} tick={{ fill: tickColor }}/><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }}/><Legend wrapperStyle={{ color: tickColor }}/><>{Object.keys(memberColors).map(name => (<Line key={name} type="monotone" dataKey={name} stroke={memberColors[name]} strokeWidth={2} dot={false} activeDot={{ r: 6 }}/>))}</></LineChart></ResponsiveContainer></div>
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Rendimiento vs. Media</h3><select value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">{Object.entries(season.members).map(([uid, member]) => <option key={uid} value={uid}>{member.teamName}</option>)}</select></div><ResponsiveContainer width="100%" height={300}><LineChart data={sanitizedPlayerPerformance}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="name" tick={{ fill: tickColor }} /><YAxis tick={{ fill: tickColor }} /><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }} /><Legend wrapperStyle={{ color: tickColor }} /><Line connectNulls type="monotone" dataKey="Puntos del Jugador" name={season.members[selectedPlayer]?.teamName} stroke="#8884d8" strokeWidth={2} dot={false} activeDot={{ r: 6 }}/><Line connectNulls type="monotone" dataKey="Media de la Liga" stroke="#82ca9d" strokeWidth={2} dot={false} activeDot={{ r: 6 }}/></LineChart></ResponsiveContainer></div>
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><div className="mb-4"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Comparativa de Jugadores</h3><div className="flex gap-4 mt-2"><select value={player1} onChange={e => setPlayer1(e.target.value)} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">{Object.entries(season.members).map(([uid, member]) => { if(uid === player2) return null; return <option key={uid} value={uid}>{member.teamName}</option>})}</select><select value={player2} onChange={e => setPlayer2(e.target.value)} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">{Object.entries(season.members).map(([uid, member]) => { if(uid === player1) return null; return <option key={uid} value={uid}>{member.teamName}</option>})}</select></div></div><ResponsiveContainer width="100%" height={300}><LineChart data={sanitizedH2hChart}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="name" tick={{ fill: tickColor }} /><YAxis tick={{ fill: tickColor }} domain={['dataMin - 10', 'dataMax + 10']} /><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }}/><Legend wrapperStyle={{ color: tickColor }}/> <Line type="monotone" dataKey={season.members[player1]?.teamName} stroke="#8884d8" strokeWidth={2} dot={false} activeDot={{ r: 6 }}/> <Line type="monotone" dataKey={season.members[player2]?.teamName} stroke="#82ca9d" strokeWidth={2} dot={false} activeDot={{ r: 6 }}/></LineChart></ResponsiveContainer></div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Distribución de Puntuaciones por Jornada</h3><ResponsiveContainer width="100%" height={300}><BarChart data={scoreDistribution}><CartesianGrid strokeDasharray="3 3" stroke={gridColor}/><XAxis dataKey="name" tick={{fill: tickColor}}/><YAxis tick={{fill: tickColor}} allowDecimals={false} /><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }} cursor={{fill: 'rgba(139, 92, 246, 0.1)'}} /> <Bar dataKey="value" name="Nº de Jornadas">{scoreDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Bar> </BarChart></ResponsiveContainer></div>
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Consistencia de Jugadores (Media vs. Máx)</h3><ResponsiveContainer width="100%" height={300}><RadarChart cx="50%" cy="50%" outerRadius="80%" data={playerConsistencyData}><PolarGrid stroke={gridColor}/><PolarAngleAxis dataKey="subject" tick={{fill: tickColor}} /><PolarRadiusAxis angle={30} domain={[0, 'dataMax + 10']} tick={{fill: tickColor}}/><Radar name="Media" dataKey="A" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} /><Radar name="Punt. Máx" dataKey="B" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.6} /><Legend wrapperStyle={{ color: tickColor }}/><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }}/></RadarChart></ResponsiveContainer></div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Distribución de Podios</h3><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={podiumDistributionForPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>{podiumDistributionForPie.map((entry) => (<Cell key={`cell-${entry.name}`} fill={PODIUM_COLORS[entry.name]} />))}</Pie><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }}/><Legend wrapperStyle={{ color: tickColor }}/></PieChart></ResponsiveContainer></div>
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Farolillo Rojo (Últimas Posiciones)</h3>{lastPlaceFinishes.length > 0 ? (<ResponsiveContainer width="100%" height={300}><BarChart layout="vertical" data={lastPlaceFinishes} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis type="number" tick={{fill: tickColor}} allowDecimals={false}/><YAxis dataKey="name" type="category" width={100} tick={{fill: tickColor}}/><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }}/><Legend wrapperStyle={{ color: tickColor }}/><Bar dataKey="Último Puesto" fill="#ef4444" /></BarChart></ResponsiveContainer>) : ( <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">Nadie ha quedado último todavía.</div>)}</div>
            </div>
            
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Jornadas sin puntuar (NR / No11)</h3>
                {nonScoringRoundsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart layout="vertical" data={nonScoringRoundsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                            <XAxis type="number" tick={{fill: tickColor}} allowDecimals={false} />
                            <YAxis dataKey="name" type="category" width={100} tick={{fill: tickColor}}/>
                            <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }}/>
                            <Legend wrapperStyle={{ color: tickColor }}/>
                            <Bar dataKey="Jornadas sin puntuar" fill="#a855f7" />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                        ¡Nadie ha dejado de puntuar todavía!
                    </div>
                )}
            </div>
        </div>
    );
}