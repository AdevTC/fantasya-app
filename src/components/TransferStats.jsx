import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import { formatCurrency } from '../utils/helpers';
import { Link } from 'react-router-dom';
import { ShoppingCart, DollarSign, Bomb, Repeat, TrendingUp, TrendingDown, CalendarDays } from 'lucide-react';

const StatCard = ({ title, value, subValue, colorClass, icon }) => (
    <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex justify-between items-start">
            <h4 className="font-semibold text-gray-800">{title}</h4>
            <div className={`text-xl ${colorClass}`}>{icon}</div>
        </div>
        <p className={`text-2xl lg:text-3xl font-bold ${colorClass} mt-2`}>{value}</p>
        {subValue && <p className="text-sm text-gray-500">{subValue}</p>}
    </div>
);

export default function TransferStats({ transfers, members }) {
    const [filterType, setFilterType] = useState('total');

    const stats = useMemo(() => {
        if (transfers.length === 0) return null;

        const memberStats = {};
        Object.keys(members).forEach(uid => {
            memberStats[uid] = {
                spent: { total: 0, clausulazo: 0, puja: 0, acuerdo: 0 },
                earned: { total: 0, clausulazo: 0, puja: 0, acuerdo: 0 },
                buys: { total: 0, clausulazo: 0, puja: 0, acuerdo: 0 },
                sells: { total: 0, clausulazo: 0, puja: 0, acuerdo: 0 }
            };
        });

        let mostExpensive = { price: 0, player: 'N/A', buyer: 'N/A' };
        const playerTradeCount = {};
        const transferTypeCount = { clausulazo: 0, puja: 0, acuerdo: 0 };
        const activityByDate = {};
        const avgCostPerType = { clausulazo: { total: 0, count: 0 }, puja: { total: 0, count: 0 }, acuerdo: { total: 0, count: 0 } };

        transfers.forEach(t => {
            const type = t.type;
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
            if (t.price > mostExpensive.price) mostExpensive = { price: t.price, player: t.playerName, buyer: t.buyerName };
            playerTradeCount[t.playerName] = (playerTradeCount[t.playerName] || 0) + 1;
            if (transferTypeCount[type] !== undefined) transferTypeCount[type]++;
            if (avgCostPerType[type] !== undefined) {
                avgCostPerType[type].total += t.price;
                avgCostPerType[type].count++;
            }
            const date = t.timestamp.toDate().toISOString().split('T')[0];
            activityByDate[date] = (activityByDate[date] || 0) + 1;
        });
        
        const financialSummary = Object.entries(memberStats).map(([uid, data]) => ({
            name: members[uid].teamName, username: members[uid].username, ...data,
            net: { total: data.earned.total - data.spent.total, clausulazo: data.earned.clausulazo - data.spent.clausulazo, puja: data.earned.puja - data.spent.puja, acuerdo: data.earned.acuerdo - data.spent.acuerdo, },
            totalMoves: data.buys.total + data.sells.total
        }));

        const marketKing = [...financialSummary].sort((a, b) => b.spent.total - a.spent.total)[0];
        const leagueShark = [...financialSummary].sort((a, b) => b.net.total - a.net.total)[0];
        const mostTradedPlayer = Object.entries(playerTradeCount).sort((a, b) => b[1] - a[1])[0];
        const mostActiveTrader = [...financialSummary].sort((a,b) => b.totalMoves - a.totalMoves)[0];
        const pieChartData = Object.entries(transferTypeCount).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
        const activityChartData = Object.entries(activityByDate).map(([date, count]) => ({ date, fichajes: count })).sort((a,b) => new Date(a.date) - new Date(b.date));
        const avgCostChartData = Object.entries(avgCostPerType).map(([name, data]) => ({
            name, costeMedio: data.count > 0 ? data.total / data.count : 0
        }));

        return { financialSummary, mostExpensive, mostTradedPlayer, mostActiveTrader, marketKing, leagueShark, pieChartData, activityChartData, avgCostChartData };
    }, [transfers, members]);

    if (!stats) return <div className="text-center p-8 bg-white rounded-xl border">No hay suficientes datos de fichajes para generar estadísticas.</div>;
    
    const COLORS = ['#8884d8', '#82ca9d', '#ffc658'];

    return (
        <div className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Fichaje Más Caro" value={formatCurrency(stats.mostExpensive.price)} subValue={`${stats.mostExpensive.player} por ${stats.mostExpensive.buyer}`} colorClass="text-energetic-orange" icon={<DollarSign/>}/>
                <StatCard title="Manager Más Activo" value={stats.mostActiveTrader?.name || 'N/A'} subValue={`${stats.mostActiveTrader?.totalMoves || 0} movs.`} colorClass="text-vibrant-purple" icon={<ShoppingCart/>}/>
                <StatCard title="Rey del Mercado (Más Gasto)" value={stats.marketKing?.name || 'N/A'} subValue={formatCurrency(stats.marketKing?.spent.total)} colorClass="text-red-500" icon={<TrendingDown/>}/>
                <StatCard title="Tiburón de la Liga (Mejor Balance)" value={stats.leagueShark?.name || 'N/A'} subValue={formatCurrency(stats.leagueShark?.net.total)} colorClass="text-emerald-500" icon={<TrendingUp/>}/>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex flex-wrap gap-4 justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Actividad de Fichajes por Jugador</h3>
                    <div className="flex border border-gray-200 rounded-lg p-1 space-x-1 bg-gray-100">
                        {/* --- FILTROS CORREGIDOS --- */}
                        {['total', 'clausulazo', 'puja', 'acuerdo'].map(type => (
                            <button key={type} onClick={() => setFilterType(type)} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors capitalize ${filterType === type ? 'bg-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}>
                                {type === 'total' ? 'Todos' : type}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50"><tr className="border-b"><th className="p-3 text-left font-semibold text-gray-600">Jugador</th><th className="p-3 text-center font-semibold text-gray-600">Compras</th><th className="p-3 text-center font-semibold text-gray-600">Ventas</th><th className="p-3 text-right font-semibold text-gray-600">Gastado</th><th className="p-3 text-right font-semibold text-gray-600">Ingresado</th><th className="p-3 text-right font-semibold text-gray-600">Balance Neto</th></tr></thead>
                        <tbody>
                            {stats.financialSummary.map(m => (
                                <tr key={m.name} className="border-b last:border-b-0 hover:bg-gray-50">
                                    <td className="p-3 font-semibold text-gray-800"><Link to={`/profile/${m.username}`} className="hover:text-deep-blue hover:underline">{m.name}</Link></td>
                                    <td className="p-3 text-center font-mono">{m.buys[filterType]}</td>
                                    <td className="p-3 text-center font-mono">{m.sells[filterType]}</td>
                                    <td className="p-3 text-right font-mono text-red-600">{formatCurrency(m.spent[filterType])}</td>
                                    <td className="p-3 text-right font-mono text-emerald-600">{formatCurrency(m.earned[filterType])}</td>
                                    <td className={`p-3 text-right font-mono font-bold ${m.net[filterType] >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(m.net[filterType])}</td>
                                </tr>
                            ))}
                        </tbody>
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
                     <ResponsiveContainer width="100%" height={300}><LineChart data={stats.activityChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line type="monotone" dataKey="fichajes" name="Nº Fichajes" stroke="#8884d8" strokeWidth={2} /></LineChart></ResponsiveContainer>
                </div>
            </div>

             <div className="grid lg:grid-cols-3 gap-6">
                 <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">Distribución por Tipo</h3>
                    <ResponsiveContainer width="100%" height={250}><PieChart><Pie data={stats.pieChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(entry) => `${entry.name} (${entry.value})`}>{stats.pieChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => `${value} fichajes`} /></PieChart></ResponsiveContainer>
                </div>
                 <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Coste Medio por Tipo de Fichaje</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={stats.avgCostChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" className="capitalize" />
                            <YAxis tickFormatter={(value) => `${value/1000000}M`} />
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                            <Bar dataKey="costeMedio" name="Coste Medio">
                                {stats.avgCostChartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}