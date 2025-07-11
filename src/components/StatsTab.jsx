import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { Link } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Award, Star, TrendingUp, Zap, Scale, Swords, Filter } from 'lucide-react';

const StatHighlightCard = ({ title, value, subValue, colorClass, icon }) => (
    <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex justify-between items-start">
            <h4 className="font-semibold text-gray-800">{title}</h4>
            <div className={`text-xl ${colorClass}`}>{icon}</div>
        </div>
        <p className={`text-3xl font-bold ${colorClass} mt-2`}>{value}</p>
        {subValue && <p className="text-sm text-gray-500">{subValue}</p>}
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
    const last = names.pop();
    return `${names.join(', ')}, y ${last}`;
};

export default function StatsTab({ league }) {
    const [roundsData, setRoundsData] = useState([]);
    const [loading, setLoading] = useState(true);
    const userId = auth.currentUser?.uid;
    const memberCount = Object.keys(league.members).length;

    const [startRound, setStartRound] = useState(1);
    const [endRound, setEndRound] = useState(1);
    const [selectedPlayer, setSelectedPlayer] = useState(userId || '');
    const [player1, setPlayer1] = useState(Object.keys(league.members)[0] || '');
    const [player2, setPlayer2] = useState(Object.keys(league.members)[1] || '');

    useEffect(() => {
        const fetchRounds = async () => {
            setLoading(true);
            const roundsRef = collection(db, 'leagues', league.id, 'rounds');
            const q = query(roundsRef, orderBy('roundNumber'));
            const querySnapshot = await getDocs(q);
            const rounds = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRoundsData(rounds);
            if (rounds.length > 0) {
                setEndRound(rounds.length);
            }
            setLoading(false);
        };
        fetchRounds();
    }, [league.id]);

    const { positionStats, detailedPlayerStats, headToHeadStats, leagueRecords, scoreDistribution } = useMemo(() => {
        if (roundsData.length === 0) return { positionStats: [], detailedPlayerStats: [], headToHeadStats: {}, leagueRecords: {}, scoreDistribution: [] };
        
        const posStats = {};
        const detailedStats = {};
        const h2hStats = {};

        Object.entries(league.members).forEach(([uid, data]) => {
            posStats[uid] = { name: data.teamName, username: data.username, positionCounts: Array(memberCount).fill(0), podiums: 0, top5: 0, top10: 0, lastPlaces: 0, participations: 0, gold: 0, silver: 0, bronze: 0 };
            detailedStats[uid] = { name: data.teamName, username: data.username, scores: [] };
            h2hStats[uid] = { name: data.teamName, username: data.username, wins: {} };
            Object.keys(league.members).forEach(opponentUid => { if (uid !== opponentUid) h2hStats[uid].wins[opponentUid] = 0; });
        });
        
        const allScores = [];
        roundsData.forEach(round => {
            const rankedScores = Object.entries(round.scores).map(([uid, points]) => ({ uid, points })).sort((a, b) => b.points - a.points);
            const participantsThisRound = rankedScores.length;
            rankedScores.forEach((player, index) => {
                const rank = index + 1;
                if (posStats[player.uid]) {
                    if (rank === 1) posStats[player.uid].gold++; if (rank === 2) posStats[player.uid].silver++; if (rank === 3) posStats[player.uid].bronze++;
                    posStats[player.uid].positionCounts[rank - 1]++;
                    if (rank <= 3) posStats[player.uid].podiums++; if (rank <= 5) posStats[player.uid].top5++; if (rank <= 10) posStats[player.uid].top10++;
                    posStats[player.uid].participations++;
                    if (rank === participantsThisRound) posStats[player.uid].lastPlaces++;
                }
                if (detailedStats[player.uid]) detailedStats[player.uid].scores.push(player.points);
                allScores.push(player.points);
                rankedScores.forEach(opponent => { if (player.uid !== opponent.uid && player.points > opponent.points) h2hStats[player.uid].wins[opponent.uid]++; });
            });
        });

        const finalDetailedStats = Object.values(detailedStats).map(p => {
            const validScores = p.scores.filter(s => typeof s === 'number');
            const participations = validScores.length;
            const best = participations > 0 ? Math.max(...validScores) : 0;
            const worst = participations > 0 ? Math.min(...validScores) : 0;
            const averageNum = participations > 0 ? (validScores.reduce((a, b) => a + b, 0) / participations) : 0;
            const regularityNum = calculateStandardDeviation(validScores);
            return { ...p, best, worst, average: averageNum.toFixed(1), regularity: regularityNum.toFixed(2), averageNum, regularityNum, participations };
        });

        const finalPositionStats = Object.values(posStats);
        
        const bestScoreRecordValue = Math.max(0, ...finalDetailedStats.map(p => p.best));
        const bestScoreHolders = finalDetailedStats.filter(p => p.best === bestScoreRecordValue).map(p => p.name);
        const mostPodiumsValue = Math.max(0, ...finalPositionStats.map(p => p.podiums));
        const mostPodiumsHolders = finalPositionStats.filter(p => p.podiums === mostPodiumsValue).map(p => p.name);
        const bestAverageValue = Math.max(0, ...finalDetailedStats.map(p => p.averageNum));
        const bestAverageHolders = finalDetailedStats.filter(p => p.averageNum === bestAverageValue).map(p => p.name);
        const regularities = finalDetailedStats.filter(p => p.participations > 1).map(p => p.regularityNum);
        const mostRegularValue = regularities.length > 0 ? Math.min(...regularities) : null;
        const mostRegularHolders = mostRegularValue !== null ? finalDetailedStats.filter(p => p.regularityNum === mostRegularValue).map(p => p.name) : [];
        const records = {
            bestScore: { value: bestScoreRecordValue, holders: bestScoreHolders },
            mostPodiums: { value: mostPodiumsValue, holders: mostPodiumsHolders },
            bestAverage: { value: bestAverageValue.toFixed(1), holders: bestAverageHolders },
            mostRegular: { value: mostRegularValue !== null ? mostRegularValue.toFixed(2) : 'N/A', holders: mostRegularHolders },
        };

        const scoreBrackets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81+': 0 };
        allScores.forEach(score => {
            if (score <= 20) scoreBrackets['0-20']++; else if (score <= 40) scoreBrackets['21-40']++; else if (score <= 60) scoreBrackets['41-60']++; else if (score <= 80) scoreBrackets['61-80']++; else scoreBrackets['81+']++;
        });
        const finalScoreDistribution = Object.entries(scoreBrackets).map(([name, value]) => ({ name, value }));
        
        return { positionStats: finalPositionStats, detailedPlayerStats: finalDetailedStats, headToHeadStats: h2hStats, leagueRecords: records, scoreDistribution: finalScoreDistribution };
    }, [roundsData, league.members, memberCount]);

    const { pointsEvolutionChartData, positionEvolutionChartData, playerPerformanceChartData, h2hChartData } = useMemo(() => {
        const cumulativeScores = {}, pointsEvolution = [], positionEvolution = [], playerPerformance = [], h2hEvolution = [];
        const memberNames = {}; const h2hCumulative = {};
        Object.entries(league.members).forEach(([uid, data]) => { memberNames[uid] = data.teamName; cumulativeScores[uid] = 0; if (uid === player1 || uid === player2) h2hCumulative[uid] = 0; });
        const filteredRounds = roundsData.slice(startRound - 1, endRound);
        filteredRounds.forEach(round => {
            let roundTotal = 0, roundParticipants = 0;
            for (const uid in round.scores) {
                if (cumulativeScores[uid] !== undefined) cumulativeScores[uid] += round.scores[uid];
                if (h2hCumulative[uid] !== undefined) h2hCumulative[uid] += round.scores[uid];
                roundTotal += round.scores[uid]; roundParticipants++;
            }
            const rankedPlayers = Object.keys(cumulativeScores).map(uid => ({ uid, points: cumulativeScores[uid] })).sort((a, b) => b.points - a.points);
            const roundRanks = {};
            rankedPlayers.forEach((player, index) => { let rank; if (index > 0 && player.points === rankedPlayers[index - 1].points) { rank = roundRanks[rankedPlayers[index - 1].uid]; } else { rank = index + 1; } roundRanks[player.uid] = rank; });
            const positionDataPoint = { name: `J${round.roundNumber}` }, pointsDataPoint = { name: `J${round.roundNumber}` };
            for (const uid in memberNames) { positionDataPoint[memberNames[uid]] = roundRanks[uid]; pointsDataPoint[memberNames[uid]] = cumulativeScores[uid]; }
            positionEvolution.push(positionDataPoint); pointsEvolution.push(pointsDataPoint);
            playerPerformance.push({ name: `J${round.roundNumber}`, "Puntos del Jugador": round.scores[selectedPlayer] || 0, "Media de la Liga": roundParticipants > 0 ? parseFloat((roundTotal / roundParticipants).toFixed(1)) : 0 });
            if(player1 && player2) { h2hEvolution.push({ name: `J${round.roundNumber}`, [memberNames[player1]]: h2hCumulative[player1], [memberNames[player2]]: h2hCumulative[player2] }); }
        });
        return { pointsEvolutionChartData: pointsEvolution, positionEvolutionChartData: positionEvolution, playerPerformanceChartData: playerPerformance, h2hChartData: h2hEvolution };
    }, [roundsData, league.members, userId, selectedPlayer, player1, player2, startRound, endRound]);
    
    const memberColors = useMemo(() => {
        const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F', '#FFBB28', '#FF8042', '#0088FE', '#A4DE6C', '#DE6C8A'];
        const assignedColors = {};
        Object.keys(league.members).forEach((uid, index) => { assignedColors[league.members[uid].teamName] = colors[index % colors.length]; });
        return assignedColors;
    }, [league.members]);

    if (loading) return <p>Calculando estadísticas...</p>;

    return (
        <div className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                 <StatHighlightCard title="Récord de Puntos" value={`${leagueRecords.bestScore?.value || 0} pts`} subValue={`por ${formatHolderNames(leagueRecords.bestScore?.holders)}`} colorClass="text-energetic-orange" icon={<Zap/>}/>
                 <StatHighlightCard title="Más Podios" value={`${leagueRecords.mostPodiums?.value || 0}`} subValue={`por ${formatHolderNames(leagueRecords.mostPodiums?.holders)}`} colorClass="text-vibrant-purple" icon={<Award/>}/>
                 <StatHighlightCard title="Mejor Media" value={`${leagueRecords.bestAverage?.value || 0} pts`} subValue={`por ${formatHolderNames(leagueRecords.bestAverage?.holders)}`} colorClass="text-emerald-500" icon={<TrendingUp/>}/>
                 <StatHighlightCard title="Más Regular" value={`${leagueRecords.mostRegular?.value || 'N/A'}`} subValue={`por ${formatHolderNames(leagueRecords.mostRegular?.holders)}`} colorClass="text-deep-blue" icon={<Scale/>}/>
            </div>
            <div className="bg-white rounded-xl shadow-sm border"><div className="p-6"><h3 className="text-lg font-semibold text-gray-800">Estadísticas Detalladas por Jugador</h3></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr className="border-b"><th className="p-3 text-left font-semibold text-gray-600">Jugador</th><th className="p-3 text-center font-semibold text-gray-600">Media Pts</th><th className="p-3 text-center font-semibold text-gray-600">Mejor Jornada</th><th className="p-3 text-center font-semibold text-gray-600">Peor Jornada</th><th className="p-3 text-center font-semibold text-gray-600">Regularidad (Desv.)</th></tr></thead><tbody>{detailedPlayerStats.map(member => (<tr key={member.name} className="border-b last:border-b-0 hover:bg-gray-50"><td className="p-3 font-semibold text-gray-800 whitespace-nowrap"><Link to={`/profile/${member.username}`} className="hover:text-deep-blue hover:underline">{member.name}</Link></td><td className="p-3 text-center font-mono font-bold text-blue-600">{member.average}</td><td className="p-3 text-center font-mono font-bold text-emerald-600">{member.best}</td><td className="p-3 text-center font-mono font-bold text-red-600">{member.worst}</td><td className="p-3 text-center font-mono font-bold text-gray-600">{member.regularity}</td></tr>))}</tbody></table></div></div>
            <div className="bg-white rounded-xl shadow-sm border"><div className="p-6"><h3 className="text-lg font-semibold text-gray-800">Resumen de Posiciones por Jornada</h3></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr className="border-b"><th className="p-3 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10">Participante</th>{Array.from({ length: memberCount }, (_, i) => i + 1).map(pos => (<th key={pos} className={`p-3 text-center font-semibold text-gray-600 ${pos <= 3 ? 'bg-yellow-50' : ''}`}>{pos}º</th>))}<th className="p-3 text-center font-semibold text-gray-600 bg-blue-50">Podios</th><th className="p-3 text-center font-semibold text-gray-600 bg-blue-50">Top 5</th><th className="p-3 text-center font-semibold text-gray-600 bg-blue-50">Top 10</th><th className="p-3 text-center font-semibold text-gray-600 bg-red-50">Último</th><th className="p-3 text-center font-semibold text-gray-600 bg-emerald-50">Participaciones</th></tr></thead><tbody>{positionStats.map(member => (<tr key={member.name} className="border-b last:border-b-0 hover:bg-gray-50"><td className="p-3 font-semibold text-gray-800 whitespace-nowrap sticky left-0 bg-white hover:bg-gray-50 z-10"><Link to={`/profile/${member.username}`} className="hover:text-deep-blue hover:underline">{member.name}</Link></td>{member.positionCounts.map((count, index) => (<td key={index} className={`p-3 text-center font-mono ${count > 0 ? 'font-bold text-gray-700' : 'text-gray-400'} ${index < 3 ? 'bg-yellow-50' : ''}`}>{count}</td>))}<td className="p-3 text-center font-mono font-bold text-gray-700 bg-blue-50">{member.podiums}</td><td className="p-3 text-center font-mono font-bold text-gray-700 bg-blue-50">{member.top5}</td><td className="p-3 text-center font-mono font-bold text-gray-700 bg-blue-50">{member.top10}</td><td className="p-3 text-center font-mono font-bold text-gray-700 bg-red-50">{member.lastPlaces}</td><td className="p-3 text-center font-mono font-bold text-gray-700 bg-emerald-50">{member.participations}</td></tr>))}</tbody></table></div></div>
            <div className="bg-white rounded-xl shadow-sm border"><div className="p-6"><h3 className="text-lg font-semibold text-gray-800">Cara a Cara (Victorias por jornada)</h3><p className="text-sm text-gray-500">El número indica las victorias del jugador de la fila sobre el de la columna.</p></div><div className="overflow-x-auto p-6"><table className="w-full text-sm border-collapse">
                <thead className="bg-gray-50"><tr><th className="p-2 border-b border-r sticky left-0 bg-gray-50 z-10 font-semibold text-gray-600">vs</th>{Object.values(league.members).map(m => <th key={m.teamName} className="p-1 w-12 h-16 text-center transform -rotate-45 font-semibold text-gray-600 border-b"><div><span>{m.teamName}</span></div></th>)}</tr></thead>
                <tbody>{Object.entries(headToHeadStats).map(([uid, data]) => (<tr key={uid} className="hover:bg-gray-50"><td className="p-2 font-semibold text-gray-800 whitespace-nowrap sticky left-0 bg-white hover:bg-gray-50 z-10 border-r"><Link to={`/profile/${data.username}`} className="hover:text-deep-blue hover:underline">{data.name}</Link></td>{Object.keys(league.members).map(opponentUid => {
                    if (uid === opponentUid) return <td key={opponentUid} className="p-2 text-center font-mono bg-gray-200 border-r">X</td>;
                    const wins = data.wins[opponentUid] || 0; const losses = headToHeadStats[opponentUid]?.wins[uid] || 0;
                    let bgColor = 'bg-white'; if (wins > losses) bgColor = 'bg-emerald-100'; else if (losses > wins) bgColor = 'bg-red-100'; else if (wins === losses && wins > 0) bgColor = 'bg-yellow-100';
                    return <td key={opponentUid} title={`${data.name} ${wins} - ${losses} ${headToHeadStats[opponentUid]?.name}`} className={`p-2 text-center font-mono border-r ${bgColor} transition-colors`}>{wins}</td>
                })}</tr>))}</tbody>
            </table></div></div>
            
            <div className="bg-white rounded-xl shadow-sm border p-6">
                 <div className="flex items-center gap-2 mb-4"><Filter size={18} className="text-gray-600" /><h3 className="text-lg font-semibold text-gray-800">Filtros para Gráficos de Evolución</h3></div>
                 <div className="flex flex-wrap items-center gap-4"><div className="flex items-center gap-2"><label className="text-sm font-semibold text-gray-600">Desde Jornada:</label><select value={startRound} onChange={e => setStartRound(Number(e.target.value))} className="input text-sm !w-auto !py-1">{Array.from({ length: roundsData.length }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}</select></div><div className="flex items-center gap-2"><label className="text-sm font-semibold text-gray-600">Hasta Jornada:</label><select value={endRound} onChange={e => setEndRound(Number(e.target.value))} className="input text-sm !w-auto !py-1">{Array.from({ length: roundsData.length }, (_, i) => i + 1).filter(r => r >= startRound).map(r => <option key={r} value={r}>{r}</option>)}</select></div></div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border p-6"><h3 className="text-lg font-semibold text-gray-800 mb-4">Evolución de Puntos Totales</h3>{pointsEvolutionChartData.length > 0 ? (<ResponsiveContainer width="100%" height={300}><LineChart data={pointsEvolutionChartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis domain={['dataMin - 20', 'dataMax + 20']}/><Tooltip /><Legend />{Object.keys(memberColors).map(name => (<Line key={name} type="monotone" dataKey={name} stroke={memberColors[name]} strokeWidth={2} />))}</LineChart></ResponsiveContainer>) : <p className="text-gray-500">No hay datos para mostrar.</p>}</div>
                <div className="bg-white rounded-xl shadow-sm border p-6"><h3 className="text-lg font-semibold text-gray-800 mb-4">Evolución de Posiciones</h3>{positionEvolutionChartData.length > 1 ? (<ResponsiveContainer width="100%" height={300}><LineChart data={positionEvolutionChartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis reversed={true} domain={[1, memberCount]} allowDecimals={false} /><Tooltip /><Legend />{Object.keys(memberColors).map(name => (<Line key={name} type="monotone" dataKey={name} stroke={memberColors[name]} strokeWidth={2} />))}</LineChart></ResponsiveContainer>) : <p className="text-gray-500">Se necesita más de una jornada para mostrar la evolución.</p>}</div>
                <div className="bg-white rounded-xl shadow-sm border p-6"><div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold text-gray-800">Rendimiento vs. Media</h3><select value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)} className="input text-sm !w-auto !py-1">{Object.entries(league.members).map(([uid, member]) => <option key={uid} value={uid}>{member.teamName}</option>)}</select></div>{playerPerformanceChartData.length > 0 ? (<ResponsiveContainer width="100%" height={300}><LineChart data={playerPerformanceChartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="Puntos del Jugador" name={league.members[selectedPlayer]?.teamName} stroke="#8884d8" strokeWidth={2} /><Line type="monotone" dataKey="Media de la Liga" stroke="#82ca9d" /></LineChart></ResponsiveContainer>) : <p>No hay datos</p>}</div>
                <div className="bg-white rounded-xl shadow-sm border p-6"><div className="mb-4"><h3 className="text-lg font-semibold text-gray-800">Comparativa de Jugadores</h3><div className="flex gap-4 mt-2"><select value={player1} onChange={e => setPlayer1(e.target.value)} className="input text-sm !w-auto !py-1">{Object.entries(league.members).map(([uid, member]) => { if(uid === player2) return null; return <option key={uid} value={uid}>{member.teamName}</option>})}</select><select value={player2} onChange={e => setPlayer2(e.target.value)} className="input text-sm !w-auto !py-1">{Object.entries(league.members).map(([uid, member]) => { if(uid === player1) return null; return <option key={uid} value={uid}>{member.teamName}</option>})}</select></div></div>{h2hChartData.length > 0 ? (<ResponsiveContainer width="100%" height={300}><LineChart data={h2hChartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis domain={['dataMin - 10', 'dataMax + 10']} /><Tooltip /><Legend />
                    <Line type="monotone" dataKey={league.members[player1]?.teamName} stroke="#8884d8" strokeWidth={2} />
                    <Line type="monotone" dataKey={league.members[player2]?.teamName} stroke="#82ca9d" strokeWidth={2} />
                </LineChart></ResponsiveContainer>) : <p>No hay datos</p>}</div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border p-6"><h3 className="text-lg font-semibold text-gray-800 mb-4">Distribución de Puntuaciones por Jornada</h3>{roundsData.length > 0 ? (<ResponsiveContainer width="100%" height={300}><BarChart data={scoreDistribution}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip cursor={{fill: 'rgba(236, 253, 245, 0.5)'}} />
                <Bar dataKey="value" name="Nº de Jornadas">{scoreDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={memberColors[Object.keys(memberColors)[index % Object.keys(memberColors).length]]} />)}</Bar>
            </BarChart></ResponsiveContainer>) : <p className="text-gray-500">No hay datos de puntuaciones.</p>}</div>
        </div>
    );
}