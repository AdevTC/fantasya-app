import React, { useState, useMemo, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, AreaChart, Area } from 'recharts';
import { formatCurrency } from '../utils/helpers';
import { Link } from 'react-router-dom';
import { ShoppingCart, DollarSign, Repeat, TrendingUp, TrendingDown, BarChartHorizontal, Users } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

const StatCard = ({ title, value, subValue, colorClass, icon }) => (
    <div className="bg-white rounded-xl shadow-sm border p-6 h-full flex flex-col justify-between">
        <div>
            <div className="flex justify-between items-start">
                <h4 className="font-semibold text-gray-800">{title}</h4>
                <div className={`text-xl ${colorClass}`}>{icon}</div>
            </div>
            <p className={`text-2xl lg:text-3xl font-bold ${colorClass} mt-2`}>{value}</p>
        </div>
        {subValue && <p className="text-sm text-gray-500 truncate" title={subValue}>{subValue}</p>}
    </div>
);

const formatHolderNames = (names) => {
    if (!names || names.length === 0) return 'N/A';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names.join(' y ');
    const last = names.pop();
    return `${names.join(', ')}, y ${last}`;
};

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F'];

export default function TransferStats({ transfers, members }) {
    const [playersDB, setPlayersDB] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('total');
    const [selectedTeam, setSelectedTeam] = useState('all');

    useEffect(() => {
        const fetchPlayers = async () => {
            setLoading(true);
            const playersSnapshot = await getDocs(collection(db, 'players'));
            const playersList = playersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPlayersDB(playersList);
            setLoading(false);
        };
        fetchPlayers();
    }, []);

    const stats = useMemo(() => {
        if (transfers.length === 0 || playersDB.length === 0) return null;

        const memberStats = {};
        Object.keys(members).forEach(uid => {
            memberStats[uid] = { spent: { total: 0, clausulazo: 0, puja: 0, acuerdo: 0 }, earned: { total: 0, clausulazo: 0, puja: 0, acuerdo: 0 }, buys: { total: 0, clausulazo: 0, puja: 0, acuerdo: 0 }, sells: { total: 0, clausulazo: 0, puja: 0, acuerdo: 0 } };
        });

        const playerTradeCount = {};
        const transferTypeCount = { clausulazo: 0, puja: 0, acuerdo: 0 };
        const activityByDate = {};
        const avgCostPerType = { clausulazo: { total: 0, count: 0 }, puja: { total: 0, count: 0 }, acuerdo: { total: 0, count: 0 } };
        const transfersByTeam = {};
        let totalVolume = 0;
        let cumulativeSpending = {};

        transfers.forEach(t => {
            const type = t.type;
            totalVolume += t.price;

            if (memberStats[t.buyerId]) {
                memberStats[t.buyerId].buys.total++;
                memberStats[t.buyerId].spent.total += t.price;
                if(memberStats[t.buyerId].buys[type] !== undefined) {
                    memberStats[t.buyerId].buys[type]++;
                    memberStats[t.buyerId].spent[type] += t.price;
                }
            }
            if (t.sellerId !== 'market' && memberStats[t.sellerId]) {
                memberStats[t.sellerId].sells.total++;
                memberStats[t.sellerId].earned.total += t.price;
                 if(memberStats[t.sellerId].sells[type] !== undefined) {
                    memberStats[t.sellerId].sells[type]++;
                    memberStats[t.sellerId].earned[type] += t.price;
                }
            }
            
            playerTradeCount[t.playerName] = (playerTradeCount[t.playerName] || 0) + 1;
            if (transferTypeCount[type] !== undefined) transferTypeCount[type]++;
            if (avgCostPerType[type] !== undefined) { avgCostPerType[type].total += t.price; avgCostPerType[type].count++; }

            const date = t.timestamp.toDate().toISOString().split('T')[0];
            activityByDate[date] = (activityByDate[date] || 0) + 1;

            const playerInfo = playersDB.find(p => p.id === t.playerId);
            if (playerInfo) {
                const teamName = playerInfo.teamHistory?.find(h => h.endDate === null)?.teamName || 'Sin Equipo';
                if (!transfersByTeam[teamName]) transfersByTeam[teamName] = { count: 0, players: {} };
                transfersByTeam[teamName].count++;
                transfersByTeam[teamName].players[t.playerName] = (transfersByTeam[teamName].players[t.playerName] || 0) + 1;
            }
        });
        
        // --- LÓGICA DE EMPATES CORREGIDA ---
        const financialSummary = Object.entries(memberStats).map(([uid, data]) => ({
            name: members[uid].teamName, username: members[uid].username, ...data, net: { total: data.earned.total - data.spent.total, clausulazo: data.earned.clausulazo - data.spent.clausulazo, puja: data.earned.puja - data.spent.puja, acuerdo: data.earned.acuerdo - data.spent.acuerdo, }, totalMoves: data.buys.total + data.sells.total
        }));

        const maxSpent = Math.max(...financialSummary.map(m => m.spent.total));
        const marketKings = financialSummary.filter(m => m.spent.total === maxSpent).map(m => m.name);

        const maxNet = Math.max(...financialSummary.map(m => m.net.total));
        const leagueSharks = financialSummary.filter(m => m.net.total === maxNet).map(m => m.name);
        
        const maxMoves = Math.max(...financialSummary.map(m => m.totalMoves));
        const mostActiveTraders = financialSummary.filter(m => m.totalMoves === maxMoves).map(m => m.name);

        const maxPrice = Math.max(...transfers.map(t => t.price));
        const mostExpensiveTransfers = transfers.filter(t => t.price === maxPrice).map(t => `${t.playerName} por ${t.buyerName}`);
        
        const maxTrades = Math.max(...Object.values(playerTradeCount));
        const mostTradedPlayers = Object.entries(playerTradeCount).filter(([, count]) => count === maxTrades).map(([name]) => name);

        const pieChartData = Object.entries(transferTypeCount).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
        const activityChartData = Object.entries(activityByDate).map(([date, count]) => ({ date, fichajes: count })).sort((a,b) => new Date(a.date) - new Date(b.date));
        const avgCostChartData = Object.entries(avgCostPerType).map(([name, data]) => ({ name, costeMedio: data.count > 0 ? data.total / data.count : 0 }));
        
        const top5TradedPlayers = Object.entries(playerTradeCount).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({name, traspasos: count}));

        return { financialSummary, mostExpensiveTransfers, mostTradedPlayers, mostActiveTraders, marketKings, leagueSharks, pieChartData, activityChartData, avgCostChartData, totalVolume, transfersByTeam, top5TradedPlayers };
    }, [transfers, members, playersDB]);

    const filteredTransfersByTeam = useMemo(() => {
        if (!stats) return [];
        if (selectedTeam === 'all') {
            const allPlayers = {};
            Object.values(stats.transfersByTeam).forEach(teamData => {
                Object.entries(teamData.players).forEach(([playerName, count]) => {
                    allPlayers[playerName] = (allPlayers[playerName] || 0) + count;
                });
            });
            return Object.entries(allPlayers).map(([name, count]) => ({name, count})).sort((a,b) => b.count - a.count);
        }
        return Object.entries(stats.transfersByTeam[selectedTeam]?.players || {}).map(([name, count]) => ({name, count})).sort((a,b) => b.count - a.count);
    }, [stats, selectedTeam]);

    if (loading) return <LoadingSpinner text="Cargando estadísticas de fichajes..." />;
    if (!stats) return <div className="text-center p-8 bg-white rounded-xl border">No hay suficientes datos de fichajes para generar estadísticas.</div>;

    return (
        <div className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard title="Volumen Total del Mercado" value={formatCurrency(stats.totalVolume)} subValue={`${transfers.length} transacciones`} colorClass="text-deep-blue" icon={<BarChartHorizontal/>}/>
                <StatCard title="Fichaje(s) Más Caro(s)" value={formatCurrency(Math.max(...transfers.map(t => t.price)))} subValue={formatHolderNames([...stats.mostExpensiveTransfers])} colorClass="text-energetic-orange" icon={<DollarSign/>}/>
                <StatCard title="Jugador(es) Más Traspasado(s)" value={formatHolderNames([...stats.mostTradedPlayers])} subValue={`${Math.max(...Object.values(stats.mostTradedPlayers.reduce((acc, p) => ({...acc, [p]: (acc[p]||0)+1}), {})))} veces`} colorClass="text-vibrant-purple" icon={<Repeat/>}/>
            </div>
             <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard title="Manager(s) Más Activo(s)" value={formatHolderNames([...stats.mostActiveTraders])} subValue={`${Math.max(...stats.financialSummary.map(m => m.totalMoves))} movs.`} colorClass="text-vibrant-purple" icon={<ShoppingCart/>}/>
                <StatCard title="Rey(es) del Mercado" value={formatHolderNames([...stats.marketKings])} subValue={`${formatCurrency(Math.max(...stats.financialSummary.map(m => m.spent.total)))} gastados`} colorClass="text-red-500" icon={<TrendingDown/>}/>
                <StatCard title="Tiburón(es) de la Liga" value={formatHolderNames([...stats.leagueSharks])} subValue={`${formatCurrency(Math.max(...stats.financialSummary.map(m => m.net.total)))} de beneficio`} colorClass="text-emerald-500" icon={<TrendingUp/>}/>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex flex-wrap gap-4 justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Actividad Financiera por Jugador</h3>
                    <div className="flex border border-gray-200 rounded-lg p-1 space-x-1 bg-gray-100">
                        {['total', 'clausulazo', 'puja', 'acuerdo'].map(type => (
                            <button key={type} onClick={() => setFilterType(type)} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors capitalize ${filterType === type ? 'bg-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}>{type === 'total' ? 'Todos' : type}</button>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50"><tr className="border-b"><th className="p-3 text-left font-semibold text-gray-600">Jugador</th><th className="p-3 text-center font-semibold text-gray-600">Compras</th><th className="p-3 text-center font-semibold text-gray-600">Ventas</th><th className="p-3 text-right font-semibold text-gray-600">Gastado</th><th className="p-3 text-right font-semibold text-gray-600">Ingresado</th><th className="p-3 text-right font-semibold text-gray-600">Balance Neto</th></tr></thead>
                        <tbody>{stats.financialSummary.map(m => (<tr key={m.name} className="border-b last:border-b-0 hover:bg-gray-50"><td className="p-3 font-semibold text-gray-800"><Link to={`/profile/${m.username}`} className="hover:text-deep-blue hover:underline">{m.name}</Link></td><td className="p-3 text-center font-mono">{m.buys[filterType]}</td><td className="p-3 text-center font-mono">{m.sells[filterType]}</td><td className="p-3 text-right font-mono text-red-600">{formatCurrency(m.spent[filterType])}</td><td className="p-3 text-right font-mono text-emerald-600">{formatCurrency(m.earned[filterType])}</td><td className={`p-3 text-right font-mono font-bold ${m.net[filterType] >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(m.net[filterType])}</td></tr>))}</tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                 <div className="flex flex-wrap gap-4 justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Jugadores Más Traspasados por Equipo Real</h3>
                     <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} className="input text-sm !w-auto !py-1">
                        <option value="all">Todos los equipos</option>
                        {Object.keys(stats.transfersByTeam).sort().map(team => <option key={team} value={team}>{team}</option>)}
                     </select>
                </div>
                 <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0"><tr className="border-b"><th className="p-3 text-left font-semibold text-gray-600">Jugador</th><th className="p-3 text-center font-semibold text-gray-600">Nº de Traspasos</th></tr></thead>
                        <tbody>{filteredTransfersByTeam.map(p => (<tr key={p.name} className="border-b last:border-b-0 hover:bg-gray-50"><td className="p-3 font-medium text-gray-800">{p.name}</td><td className="p-3 text-center font-mono">{p.count}</td></tr>))}</tbody>
                    </table>
                </div>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Gastos vs Ingresos (Total)</h3>
                     <ResponsiveContainer width="100%" height={300}><BarChart data={stats.financialSummary} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{fontSize: 12}}/><YAxis tickFormatter={(value) => `${value/1000000}M`}/><Tooltip formatter={(value) => formatCurrency(value)} /><Legend /><Bar dataKey="spent.total" name="Gastado" fill="#ef4444" /><Bar dataKey="earned.total" name="Ingresado" fill="#22c55e" /></BarChart></ResponsiveContainer>
                </div>
                 <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Actividad del Mercado por Día</h3>
                     <ResponsiveContainer width="100%" height={300}><AreaChart data={stats.activityChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}><defs><linearGradient id="colorFichajes" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/><stop offset="95%" stopColor="#8884d8" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Area type="monotone" dataKey="fichajes" name="Nº Fichajes" stroke="#8884d8" fillOpacity={1} fill="url(#colorFichajes)" /></AreaChart></ResponsiveContainer>
                </div>
            </div>

             <div className="grid lg:grid-cols-3 gap-6">
                 <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">Distribución por Tipo</h3>
                    <ResponsiveContainer width="100%" height={250}><PieChart><Pie data={stats.pieChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(entry) => `${entry.name} (${entry.value})`}>{stats.pieChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => `${value} fichajes`} /></PieChart></ResponsiveContainer>
                </div>
                 <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Coste Medio por Tipo de Fichaje</h3>
                    <ResponsiveContainer width="100%" height={250}><BarChart data={stats.avgCostChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" className="capitalize" /><YAxis tickFormatter={(value) => `${value/1000000}M`} /><Tooltip formatter={(value) => formatCurrency(value)} /><Bar dataKey="costeMedio" name="Coste Medio">{stats.avgCostChartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Bar></BarChart></ResponsiveContainer>
                </div>
            </div>
             <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 5 Jugadores Más Traspasados</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart layout="vertical" data={stats.top5TradedPlayers} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" allowDecimals={false} />
                            <YAxis dataKey="name" type="category" width={100} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="traspasos" name="Nº de Traspasos" fill="#82ca9d" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
        </div>
    );
}
