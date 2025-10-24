import React, { useState, useMemo, useEffect } from 'react';
import { db, auth } from '../config/firebase';
import { Link } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ScatterChart, Scatter, Label } from 'recharts';
// FIX 1: Añadido 'History' a la importación
import { Award, Star, TrendingUp, Zap, Scale, Filter, ChevronsUpDown, ArrowUp, ArrowDown, Shield, Users, Sofa, UserCheck, Activity, ThumbsUp, ThumbsDown, Swords, History } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { useTheme } from '../context/ThemeContext';
import { collection, query, getDocs } from 'firebase/firestore';
import HistoricalStatsTab from './HistoricalStatsTab'; // <-- Importa el nuevo componente

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

const getNestedValue = (obj, path) => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F', '#FFBB28', '#FF8042', '#0088FE', '#A4DE6C', '#DE6C8A'];
const PODIUM_COLORS = { Oro: '#FFD700', Plata: '#C0C0C0', Bronce: '#CD7F32' };

// FIX 2: Añadido 'seasons' a las props
export default function StatsTab({ league, season, seasons, roundsData }) {
    const { theme } = useTheme();
    const tickColor = theme === 'dark' ? '#9ca3af' : '#6b7280';
    const gridColor = theme === 'dark' ? '#374151' : '#e5e7eb';
    
    const userId = auth.currentUser?.uid;
    const memberCount = season?.members ? Object.keys(season.members).length : 0;
    const [sortConfig, setSortConfig] = useState({ key: 'totalPoints', direction: 'desc' });
    const [positionSortConfig, setPositionSortConfig] = useState({ key: 'participations', direction: 'desc' });
    const [streakSortConfig, setStreakSortConfig] = useState({ key: 'positiveStreakCount', direction: 'desc' });
    const [topScoresSortConfig, setTopScoresSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [playerPerfSortConfig, setPlayerPerfSortConfig] = useState({ key: 'total', direction: 'desc' });
    const [startRound, setStartRound] = useState(1);
    const [endRound, setEndRound] = useState(roundsData.length > 0 ? roundsData.length : 1);
    const memberIds = season?.members ? Object.keys(season.members) : [];
    const [selectedPlayer, setSelectedPlayer] = useState(userId || memberIds[0] || '');
    const [player1, setPlayer1] = useState(userId || memberIds[0] || '');
    const [player2, setPlayer2] = useState(memberIds.find(id => id !== player1) || '');
    const [rivalryPlayer1, setRivalryPlayer1] = useState('');
    const [rivalryPlayer2, setRivalryPlayer2] = useState('');
    const [allLineups, setAllLineups] = useState({});
    const [loadingLineups, setLoadingLineups] = useState(true);
    const [pointsByPositionFilter, setPointsByPositionFilter] = useState('general');
    const [playerPerformanceFilter, setPlayerPerformanceFilter] = useState('general');
    const [showHistorical, setShowHistorical] = useState(false); // <-- Nuevo estado para mostrar/ocultar


    useEffect(() => {
        if (roundsData && roundsData.length > 0) {
            setEndRound(roundsData.length);
        }
    }, [roundsData]);
    
    useEffect(() => {
        const fetchAllLineups = async () => {
            if (!league || !season) return;
            setLoadingLineups(true);
            const lineupsRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'lineups');
            const lineupsSnapshot = await getDocs(query(lineupsRef));
            const lineupsData = {};
            lineupsSnapshot.forEach(doc => {
                lineupsData[doc.id] = doc.data();
            });
            setAllLineups(lineupsData);
            setLoadingLineups(false);
        };
        fetchAllLineups();
    }, [league, season]);

    const memoizedStats = useMemo(() => {
        if (!season || !season.members || loadingLineups) {
            return { 
                detailedPlayerStats: [], positionStats: [], headToHeadStats: {}, rivalryStats: {},
                leagueRecords: { bestScore: { value: 0, holders: [] }, mostWins: { value: 0, holders: [] }, mostPodiums: { value: 0, holders: [] }, mostRegular: { value: null, holders: [] } }, 
                scoreDistribution: [], playerConsistencyData: [], podiumDistributionForPie: [], 
                lastPlaceFinishes: [], nonScoringRoundsData: [], captainPointsData: [], 
                benchPointsData: [], pointsByPositionData: {}, teamValueVsPointsData: [], 
                streakData: [], topWorstScoresData: [], playerPerformanceByUser: {}
            };
        }
        
        const stats = {};
        const playerPerformanceByUser = {};
        playerPerformanceByUser['general'] = {};
        const rivalryStats = {};

        Object.entries(season.members).forEach(([uid, data]) => {
            stats[uid] = { uid, name: data.teamName, username: data.username, scores: [], totalPoints: 0, weeksAtNum1: 0, weeksInPodium: 0, weeksInTop5: 0, roundFinishes: Array(memberCount).fill(0), lastPlaces: 0, participations: 0, h2h: {}, h2hRecord: { wins: 0, draws: 0, losses: 0 }, matchupRecord: { wins: 0, draws: 0, losses: 0, score: 0 }, nonScoringRounds: 0, captainPoints: 0, wastedBenchPoints: 0, pointsByPosition: { 'Portero': 0, 'Defensa': 0, 'Centrocampista': 0, 'Delantero': 0, 'Entrenador': 0 }, positiveStreakCount: 0, neutralStreakCount: 0, negativeStreakCount: 0, biggestJump: 0, biggestDrop: 0, lastRank: null };
            playerPerformanceByUser[uid] = {};
            rivalryStats[uid] = {};
            Object.keys(season.members).forEach(opId => { if (opId !== uid) { stats[uid].h2h[opId] = 0; rivalryStats[uid][opId] = { maxPositiveDiff: {value: 0, round: 0}, maxNegativeDiff: {value: 0, round: 0}, totalDifference: 0, matchupCount: 0, maxGeneralDiff: {value: 0, round: 0} }; } });
        });
        
        const cumulativeScores = {};
        Object.keys(season.members).forEach(uid => cumulativeScores[uid] = 0);

        roundsData.forEach(round => {
            const roundNumber = round.roundNumber;
            const scoresForRound = round.scores || {};
            const participatingUids = Object.keys(scoresForRound).filter(uid => typeof scoresForRound[uid] === 'number' && stats[uid]);
            
            participatingUids.forEach(uid => {
                if(!stats[uid].scores.some(s => s.roundNumber === roundNumber)) {
                    stats[uid].scores.push({score: scoresForRound[uid], roundNumber});
                }
            });

            const prevCumulativeScores = { ...cumulativeScores };

            participatingUids.forEach(uid => {
                cumulativeScores[uid] += scoresForRound[uid];
            });

            for (let i = 0; i < participatingUids.length; i++) {
                const uid1 = participatingUids[i];
                stats[uid1].participations++;
                for (let j = i + 1; j < participatingUids.length; j++) {
                    const uid2 = participatingUids[j];
                    const score1 = scoresForRound[uid1];
                    const score2 = scoresForRound[uid2];
                    const diff = score1 - score2;

                    rivalryStats[uid1][uid2].totalDifference += diff;
                    rivalryStats[uid1][uid2].matchupCount++;
                    rivalryStats[uid2][uid1].totalDifference -= diff;
                    rivalryStats[uid2][uid1].matchupCount++;

                    if (diff > rivalryStats[uid1][uid2].maxPositiveDiff.value) rivalryStats[uid1][uid2].maxPositiveDiff = { value: diff, round: roundNumber };
                    if (diff < rivalryStats[uid1][uid2].maxNegativeDiff.value) rivalryStats[uid1][uid2].maxNegativeDiff = { value: diff, round: roundNumber };
                    if (-diff > rivalryStats[uid2][uid1].maxPositiveDiff.value) rivalryStats[uid2][uid1].maxPositiveDiff = { value: -diff, round: roundNumber };
                    if (-diff < rivalryStats[uid2][uid1].maxNegativeDiff.value) rivalryStats[uid2][uid1].maxNegativeDiff = { value: -diff, round: roundNumber };
                    
                    if (score1 > score2) { stats[uid1].h2hRecord.wins++; stats[uid2].h2hRecord.losses++; stats[uid1].h2h[uid2]++; } 
                    else if (score2 > score1) { stats[uid2].h2hRecord.wins++; stats[uid1].h2hRecord.losses++; stats[uid2].h2h[uid1]++; }
                    else { stats[uid1].h2hRecord.draws++; stats[uid2].h2hRecord.draws++; }
                }
            }
            
            Object.keys(season.members).forEach(uid1 => {
                Object.keys(season.members).forEach(uid2 => {
                    if (uid1 !== uid2) {
                        const generalDiff = cumulativeScores[uid1] - cumulativeScores[uid2];
                        if (generalDiff > rivalryStats[uid1][uid2].maxGeneralDiff.value) {
                            rivalryStats[uid1][uid2].maxGeneralDiff = { value: generalDiff, round: roundNumber };
                        }
                    }
                });
            });

            Object.entries(season.members).forEach(([uid]) => {
                const lineup = allLineups[`${roundNumber}-${uid}`];
                if (scoresForRound[uid] && typeof scoresForRound[uid] !== 'number') { stats[uid].nonScoringRounds++; }
                if (lineup) {
                    const processPlayer = (player, slotId, isBench) => {
                        if (!player || !player.playerId) return;
                        const updatePerformance = (perfObject) => { perfObject.fielded = (perfObject.fielded || 0) + 1; const points = player.points || 0; const isCaptain = lineup.captainSlot === slotId; if (isBench) { if (player.active && player.status === 'playing') { perfObject.bench = (perfObject.bench || 0) + points; perfObject.total = (perfObject.total || 0) + points; if(isCaptain) { perfObject.captain = (perfObject.captain || 0) + points; perfObject.total += points; } } else if (points > 0) { perfObject.wasted = (perfObject.wasted || 0) + points; } } else { if (player.status === 'playing') { perfObject.total = (perfObject.total || 0) + points; if(isCaptain) { perfObject.captain = (perfObject.captain || 0) + points; perfObject.total += points; } } } };
                        playerPerformanceByUser[uid][player.playerId] = playerPerformanceByUser[uid][player.playerId] || { name: player.name }; updatePerformance(playerPerformanceByUser[uid][player.playerId]);
                        playerPerformanceByUser['general'][player.playerId] = playerPerformanceByUser['general'][player.playerId] || { name: player.name }; updatePerformance(playerPerformanceByUser['general'][player.playerId]);
                    };
                    Object.entries(lineup.players || {}).forEach(([slotId, player]) => processPlayer(player, slotId, false));
                    Object.entries(lineup.bench || {}).forEach(([pos, player]) => processPlayer(player, `bench-${pos}`, true));
                    processPlayer(lineup.coach, 'coach-COACH', false);
                    if (lineup.captainSlot) { const [slotType, ...slotRest] = lineup.captainSlot.split('-'); const slotKey = slotRest.join('-'); let captain = null; if (slotType === 'coach') captain = lineup.coach; else if (slotType === 'players') captain = lineup.players?.[lineup.captainSlot]; else if (slotType === 'bench') captain = lineup.bench?.[slotKey]; if (captain?.points > 0) { stats[uid].captainPoints += captain.points; } }
                    Object.values(lineup.players || {}).forEach(p => { if (p.status === 'playing' && p.points > 0) { stats[uid].pointsByPosition[p.positionAtTheTime] = (stats[uid].pointsByPosition[p.positionAtTheTime] || 0) + p.points; } });
                    if (lineup.coach?.status === 'playing' && lineup.coach?.points > 0) { stats[uid].pointsByPosition['Entrenador'] = (stats[uid].pointsByPosition['Entrenador'] || 0) + lineup.coach.points; }
                    ['GK', 'DF', 'MF', 'FW'].forEach(pos => { const benchPlayer = lineup.bench?.[pos]; if (benchPlayer?.points > 0 && benchPlayer.status === 'playing' && !benchPlayer.active) { stats[uid].wastedBenchPoints += benchPlayer.points; } });
                }
            });

            const rankedRound = participatingUids.map(uid => ({ uid, points: scoresForRound[uid] })).sort((a,b) => b.points - a.points);
            if (rankedRound.length > 0) { const lowestScore = rankedRound[rankedRound.length - 1].points; rankedRound.forEach((p, index) => { let rank = index; while(rank > 0 && rankedRound[rank - 1].points === p.points) { rank--; } stats[p.uid].roundFinishes[rank]++; if (p.points === lowestScore) stats[p.uid].lastPlaces++; }); }
        
            const rankedGeneral = Object.keys(cumulativeScores).map(uid => ({uid, points: cumulativeScores[uid]})).sort((a,b) => b.points - a.points);
            const roundRanks = {};
            rankedGeneral.forEach((p, index) => { let rank = index; while(rank > 0 && rankedGeneral[rank - 1].points === p.points) { rank--; } roundRanks[p.uid] = rank + 1; });
             Object.keys(stats).forEach(uid => {
                const currentRank = roundRanks[uid];
                if (stats[uid].lastRank !== null && currentRank) {
                    const diff = stats[uid].lastRank - currentRank;
                    if (diff > 0) { stats[uid].positiveStreakCount++; if (diff > stats[uid].biggestJump) stats[uid].biggestJump = diff; } 
                    else if (diff < 0) { stats[uid].negativeStreakCount++; if (diff < stats[uid].biggestDrop) stats[uid].biggestDrop = diff; }
                    else { stats[uid].neutralStreakCount++; }
                }
                if(currentRank) stats[uid].lastRank = currentRank;
                if (roundRanks[uid] === 1) stats[uid].weeksAtNum1++; if (roundRanks[uid] <= 3) stats[uid].weeksInPodium++; if (roundRanks[uid] <= 5) stats[uid].weeksInTop5++;
            });
        });

        Object.keys(stats).forEach(uid1 => {
            Object.keys(stats).forEach(uid2 => {
                if (uid1 !== uid2) {
                    const wins1 = stats[uid1].h2h[uid2] || 0;
                    const wins2 = stats[uid2].h2h[uid1] || 0;
                    if (wins1 > wins2) stats[uid1].matchupRecord.wins++;
                    else if (wins2 > wins1) stats[uid1].matchupRecord.losses++;
                    else stats[uid1].matchupRecord.draws++;
                }
            });
            stats[uid1].matchupRecord.score = (stats[uid1].matchupRecord.wins * 3) + stats[uid1].matchupRecord.draws;
        });
        
        const finalDetailedStats = Object.values(stats).map(p => {
    const participations = p.scores.length;
    p.totalPoints = p.scores.map(s => s.score).reduce((a, b) => a + b, 0);
    const scoresArray = p.scores.map(s => s.score).sort((a, b) => a - b); // Ordenar para mediana
    const best = participations > 0 ? scoresArray[scoresArray.length - 1] : 0;
    const worst = participations > 0 ? scoresArray[0] : 0;
    const averageNum = participations > 0 ? (p.totalPoints / participations) : 0;
    const regularityNum = calculateStandardDeviation(scoresArray);
    const avgPos = p.participations > 0 ? (p.roundFinishes.reduce((sum, count, i) => sum + (count * (i + 1)), 0) / p.participations) : 0;

    // --- NUEVOS CÁLCULOS ---
    const victorias = p.roundFinishes[0] || 0;
    const podios = (p.roundFinishes[0] || 0) + (p.roundFinishes[1] || 0) + (p.roundFinishes[2] || 0);

    let mediana = 'N/A';
    if (participations > 0) {
        const mid = Math.floor(participations / 2);
        mediana = participations % 2 !== 0 ? scoresArray[mid] : ((scoresArray[mid - 1] + scoresArray[mid]) / 2).toFixed(1);
    }

    let moda = '-';
    if (participations > 1) {
        const counts = {};
        let maxCount = 0;
        let modaValue = [];
        scoresArray.forEach(score => {
            counts[score] = (counts[score] || 0) + 1;
            if (counts[score] > maxCount) {
                maxCount = counts[score];
                modaValue = [score];
            } else if (counts[score] === maxCount && !modaValue.includes(score)) {
                modaValue.push(score);
            }
        });
        if (maxCount > 1) { // Solo mostrar moda si hay repeticiones
           moda = modaValue.join(', ');
        }
    }
    // --- FIN NUEVOS CÁLCULOS ---

    return {
        ...p,
        best,
        worst,
        average: averageNum.toFixed(1),
        regularity: regularityNum.toFixed(2),
        averagePosition: avgPos > 0 ? avgPos.toFixed(2) : 'N/A',
        // --- AÑADIR NUEVOS VALORES AL OBJETO ---
        victorias,
        podios,
        mediana,
        moda
    };
});
        const finalPositionStats = Object.values(stats).map(p => ({ name: p.name, username: p.username, positionCounts: p.roundFinishes, podiums: p.roundFinishes.slice(0,3).reduce((a,b) => a + b, 0), top5: p.roundFinishes.slice(0,5).reduce((a,b) => a + b, 0), top10: p.roundFinishes.slice(0,10).reduce((a,b) => a + b, 0), lastPlaces: p.lastPlaces, participations: p.participations, }));
        const finalH2HStats = {}; Object.values(stats).forEach(p => { finalH2HStats[p.uid] = { name: p.name, username: p.username, wins: p.h2h, h2hRecord: p.h2hRecord, matchupRecord: p.matchupRecord }; });
        const mostWinsValue = Math.max(0, ...finalPositionStats.map(p => p.positionCounts[0])); const mostWinsHolders = finalPositionStats.filter(p => p.positionCounts[0] === mostWinsValue).map(p => p.name); const mostPodiumsValue = Math.max(0, ...finalPositionStats.map(p => p.podiums)); const mostPodiumsHolders = finalPositionStats.filter(p => p.podiums === mostPodiumsValue).map(p => p.name); const bestScoreRecordValue = Math.max(0, ...finalDetailedStats.map(p => p.best)); const bestScoreHolders = finalDetailedStats.filter(p => p.best === bestScoreRecordValue).map(p => p.name);
        const regularPlayers = finalDetailedStats.filter(p=>p.participations > 1); const mostRegularValue = regularPlayers.length > 0 ? Math.min(...regularPlayers.map(p => parseFloat(p.regularity))) : null; const mostRegularHolders = mostRegularValue !== null ? finalDetailedStats.filter(p => parseFloat(p.regularity) === mostRegularValue).map(p => p.name) : [];
        const records = { bestScore: { value: bestScoreRecordValue, holders: bestScoreHolders }, mostWins: { value: mostWinsValue, holders: mostWinsHolders }, mostPodiums: { value: mostPodiumsValue, holders: mostPodiumsHolders }, mostRegular: { value: mostRegularValue, holders: mostRegularHolders } };
        const scoreBrackets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81+': 0 }; finalDetailedStats.forEach(p => p.scores.forEach(s => { const score = s.score; if (score <= 20) scoreBrackets['0-20']++; else if (score <= 40) scoreBrackets['21-40']++; else if (score <= 60) scoreBrackets['41-60']++; else if (score <= 80) scoreBrackets['61-80']++; else scoreBrackets['81+']++; }));
        const finalScoreDistribution = Object.entries(scoreBrackets).map(([name, value]) => ({ name, value }));
        const consistencyData = finalDetailedStats.map(p => ({ subject: p.name, A: parseFloat(p.average), B: p.best, fullMark: Math.max(...finalDetailedStats.map(stat => stat.best)) }));
        const totalPodiums = finalPositionStats.reduce((acc, p) => { acc.Oro += p.positionCounts[0] || 0; acc.Plata += p.positionCounts[1] || 0; acc.Bronce += p.positionCounts[2] || 0; return acc; }, { Oro: 0, Plata: 0, Bronce: 0 });
        const podiumDistributionForPie = Object.entries(totalPodiums).map(([name, value]) => ({ name, value })).filter(item => item.value > 0);
        const lastPlacesData = finalPositionStats.map(p => ({name: p.name, 'Último Puesto': p.lastPlaces})).filter(p => p['Último Puesto'] > 0).sort((a,b) => b['Último Puesto'] - a['Último Puesto']);
        const nonScoringData = finalDetailedStats.map(p => ({name: p.name, 'Jornadas sin puntuar': p.nonScoringRounds})).filter(p => p['Jornadas sin puntuar'] > 0).sort((a,b) => b['Jornadas sin puntuar'] - a['Jornadas sin puntuar']);
        const finalCaptainPoints = finalDetailedStats.map(p => ({ name: p.name, 'Puntos Extra Capitán': p.captainPoints })).sort((a,b) => b['Puntos Extra Capitán'] - a['Puntos Extra Capitán']);
        const finalWastedBenchPoints = finalDetailedStats.map(p => ({ name: p.name, 'Puntos Desperdiciados': p.wastedBenchPoints })).filter(p => p['Puntos Desperdiciados'] > 0).sort((a,b) => b['Puntos Desperdiciados'] - a['Puntos Desperdiciados']);
        const finalPointsByPosData = { general: Object.entries(finalDetailedStats.reduce((acc, p) => { Object.entries(p.pointsByPosition).forEach(([pos, pts]) => { acc[pos] = (acc[pos] || 0) + pts; }); return acc; }, {})).map(([name, value]) => ({ name, value })) };
        finalDetailedStats.forEach(p => { finalPointsByPosData[p.uid] = Object.entries(p.pointsByPosition).map(([name, value]) => ({ name, value })) });
        const finalTeamValueVsPoints = finalDetailedStats.map(p => ({ name: p.name, x: (season.members[p.uid].finances?.teamValue || 0), y: p.totalPoints }));
        const finalStreakData = finalDetailedStats.map(p => ({ name: p.name, username: p.username, positiveStreakCount: p.positiveStreakCount, neutralStreakCount: p.neutralStreakCount, negativeStreakCount: p.negativeStreakCount, biggestJump: p.biggestJump, biggestDrop: p.biggestDrop }));
        const finalTopWorstScoresData = finalDetailedStats.map(p => { const top5 = [...p.scores.map(s => s.score)].sort((a, b) => b - a).slice(0, 5); const worst5 = [...p.scores.map(s => s.score)].sort((a, b) => a - b).slice(0, 5); return { uid: p.uid, name: p.name, username: p.username, top5Scores: top5, worst5Scores: worst5, avgTop5: top5.length > 0 ? (top5.reduce((a, b) => a + b, 0) / top5.length).toFixed(1) : 'N/A', avgWorst5: worst5.length > 0 ? (worst5.reduce((a, b) => a + b, 0) / worst5.length).toFixed(1) : 'N/A' }; });

        return { detailedPlayerStats: finalDetailedStats, positionStats: finalPositionStats, headToHeadStats: finalH2HStats, rivalryStats, leagueRecords: records, scoreDistribution: finalScoreDistribution, playerConsistencyData: consistencyData, podiumDistributionForPie, lastPlaceFinishes: lastPlacesData, nonScoringRoundsData: nonScoringData, captainPointsData: finalCaptainPoints, benchPointsData: finalWastedBenchPoints, pointsByPositionData: finalPointsByPosData, teamValueVsPointsData: finalTeamValueVsPoints, streakData: finalStreakData, topWorstScoresData: finalTopWorstScoresData, playerPerformanceByUser };
    }, [roundsData, season, memberCount, allLineups, loadingLineups]);

    const sortedDetailedPlayerStats = useMemo(() => {
        let sortableItems = [...memoizedStats.detailedPlayerStats];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                if (sortConfig.key === 'matchupRecord.score') {
                    if (a.matchupRecord.score !== b.matchupRecord.score) {
                        return b.matchupRecord.score - a.matchupRecord.score;
                    }
                    if (a.matchupRecord.wins !== b.matchupRecord.wins) {
                        return b.matchupRecord.wins - a.matchupRecord.wins;
                    }
                    return a.matchupRecord.losses - b.matchupRecord.losses;
                }
                
                if (sortConfig.key === 'name') {
                    return sortConfig.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
                }
                
                const valA = getNestedValue(a, sortConfig.key);
                const valB = getNestedValue(b, sortConfig.key);

                const numA = valA === 'N/A' ? (sortConfig.direction === 'asc' ? Infinity : -Infinity) : parseFloat(valA);
                const numB = valB === 'N/A' ? (sortConfig.direction === 'asc' ? Infinity : -Infinity) : parseFloat(valB);
                
                if (numA < numB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (numA > numB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });

            if (sortConfig.key === 'matchupRecord.score' && sortConfig.direction === 'asc') {
                sortableItems.reverse();
            }
        }
        return sortableItems;
    }, [memoizedStats.detailedPlayerStats, sortConfig]);

    const sortedPositionStats = useMemo(() => { let sortableItems = [...memoizedStats.positionStats]; if (positionSortConfig.key !== null) { sortableItems.sort((a, b) => { const valA = positionSortConfig.key === 'name' ? a.name : a[positionSortConfig.key] ?? a.positionCounts[positionSortConfig.key]; const valB = positionSortConfig.key === 'name' ? b.name : b[positionSortConfig.key] ?? b.positionCounts[positionSortConfig.key]; if (typeof valA === 'string') { return positionSortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA); } if (valA < valB) return positionSortConfig.direction === 'asc' ? -1 : 1; if (valA > valB) return positionSortConfig.direction === 'asc' ? 1 : -1; return 0; }); } return sortableItems; }, [memoizedStats.positionStats, positionSortConfig]);
    const sortedStreakStats = useMemo(() => { let sortableItems = [...memoizedStats.streakData]; if (streakSortConfig.key) { sortableItems.sort((a,b) => { const valA = a[streakSortConfig.key]; const valB = b[streakSortConfig.key]; if (valA < valB) return streakSortConfig.direction === 'asc' ? -1 : 1; if (valA > valB) return streakSortConfig.direction === 'asc' ? 1 : -1; return 0; }); } return sortableItems; }, [memoizedStats.streakData, streakSortConfig]);
    const sortedTopWorstScores = useMemo(() => { let sortableItems = [...memoizedStats.topWorstScoresData]; if (topScoresSortConfig.key) { sortableItems.sort((a, b) => { if (topScoresSortConfig.key === 'name') { return topScoresSortConfig.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name); } const valA = a[topScoresSortConfig.key] === 'N/A' ? (topScoresSortConfig.direction === 'asc' ? Infinity : -Infinity) : parseFloat(a[topScoresSortConfig.key]); const valB = b[topScoresSortConfig.key] === 'N/A' ? (topScoresSortConfig.direction === 'asc' ? Infinity : -Infinity) : parseFloat(b[topScoresSortConfig.key]); if (valA < valB) return topScoresSortConfig.direction === 'asc' ? -1 : 1; if (valA > valB) return topScoresSortConfig.direction === 'asc' ? 1 : -1; return 0; }); } return sortableItems; }, [memoizedStats.topWorstScoresData, topScoresSortConfig]);
    const sortedPlayerPerformance = useMemo(() => {
        const data = Object.values(memoizedStats.playerPerformanceByUser[playerPerformanceFilter] || {});
        if (playerPerfSortConfig.key) {
            data.sort((a, b) => {
                const valA = a[playerPerfSortConfig.key] || 0;
                const valB = b[playerPerfSortConfig.key] || 0;
                if (typeof valA === 'string') {
                    return playerPerfSortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                }
                if (valA < valB) return playerPerfSortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return playerPerfSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return data;
    }, [memoizedStats.playerPerformanceByUser, playerPerformanceFilter, playerPerfSortConfig]);

    const requestSort = (key) => { let direction = 'desc'; if (sortConfig.key === key && sortConfig.direction === 'desc') { direction = 'asc'; } setSortConfig({ key, direction }); };
    const requestPositionSort = (key) => { let direction = 'desc'; if (positionSortConfig.key === key && positionSortConfig.direction === 'desc') { direction = 'asc'; } setPositionSortConfig({ key, direction }); };
    const requestStreakSort = (key) => { let direction = 'desc'; if (streakSortConfig.key === key && streakSortConfig.direction === 'desc') { direction = 'asc'; } setStreakSortConfig({ key, direction }); };
    const requestTopScoresSort = (key) => { let direction = 'asc'; if (topScoresSortConfig.key === key && topScoresSortConfig.direction === 'asc') { direction = 'desc'; } setTopScoresSortConfig({ key, direction }); };
    const requestPlayerPerfSort = (key) => { let direction = 'desc'; if (playerPerfSortConfig.key === key && playerPerfSortConfig.direction === 'desc') { direction = 'asc'; } setPlayerPerfSortConfig({ key, direction }); };
    const getSortIndicator = (key, type = 'main') => { const config = type === 'main' ? sortConfig : type === 'pos' ? positionSortConfig : type === 'streak' ? streakSortConfig : type === 'top_scores' ? topScoresSortConfig : playerPerfSortConfig; if (config.key !== key) return <ChevronsUpDown size={14} className="ml-1 text-gray-400" />; if (config.direction === 'asc') return <ArrowUp size={14} className="ml-1 text-gray-800 dark:text-gray-200" />; return <ArrowDown size={14} className="ml-1 text-gray-800 dark:text-gray-200" />; };
    
    const { sanitizedPointsEvolution, sanitizedPositionEvolution, sanitizedPlayerPerformance, sanitizedH2hChart } = useMemo(() => {
        if (!season || !season.members) return { sanitizedPointsEvolution: [], sanitizedPositionEvolution: [], sanitizedPlayerPerformance: [], sanitizedH2hChart: [] };
        const pointsEvolution = []; const positionEvolution = []; const playerPerformance = []; const h2hEvolution = [];
        const cumulativeScores = {}; const h2hCumulative = {};
        Object.keys(season.members).forEach(uid => { cumulativeScores[uid] = 0; if (uid === player1 || uid === player2) h2hCumulative[uid] = 0; });
        const filteredRounds = roundsData.slice(startRound - 1, endRound);
        filteredRounds.forEach(round => { const scoresForRound = round.scores || {}; let roundTotal = 0; let roundParticipants = 0; Object.keys(season.members).forEach(uid => { const score = scoresForRound[uid]; if (typeof score === 'number') { cumulativeScores[uid] += score; if (h2hCumulative[uid] !== undefined) h2hCumulative[uid] += score; roundTotal += score; roundParticipants++; } }); const rankedPlayers = Object.keys(cumulativeScores).map(uid => ({ uid, points: cumulativeScores[uid] })).sort((a, b) => b.points - a.points); const roundRanks = {}; rankedPlayers.forEach((player, index) => { let rank = index + 1; if (index > 0 && player.points === rankedPlayers[index - 1].points) { rank = roundRanks[rankedPlayers[index - 1].uid]; } roundRanks[player.uid] = rank; }); const pointsDataPoint = { name: `J${round.roundNumber}` }; const positionDataPoint = { name: `J${round.roundNumber}` }; Object.keys(season.members).forEach(uid => { pointsDataPoint[season.members[uid].teamName] = cumulativeScores[uid]; positionDataPoint[season.members[uid].teamName] = roundRanks[uid]; }); pointsEvolution.push(pointsDataPoint); positionEvolution.push(positionDataPoint); const selectedPlayerScore = scoresForRound[selectedPlayer]; playerPerformance.push({ name: `J${round.roundNumber}`, "Puntos del Jugador": typeof selectedPlayerScore === 'number' ? selectedPlayerScore : null, "Media de la Liga": roundParticipants > 0 ? parseFloat((roundTotal / roundParticipants).toFixed(1)) : null, }); if (player1 && player2 && season.members[player1] && season.members[player2]) { h2hEvolution.push({ name: `J${round.roundNumber}`, [season.members[player1].teamName]: h2hCumulative[player1], [season.members[player2].teamName]: h2hCumulative[player2], }); } });
        return { sanitizedPointsEvolution: pointsEvolution, sanitizedPositionEvolution: positionEvolution, sanitizedPlayerPerformance: playerPerformance, sanitizedH2hChart: h2hEvolution };
    }, [roundsData, season.members, selectedPlayer, player1, player2, startRound, endRound]);
    
    const memberColors = useMemo(() => { if (!season || !season.members) return {}; const assignedColors = {}; Object.keys(season.members).forEach((uid, index) => { assignedColors[season.members[uid].teamName] = COLORS[index % COLORS.length]; }); return assignedColors; }, [season.members]);

    const currentRivalry = rivalryPlayer1 && rivalryPlayer2 ? memoizedStats.rivalryStats[rivalryPlayer1]?.[rivalryPlayer2] : null;

    if (loadingLineups) {
        return <LoadingSpinner text="Calculando estadísticas avanzadas..." />;
    }

    return (
        <div className="space-y-6">
           {showHistorical ? (
               <>
                   <button onClick={() => setShowHistorical(false)} className="btn-secondary mb-4 flex items-center gap-2">
                     ← Volver a Estadísticas Actuales
                  </button>
                   {/* Esta línea es correcta ahora que 'seasons' está en las props */}
                   <HistoricalStatsTab league={league} seasons={seasons} />
               </>
           ) : (
            <>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                 <StatHighlightCard title="Récord de Puntos" value={`${memoizedStats.leagueRecords.bestScore?.value || 0} pts`} subValue={`por ${formatHolderNames(memoizedStats.leagueRecords.bestScore?.holders || [])}`} colorClass="text-energetic-orange" icon={<Zap/>}/>
                 <StatHighlightCard title="Más Victorias de Jornada" value={`${memoizedStats.leagueRecords.mostWins?.value || 0}`} subValue={`por ${formatHolderNames(memoizedStats.leagueRecords.mostWins?.holders || [])}`} colorClass="text-yellow-500" icon={<Award/>}/>
                 <StatHighlightCard title="Más Podios de Jornada" value={`${memoizedStats.leagueRecords.mostPodiums?.value || 0}`} subValue={`por ${formatHolderNames(memoizedStats.leagueRecords.mostPodiums?.holders || [])}`} colorClass="text-vibrant-purple" icon={<Star/>}/>
                 <StatHighlightCard title="Más Regular (σ)" value={`${memoizedStats.leagueRecords.mostRegular.value !== null ? memoizedStats.leagueRecords.mostRegular.value.toFixed(2) : 'N/A'}`} subValue={`por ${formatHolderNames(memoizedStats.leagueRecords.mostRegular?.holders || [])}`} colorClass="text-deep-blue" icon={<Scale/>}/>
            </div>

            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700">
                <div className="flex justify-between items-center p-6">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Estadísticas Detalladas por Jugador</h3>
                    {/* Esta línea es correcta ahora que 'History' está importado */}
                    <button onClick={() => setShowHistorical(true)} className="btn-primary flex items-center gap-2 text-sm">
                        <History size={16} /> Ver Historial Completo
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/60">
                <tr className="border-b dark:border-gray-700">
                    {/* Orden y Colores:
                        Jugador (color negro) - text-black dark:text-white
                        Total Pts (color fucsia) - text-fuchsia-600 dark:text-fuchsia-400
                        Victorias (color dorado) - text-yellow-600 dark:text-yellow-400
                        Podios (color morado) - text-purple-600 dark:text-purple-400
                        Pos. Media (naranja) - text-orange-600 dark:text-orange-400
                        Media Pts (color azul claro) - text-sky-600 dark:text-sky-400
                        Mediana (color azul mas normal) - text-blue-600 dark:text-blue-400
                        Moda (color mas oscuro) - text-indigo-600 dark:text-indigo-400
                        Mejor Jornada (color verde) - text-emerald-600 dark:text-emerald-400
                        Peor Jornada (color rojo) - text-red-600 dark:text-red-500
                        Regularidad (color 1e40af) - text-[#1e40af] dark:text-[#60a5fa] (usando color directo o uno parecido de Tailwind)
                    */}
                    <th className="p-3 text-left font-semibold text-black dark:text-white">
                        <button onClick={() => requestSort('name')} className="flex items-center">Jugador {getSortIndicator('name')}</button>
                    </th>
                    <th className="p-3 text-center font-semibold text-fuchsia-600 dark:text-fuchsia-400">
                        <button onClick={() => requestSort('totalPoints')} className="flex items-center justify-center w-full">Total Pts {getSortIndicator('totalPoints')}</button>
                    </th>
                    <th className="p-3 text-center font-semibold text-yellow-600 dark:text-yellow-400">
                         <button onClick={() => requestSort('victorias')} className="flex items-center justify-center w-full">Victorias {getSortIndicator('victorias')}</button>
                    </th>
                    <th className="p-3 text-center font-semibold text-purple-600 dark:text-purple-400">
                         <button onClick={() => requestSort('podios')} className="flex items-center justify-center w-full">Podios {getSortIndicator('podios')}</button>
                    </th>
                    <th className="p-3 text-center font-semibold text-orange-600 dark:text-orange-400">
                        <button onClick={() => requestSort('averagePosition')} className="flex items-center justify-center w-full">Pos. Media {getSortIndicator('averagePosition')}</button>
                    </th>
                    <th className="p-3 text-center font-semibold text-sky-600 dark:text-sky-400"> {/* Azul claro */}
                        <button onClick={() => requestSort('average')} className="flex items-center justify-center w-full">Media Pts {getSortIndicator('average')}</button>
                    </th>
                    <th className="p-3 text-center font-semibold text-blue-600 dark:text-blue-400"> {/* Azul normal */}
                         <button onClick={() => requestSort('mediana')} className="flex items-center justify-center w-full">Mediana {getSortIndicator('mediana')}</button>
                    </th>
                    <th className="p-3 text-center font-semibold text-indigo-600 dark:text-indigo-400"> {/* Azul oscuro */}
                         <button onClick={() => requestSort('moda')} className="flex items-center justify-center w-full">Moda {getSortIndicator('moda')}</button>
                    </th>
                    <th className="p-3 text-center font-semibold text-emerald-600 dark:text-emerald-400"> {/* Verde */}
                        <button onClick={() => requestSort('best')} className="flex items-center justify-center w-full">Mejor Jornada {getSortIndicator('best')}</button>
                    </th>
                    <th className="p-3 text-center font-semibold text-red-600 dark:text-red-500"> {/* Rojo */}
                        <button onClick={() => requestSort('worst')} className="flex items-center justify-center w-full">Peor Jornada {getSortIndicator('worst')}</button>
                    </th>
                    <th className="p-3 text-center font-semibold text-[#1e40af] dark:text-[#60a5fa]"> {/* Azul #1e40af */}
                        <button onClick={() => requestSort('regularity')} className="flex items-center justify-center w-full">Regularidad {getSortIndicator('regularity')}</button>
                    </th>
                </tr>
            </thead>
            {/* --- CUERPO MODIFICADO --- */}
            <tbody className="divide-y dark:divide-gray-700">
                {sortedDetailedPlayerStats.map(member => (
                    <tr key={member.uid} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="p-3 font-semibold text-black dark:text-white whitespace-nowrap">
                            <Link to={`/profile/${member.username}`} className="hover:text-deep-blue dark:hover:text-blue-400 hover:underline">{member.name}</Link>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-fuchsia-600 dark:text-fuchsia-400">{member.totalPoints}</td>
                        <td className="p-3 text-center font-mono font-bold text-yellow-600 dark:text-yellow-400">{member.victorias}</td>
                        <td className="p-3 text-center font-mono font-bold text-purple-600 dark:text-purple-400">{member.podios}</td>
                        <td className="p-3 text-center font-mono text-orange-600 dark:text-orange-400">{member.averagePosition}</td>
                        <td className="p-3 text-center font-mono font-bold text-sky-600 dark:text-sky-400">{member.average}</td>
                        <td className="p-3 text-center font-mono font-bold text-blue-600 dark:text-blue-400">{member.mediana}</td>
                        <td className="p-3 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400">{member.moda}</td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{member.best}</td>
                        <td className="p-3 text-center font-mono font-bold text-red-600 dark:text-red-500">{member.worst}</td>
                        <td className="p-3 text-center font-mono text-[#1e40af] dark:text-[#60a5fa]">{member.regularity}</td>
                    </tr>
                ))}
            </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2"><Swords />Análisis de Rivalidad</h3>
                <div className="flex flex-wrap items-center gap-4 mb-6">
                    <select value={rivalryPlayer1} onChange={e => setRivalryPlayer1(e.target.value)} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">
                        <option value="" disabled>Seleccionar...</option>
                        {Object.entries(season.members).map(([uid, member]) => <option key={uid} value={uid}>{member.teamName}</option>)}
                    </select>
                    <span className="font-bold">vs</span>
                    <select value={rivalryPlayer2} onChange={e => setRivalryPlayer2(e.target.value)} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600" disabled={!rivalryPlayer1}>
                        <option value="" disabled>Seleccionar...</option>
                        {Object.entries(season.members).map(([uid, member]) => {
                            if (uid === rivalryPlayer1) return null;
                            return <option key={uid} value={uid}>{member.teamName}</option>
                        })}
                    </select>
                </div>
                {currentRivalry && (
                     <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="lg:col-span-2 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Balance de Jornadas</p>
                            <p className="text-xl font-bold">
                                <span className="text-emerald-600 dark:text-emerald-400">{memoizedStats.headToHeadStats[rivalryPlayer1]?.wins[rivalryPlayer2] || 0}</span>
                                <span className="text-gray-500 mx-2">-</span>
                                <span className="text-red-600 dark:text-red-500">{memoizedStats.headToHeadStats[rivalryPlayer2]?.wins[rivalryPlayer1] || 0}</span>
                            </p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Diferencia Media</p>
                            <p className={`text-xl font-bold ${currentRivalry.totalDifference > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{currentRivalry.matchupCount > 0 ? (currentRivalry.totalDifference / currentRivalry.matchupCount).toFixed(2) : 0} pts</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Mayor Victoria (Jornada)</p>
                            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">+{currentRivalry.maxPositiveDiff.value.toFixed(2)} <span className="text-xs">(J{currentRivalry.maxPositiveDiff.round})</span></p>
                        </div>
                         <div className="lg:col-span-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Máxima Diferencia (General)</p>
                            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">+{currentRivalry.maxGeneralDiff.value.toFixed(2)} pts <span className="text-xs">(tras J{currentRivalry.maxGeneralDiff.round})</span></p>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700"><div className="p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Resumen de Posiciones por Jornada</h3></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 dark:bg-gray-800/60"><tr className="border-b dark:border-gray-700"><th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-800/60 z-10"><button onClick={() => requestPositionSort('name')} className="flex items-center">Participante {getSortIndicator('name', 'pos')}</button></th>{Array.from({ length: memberCount }, (_, i) => i).map(pos => (<th key={pos} className={`p-3 text-center font-semibold text-gray-600 dark:text-gray-300 ${pos < 3 ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}><button onClick={() => requestPositionSort(pos)} className="flex items-center justify-center w-full">{pos+1}º {getSortIndicator(pos, 'pos')}</button></th>))}<th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20"><button onClick={() => requestPositionSort('podiums')} className="flex items-center justify-center w-full">Podios {getSortIndicator('podiums', 'pos')}</button></th><th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20"><button onClick={() => requestPositionSort('top5')} className="flex items-center justify-center w-full">Top 5 {getSortIndicator('top5', 'pos')}</button></th><th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20"><button onClick={() => requestPositionSort('top10')} className="flex items-center justify-center w-full">Top 10 {getSortIndicator('top10', 'pos')}</button></th><th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300 bg-red-50 dark:bg-red-900/20"><button onClick={() => requestPositionSort('lastPlaces')} className="flex items-center justify-center w-full">Último {getSortIndicator('lastPlaces', 'pos')}</button></th><th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300 bg-emerald-50 dark:bg-emerald-900/20"><button onClick={() => requestPositionSort('participations')} className="flex items-center justify-center w-full">Participaciones {getSortIndicator('participations', 'pos')}</button></th></tr></thead><tbody className="divide-y dark:divide-gray-700">{sortedPositionStats.map(member => (<tr key={member.name} className="hover:bg-gray-50 dark:hover:bg-gray-800"><td className="p-3 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 z-10"><Link to={`/profile/${member.username}`} className="hover:text-deep-blue dark:hover:text-blue-400 hover:underline">{member.name}</Link></td>{member.positionCounts.map((count, index) => (<td key={index} className={`p-3 text-center font-mono ${count > 0 ? 'font-bold text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'} ${index < 3 ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}>{count}</td>))}<td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-200 bg-blue-50 dark:bg-blue-900/20">{member.podiums}</td><td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-200 bg-blue-50 dark:bg-blue-900/20">{member.top5}</td><td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-200 bg-blue-50 dark:bg-blue-900/20">{member.top10}</td><td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-200 bg-red-50 dark:bg-red-900/20">{member.lastPlaces}</td><td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-200 bg-emerald-50 dark:bg-emerald-900/20">{member.participations}</td></tr>))}</tbody></table></div></div>
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700"><div className="p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Cara a Cara (Victorias por jornada)</h3><p className="text-sm text-gray-500 dark:text-gray-400 mb-4">El número indica las victorias del jugador de la fila sobre el de la columna.</p></div><div className="overflow-x-auto px-6 pb-6"><table className="w-full text-sm border-collapse table-fixed"><thead className="bg-gray-50 dark:bg-gray-800/60"><tr><th className="p-2 border dark:border-gray-700 sticky left-0 bg-gray-50 dark:bg-gray-800/60 z-20 font-semibold text-gray-600 dark:text-gray-300 w-40"><button onClick={() => requestSort('name')} className="flex items-center">Jugador {getSortIndicator('name')}</button></th><th className="p-2 border dark:border-gray-700 font-semibold text-gray-600 dark:text-gray-300 w-36"><button onClick={() => requestSort('matchupRecord.score')} className="flex items-center justify-center w-full">Balance Enfrentamientos {getSortIndicator('matchupRecord.score')}</button></th><th className="p-2 border dark:border-gray-700 font-semibold text-gray-600 dark:text-gray-300 w-28">Balance Jornadas</th>{sortedDetailedPlayerStats.map(m => <th key={m.uid} className="p-1.5 border dark:border-gray-700 align-bottom h-24 w-12"><div className="transform -rotate-45 origin-bottom-left whitespace-nowrap font-semibold text-gray-600 dark:text-gray-300 text-xs"><span>{m.name}</span></div></th>)}</tr></thead><tbody className="divide-y dark:divide-gray-700">{sortedDetailedPlayerStats.map(player => (<tr key={player.uid} className="hover:bg-gray-50 dark:hover:bg-gray-800"><td className="p-2 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 z-10 border dark:border-gray-700"><Link to={`/profile/${player.username}`} className="hover:text-deep-blue dark:hover:text-blue-400 hover:underline">{player.name}</Link></td><td className="p-2 text-center font-mono border dark:border-gray-700"><span className="font-bold text-emerald-600">{player.matchupRecord.wins}</span>-<span className="font-bold text-yellow-500">{player.matchupRecord.draws}</span>-<span className="font-bold text-red-600">{player.matchupRecord.losses}</span></td><td className="p-2 text-center font-mono border dark:border-gray-700 text-xs"><span className="text-emerald-600/80">{player.h2hRecord.wins}</span>-<span className="text-yellow-500/80">{player.h2hRecord.draws}</span>-<span className="text-red-600/80">{player.h2hRecord.losses}</span></td>{sortedDetailedPlayerStats.map(opponent => { if (player.uid === opponent.uid) return <td key={opponent.uid} className="p-2 text-center font-mono bg-gray-200 dark:bg-gray-700 border dark:border-gray-600">X</td>; const wins = memoizedStats.headToHeadStats[player.uid]?.wins[opponent.uid] || 0; const losses = memoizedStats.headToHeadStats[opponent.uid]?.wins[player.uid] || 0; let bgColor = 'bg-white dark:bg-gray-800/50'; if (wins > losses) bgColor = 'bg-emerald-100 dark:bg-emerald-900/30'; else if (losses > wins) bgColor = 'bg-red-100 dark:bg-red-900/30'; else if (wins > 0) bgColor = 'bg-yellow-100 dark:bg-yellow-900/30'; return <td key={opponent.uid} title={`${player.name} ${wins} - ${losses} ${opponent.name}`} className={`p-2 text-center font-mono border dark:border-gray-700 ${bgColor} transition-colors`}>{wins}</td> })}</tr>))}</tbody></table></div></div>
            
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700">
                <div className="p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Activity size={20}/> Rachas de Posición en la Clasificación</h3></div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/60"><tr className="border-b dark:border-gray-700">
                            <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestStreakSort('name')} className="flex items-center">Jugador {getSortIndicator('name', 'streak')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestStreakSort('positiveStreakCount')} className="flex items-center justify-center w-full">Jornadas en Verde {getSortIndicator('positiveStreakCount', 'streak')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestStreakSort('neutralStreakCount')} className="flex items-center justify-center w-full">Jornadas en Neutro {getSortIndicator('neutralStreakCount', 'streak')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestStreakSort('negativeStreakCount')} className="flex items-center justify-center w-full">Jornadas en Rojo {getSortIndicator('negativeStreakCount', 'streak')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestStreakSort('biggestJump')} className="flex items-center justify-center w-full">Mejor Subida {getSortIndicator('biggestJump', 'streak')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestStreakSort('biggestDrop')} className="flex items-center justify-center w-full">Peor Caída {getSortIndicator('biggestDrop', 'streak')}</button></th>
                        </tr></thead>
                        <tbody className="divide-y dark:divide-gray-700">
                            {sortedStreakStats.map(player => (
                                <tr key={player.name} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td className="p-3 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap"><Link to={`/profile/${player.username}`} className="hover:text-deep-blue dark:hover:text-blue-400 hover:underline">{player.name}</Link></td>
                                    <td className="p-3 text-center font-mono text-emerald-600 dark:text-emerald-400">{player.positiveStreakCount}</td>
                                    <td className="p-3 text-center font-mono text-gray-500 dark:text-gray-400">{player.neutralStreakCount}</td>
                                    <td className="p-3 text-center font-mono text-red-600 dark:text-red-500">{player.negativeStreakCount}</td>
                                    <td className="p-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">+{player.biggestJump}</td>
                                    <td className="p-3 text-center font-mono font-bold text-red-600 dark:text-red-500">{player.biggestDrop}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Mejores y Peores Puntuaciones por Jugador</h3>
                <div className="overflow-x-auto">
                     <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/60"><tr className="border-b dark:border-gray-700">
                            <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300 w-1/4"><button onClick={() => requestTopScoresSort('name')} className="flex items-center">Jugador {getSortIndicator('name', 'top_scores')}</button></th>
                            <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300 w-1/4 flex items-center gap-2"><ThumbsUp className="text-emerald-500"/> Top 5 Mejores Jornadas</th>
                             <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestTopScoresSort('avgTop5')} className="flex items-center justify-center w-full">Media Top 5 {getSortIndicator('avgTop5', 'top_scores')}</button></th>
                            <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300 w-1/4 flex items-center gap-2"><ThumbsDown className="text-red-500"/> Top 5 Peores Jornadas</th>
                             <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestTopScoresSort('avgWorst5')} className="flex items-center justify-center w-full">Media Peor 5 {getSortIndicator('avgWorst5', 'top_scores')}</button></th>
                        </tr></thead>
                        <tbody className="divide-y dark:divide-gray-700">
                            {sortedTopWorstScores.map((player) => (
                                <tr key={player.uid} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td className="p-3 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap"><Link to={`/profile/${player.username}`} className="hover:text-deep-blue dark:hover:text-blue-400 hover:underline">{player.name}</Link></td>
                                    <td className="p-3 font-mono text-emerald-600 dark:text-emerald-400">{player.top5Scores.join(', ')}</td>
                                    <td className="p-3 text-center font-mono font-bold text-emerald-700 dark:text-emerald-300">{player.avgTop5}</td>
                                    <td className="p-3 font-mono text-red-600 dark:text-red-500">{player.worst5Scores.join(', ')}</td>
                                    <td className="p-3 text-center font-mono font-bold text-red-700 dark:text-red-300">{player.avgWorst5}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Rendimiento por Jugador Alineado</h3>
                     <select value={playerPerformanceFilter} onChange={e => setPlayerPerformanceFilter(e.target.value)} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">
                        <option value="general">Todos</option>
                        {Object.entries(season.members).map(([uid, member]) => <option key={uid} value={uid}>{member.teamName}</option>)}
                    </select>
                </div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/60"><tr className="border-b dark:border-gray-700">
                            <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestPlayerPerfSort('name')} className="flex items-center">Jugador {getSortIndicator('name', 'player_perf')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestPlayerPerfSort('fielded')} className="flex items-center justify-center w-full">Alineado {getSortIndicator('fielded', 'player_perf')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestPlayerPerfSort('bench')} className="flex items-center justify-center w-full">Banquillo {getSortIndicator('bench', 'player_perf')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestPlayerPerfSort('captain')} className="flex items-center justify-center w-full">Capitán Extra {getSortIndicator('captain', 'player_perf')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestPlayerPerfSort('wasted')} className="flex items-center justify-center w-full">Banquillo Desperdiciado {getSortIndicator('wasted', 'player_perf')}</button></th>
                            <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300"><button onClick={() => requestPlayerPerfSort('total')} className="flex items-center justify-center w-full">Puntos Totales {getSortIndicator('total', 'player_perf')}</button></th>
                        </tr></thead>
                        <tbody className="divide-y dark:divide-gray-700">
                            {sortedPlayerPerformance.map(player => (
                                <tr key={player.name} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td className="p-3 font-semibold text-gray-800 dark:text-gray-200">{player.name}</td>
                                    <td className="p-3 text-center font-mono">{player.fielded || 0}</td>
                                    <td className="p-3 text-center font-mono">{player.bench || 0}</td>
                                    <td className="p-3 text-center font-mono">{player.captain || 0}</td>
                                    <td className="p-3 text-center font-mono text-red-500">{player.wasted || 0}</td>
                                    <td className="p-3 text-center font-mono font-bold text-emerald-600">{player.total || 0}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"> <div className="flex items-center gap-2 mb-4"><Filter size={18} className="text-gray-600 dark:text-gray-400" /><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Filtros para Gráficos de Evolución</h3></div> <div className="flex flex-wrap items-center gap-4"><div className="flex items-center gap-2"><label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Desde Jornada:</label><select value={startRound} onChange={e => setStartRound(Number(e.target.value))} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">{Array.from({ length: roundsData.length }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}</select></div><div className="flex items-center gap-2"><label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Hasta Jornada:</label><select value={endRound} onChange={e => setEndRound(Number(e.target.value))} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">{Array.from({ length: roundsData.length }, (_, i) => i + 1).filter(r => r >= startRound).map(r => <option key={r} value={r}>{r}</option>)}</select></div></div> </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Evolución de Puntos Totales</h3><ResponsiveContainer width="100%" height={300}><LineChart data={sanitizedPointsEvolution}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="name" tick={{ fill: tickColor }} /><YAxis tick={{ fill: tickColor }} domain={['dataMin - 20', 'dataMax + 20']}/><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }} /><Legend wrapperStyle={{ color: tickColor }}/><>{Object.keys(memberColors).map(name => (<Line key={name} type="monotone" dataKey={name} stroke={memberColors[name]} strokeWidth={2} dot={false} activeDot={{ r: 6 }}/>))}</></LineChart></ResponsiveContainer></div>
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Evolución de Posiciones</h3><ResponsiveContainer width="100%" height={300}><LineChart data={sanitizedPositionEvolution}><CartesianGrid strokeDasharray="3 3" stroke={gridColor}/><XAxis dataKey="name" tick={{ fill: tickColor }} /><YAxis reversed={true} domain={[1, 'dataMax + 1']} allowDecimals={false} tick={{ fill: tickColor }}/><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }}/><Legend wrapperStyle={{ color: tickColor }}/><>{Object.keys(memberColors).map(name => (<Line key={name} type="monotone" dataKey={name} stroke={memberColors[name]} strokeWidth={2} dot={false} activeDot={{ r: 6 }}/>))}</></LineChart></ResponsiveContainer></div>
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Rendimiento vs. Media</h3><select value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">{Object.entries(season.members).map(([uid, member]) => <option key={uid} value={uid}>{member.teamName}</option>)}</select></div><ResponsiveContainer width="100%" height={300}><LineChart data={sanitizedPlayerPerformance}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="name" tick={{ fill: tickColor }} /><YAxis tick={{ fill: tickColor }} /><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }} /><Legend wrapperStyle={{ color: tickColor }} /><Line connectNulls type="monotone" dataKey="Puntos del Jugador" name={season.members[selectedPlayer]?.teamName} stroke="#8884d8" strokeWidth={2} dot={false} activeDot={{ r: 6 }}/><Line connectNulls type="monotone" dataKey="Media de la Liga" stroke="#82ca9d" strokeWidth={2} dot={false} activeDot={{ r: 6 }}/></LineChart></ResponsiveContainer></div>
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><div className="mb-4"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Comparativa de Jugadores</h3><div className="flex gap-4 mt-2"><select value={player1} onChange={e => setPlayer1(e.target.value)} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">{Object.entries(season.members).map(([uid, member]) => { if(uid === player2) return null; return <option key={uid} value={uid}>{member.teamName}</option>})}</select><select value={player2} onChange={e => setPlayer2(e.target.value)} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">{Object.entries(season.members).map(([uid, member]) => { if(uid === player1) return null; return <option key={uid} value={uid}>{member.teamName}</option>})}</select></div></div><ResponsiveContainer width="100%" height={300}><LineChart data={sanitizedH2hChart}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="name" tick={{ fill: tickColor }} /><YAxis tick={{ fill: tickColor }} domain={['dataMin - 10', 'dataMax + 10']} /><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }}/><Legend wrapperStyle={{ color: tickColor }}/> <Line type="monotone" dataKey={season.members[player1]?.teamName} stroke="#8884d8" strokeWidth={2} dot={false} activeDot={{ r: 6 }}/> <Line type="monotone" dataKey={season.members[player2]?.teamName} stroke="#82ca9d" strokeWidth={2} dot={false} activeDot={{ r: 6 }}/></LineChart></ResponsiveContainer></div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Distribución de Puntuaciones por Jornada</h3><ResponsiveContainer width="100%" height={300}><BarChart data={memoizedStats.scoreDistribution}><CartesianGrid strokeDasharray="3 3" stroke={gridColor}/><XAxis dataKey="name" tick={{fill: tickColor}}/><YAxis tick={{fill: tickColor}} allowDecimals={false} /><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }} cursor={{fill: 'rgba(139, 92, 246, 0.1)'}} /> <Bar dataKey="value" name="Nº de Jornadas">{memoizedStats.scoreDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Bar> </BarChart></ResponsiveContainer></div>
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Consistencia de Jugadores (Media vs. Máx)</h3><ResponsiveContainer width="100%" height={300}><RadarChart cx="50%" cy="50%" outerRadius="80%" data={memoizedStats.playerConsistencyData}><PolarGrid stroke={gridColor}/><PolarAngleAxis dataKey="subject" tick={{fill: tickColor}} /><PolarRadiusAxis angle={30} domain={[0, 'dataMax + 10']} tick={{fill: tickColor}}/><Radar name="Media" dataKey="A" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} /><Radar name="Punt. Máx" dataKey="B" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.6} /><Legend wrapperStyle={{ color: tickColor }}/><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }}/></RadarChart></ResponsiveContainer></div>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2"><UserCheck size={20}/> Puntos Extra por Capitán</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={memoizedStats.captainPointsData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                            <XAxis type="number" tick={{fill: tickColor}} />
                            <YAxis dataKey="name" type="category" width={100} tick={{fill: tickColor}}/>
                            <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }} formatter={(value) => `${value} pts`}/>
                            <Legend wrapperStyle={{ color: tickColor }}/>
                            <Bar dataKey="Puntos Extra Capitán" fill="#f59e0b" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                 <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2"><Sofa size={20}/> Puntos Desperdiciados en el Banquillo</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={memoizedStats.benchPointsData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                            <XAxis type="number" tick={{fill: tickColor}} />
                            <YAxis dataKey="name" type="category" width={100} tick={{fill: tickColor}}/>
                            <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }} formatter={(value) => `${value} pts`}/>
                            <Legend wrapperStyle={{ color: tickColor }}/>
                            <Bar dataKey="Puntos Desperdiciados" fill="#7c3aed" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                 <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Shield size={20}/> Puntos por Posición</h3>
                        <select value={pointsByPositionFilter} onChange={e => setPointsByPositionFilter(e.target.value)} className="input text-sm !w-auto !py-1 dark:bg-gray-700 dark:border-gray-600">
                            <option value="general">General de la Liga</option>
                            {Object.entries(season.members).map(([uid, member]) => <option key={uid} value={uid}>{member.teamName}</option>)}
                        </select>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={memoizedStats.pointsByPositionData[pointsByPositionFilter]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                {(memoizedStats.pointsByPositionData[pointsByPositionFilter] || []).map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }} formatter={(value) => `${value.toLocaleString()} pts`}/>
                            <Legend wrapperStyle={{ color: tickColor }}/>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                 <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2"><Users size={20}/> Valor de Equipo vs Puntos Totales</h3>
                     <ResponsiveContainer width="100%" height={300}>
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <CartesianGrid stroke={gridColor}/>
                            <XAxis type="number" dataKey="x" name="Valor de Equipo" unit="€" domain={['dataMin - 10000000', 'dataMax + 10000000']} tickFormatter={(value) => `${value/1000000}M`} tick={{fill: tickColor}}>
                                <Label value="Valor de Equipo" offset={-15} position="insideBottom" fill={tickColor}/>
                            </XAxis>
                            <YAxis type="number" dataKey="y" name="Puntos Totales" unit="pts" domain={['dataMin - 20', 'dataMax + 20']} tick={{fill: tickColor}}>
                                <Label value="Puntos Totales" angle={-90} offset={0} position="insideLeft" style={{ textAnchor: 'middle', fill: tickColor }}/>
                            </YAxis>
                             <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }} formatter={(value, name) => (name === 'Valor de Equipo' ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value) : value)}/>
                            <Scatter name="Managers" data={memoizedStats.teamValueVsPointsData} fill="#8884d8">
                                {memoizedStats.teamValueVsPointsData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={memberColors[entry.name] || '#8884d8'} />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Distribución de Podios</h3><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={memoizedStats.podiumDistributionForPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>{memoizedStats.podiumDistributionForPie.map((entry) => (<Cell key={`cell-${entry.name}`} fill={PODIUM_COLORS[entry.name]} />))}</Pie><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }}/><Legend wrapperStyle={{ color: tickColor }}/></PieChart></ResponsiveContainer></div>
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6"><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Farolillo Rojo (Últimas Posiciones)</h3>{memoizedStats.lastPlaceFinishes.length > 0 ? (<ResponsiveContainer width="100%" height={300}><BarChart layout="vertical" data={memoizedStats.lastPlaceFinishes} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis type="number" tick={{fill: tickColor}} allowDecimals={false}/><YAxis dataKey="name" type="category" width={100} tick={{fill: tickColor}}/><Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: `1px solid ${gridColor}` }}/><Legend wrapperStyle={{ color: tickColor }}/><Bar dataKey="Último Puesto" fill="#ef4444" /></BarChart></ResponsiveContainer>) : ( <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">Nadie ha quedado último todavía.</div>)}</div>
            </div>
            
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Jornadas sin puntuar (NR / No11)</h3>
                {memoizedStats.nonScoringRoundsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart layout="vertical" data={memoizedStats.nonScoringRoundsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
            </>         
           )}
        </div>
    );
}