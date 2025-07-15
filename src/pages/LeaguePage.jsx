import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { User, ArrowLeft, Settings, Trophy, CalendarDays, Repeat, BarChart2, ShieldCheck, Medal, Star, ArrowUp, Flame, Crown, ChevronDown, TrendingUp, TrendingDown, Minus } from 'lucide-react';

import AdminTab from '../components/AdminTab';
import RoundsTab from '../components/RoundsTab';
import StatsTab from '../components/StatsTab';
import TransfersTab from '../components/TransfersTab';
import MyTeamTab from '../components/MyTeamTab';
import SettingsModal from '../components/SettingsModal';
import LoadingSpinner from '../components/LoadingSpinner';

const StatCard = ({ icon, title, value, colorClass }) => ( <div className="bg-white rounded-xl p-4 shadow-sm border"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-600">{title}</p><p className={`text-2xl font-bold ${colorClass}`}>{value}</p></div><div className={`text-xl ${colorClass}`}>{icon}</div></div></div>);

const ClassificationRow = ({ player, isUser }) => {
    const { rank, teamName, username, totalPoints, diff, diffAhead, streak } = player;

    const getRowClass = (rank) => {
        if (rank === 1) return 'bg-podium-gold';
        if (rank === 2) return 'bg-podium-silver';
        if (rank === 3) return 'bg-podium-bronze';
        if (isUser) return "bg-emerald-50";
        return "hover:bg-gray-50";
    };

    return (
        <tr className={getRowClass(rank)}>
            <td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center font-bold text-gray-700">{rank === 1 && <Crown className="text-yellow-500 mr-2" size={20} />}{rank === 2 && <Medal className="text-gray-400 mr-2" size={20} />}{rank === 3 && <Medal className="text-orange-400 mr-2" size={20} />}{rank || 'N/A'}º</div></td>
            <td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center"><div className="w-8 h-8 rounded-full flex items-center justify-center mr-3 bg-gradient-to-r from-gray-400 to-gray-600"><span className="text-white text-sm font-bold">{(teamName || '?').charAt(0)}</span></div>{username ? (<Link to={`/profile/${username}`} className="font-semibold text-gray-800 hover:text-deep-blue hover:underline">{teamName || 'Nombre no disponible'}{isUser ? ' (Tú)' : ''}</Link>) : (<span className="font-semibold text-gray-800">{teamName || 'Nombre no disponible'}{isUser ? ' (Tú)' : ''}</span>)}</div></td>
            <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">{totalPoints?.toLocaleString() || 0}</td>
            <td className={`px-6 py-4 whitespace-nowrap font-semibold text-red-600`}>{diff === 0 ? '—' : diff}</td>
            <td className={`px-6 py-4 whitespace-nowrap font-semibold text-orange-600`}>{diffAhead === 0 ? '—' : diffAhead}</td>
            <td className="px-6 py-4 whitespace-nowrap">{streak > 0 && <span className="flex items-center text-emerald-600 font-semibold"><TrendingUp size={16} className="mr-1" /> +{streak}</span>}{streak < 0 && <span className="flex items-center text-red-600 font-semibold"><TrendingDown size={16} className="mr-1" /> {streak}</span>}{streak === 0 && <span className="flex items-center text-gray-500 font-semibold"><Minus size={16} className="mr-1" /></span>}</td>
        </tr>
    );
};

// --- COMPONENTE DE CLASIFICACIÓN CON LÓGICA CORREGIDA ---
const ClassificationTab = ({ league, roundsData }) => {
    const userId = auth.currentUser?.uid;
    const [isExpanded, setIsExpanded] = useState(false);

    const classification = useMemo(() => {
        if (!league || !league.members || !roundsData) return [];

        // 1. Calcular los puntos totales correctos para cada miembro
        const memberPoints = {};
        Object.keys(league.members).forEach(uid => {
            memberPoints[uid] = { ...league.members[uid], uid, totalPoints: 0 };
        });

        roundsData.forEach(round => {
            if (round.scores) {
                Object.entries(round.scores).forEach(([uid, score]) => {
                    if (memberPoints[uid]) {
                        memberPoints[uid].totalPoints += score;
                    }
                });
            }
        });

        const players = Object.values(memberPoints);
        
        // 2. Ordenar y asignar rangos
        players.sort((a, b) => b.totalPoints - a.totalPoints);
        
        const rankedPlayers = [];
        for (let i = 0; i < players.length; i++) {
            let rank;
            if (i > 0 && players[i].totalPoints === players[i - 1].totalPoints) {
                rank = rankedPlayers[i - 1].rank;
            } else {
                rank = i + 1;
            }
            rankedPlayers.push({ ...players[i], rank });
        }

        // (La lógica de racha y diferencias se mantiene, pero ahora opera sobre datos correctos)
        const leaderPoints = rankedPlayers.length > 0 ? rankedPlayers[0].totalPoints : 0;
        return rankedPlayers.map((p, index) => {
            const diff = p.totalPoints - leaderPoints;
            const diffAhead = index > 0 ? p.totalPoints - rankedPlayers[index - 1].totalPoints : 0;
            return { ...p, diff, streak: p.streak || 0, diffAhead };
        });
    }, [league, roundsData]);

    const currentUserData = classification.find(p => p.uid === userId);
    const playersToShow = isExpanded ? classification : classification.slice(0, 3);

    return (<div><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"><StatCard icon={<Medal />} title="Tu Posición" value={currentUserData?.rank ? `${currentUserData.rank}º` : 'N/A'} colorClass="text-emerald-500" /><StatCard icon={<Star />} title="Puntos" value={currentUserData?.totalPoints?.toLocaleString() || 0} colorClass="text-deep-blue" /><StatCard icon={<ArrowUp />} title="Diferencia Líder" value={currentUserData?.diff || 0} colorClass="text-energetic-orange" /><StatCard icon={<Flame />} title="Racha" value={currentUserData?.streak ? `${currentUserData.streak > 0 ? '+' : ''}${currentUserData.streak}` : 'N/A'} colorClass={currentUserData?.streak > 0 ? 'text-emerald-500' : currentUserData?.streak < 0 ? 'text-red-500' : 'text-gray-500'} /></div><div className="bg-white rounded-xl shadow-sm border overflow-hidden"><div className="px-6 py-4 border-b bg-gray-50"><h3 className="text-lg font-semibold text-gray-800">Clasificación General</h3></div><div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pos</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jugador</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Puntos</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dif. Líder</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dif. Delante</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Racha</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{playersToShow.map((player) => (<ClassificationRow key={player.uid} player={player} isUser={player.uid === userId} />))}</tbody></table></div>{classification.length > 3 && (<div className="px-6 py-3 bg-gray-50 text-center"><button onClick={() => setIsExpanded(!isExpanded)} className="text-deep-blue hover:text-deep-blue/80 font-semibold text-sm flex items-center justify-center w-full"><ChevronDown className={`inline mr-2 transition-transform ${isExpanded ? 'rotate-180' : ''}`} size={16} />{isExpanded ? 'Mostrar menos' : 'Ver clasificación completa'}</button></div>)}</div></div>);
};

export default function LeaguePage() {
    const { leagueId } = useParams(); const navigate = useNavigate(); const [league, setLeague] = useState(null); const [roundsData, setRoundsData] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [activeTab, setActiveTab] = useState('clasificacion'); const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    useEffect(() => {
        if (!leagueId) return;
        const leagueRef = doc(db, 'leagues', leagueId);
        const unsubscribeLeague = onSnapshot(leagueRef, (docSnap) => { setLoading(true); if (docSnap.exists()) { const user = auth.currentUser; if (!user || !docSnap.data().members[user.uid]) { setError('No tienes permiso para ver esta liga.'); setLeague(null); } else { const leagueData = { id: docSnap.id, ...docSnap.data() }; setLeague(leagueData); setError(''); } } else { setError('No se encontró la liga.'); setLeague(null); } setLoading(false); }, (err) => { console.error("Error al obtener la liga:", err); setError('Error al cargar los datos de la liga.'); setLoading(false); });
        const roundsRef = collection(db, 'leagues', leagueId, 'rounds');
        const q = query(roundsRef, orderBy('roundNumber'));
        const unsubscribeRounds = onSnapshot(q, (querySnapshot) => { const rounds = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); setRoundsData(rounds); }, (err) => { console.error("Error al obtener las jornadas:", err); });
        return () => { unsubscribeLeague(); unsubscribeRounds(); };
    }, [leagueId]);
    const TabButton = ({ icon, text, tabName }) => { const isActive = activeTab === tabName; return (<button onClick={() => setActiveTab(tabName)} className={`flex items-center py-4 px-2 border-b-2 font-semibold whitespace-nowrap transition-all duration-200 ${isActive ? 'border-emerald-500 text-emerald-500' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{icon}<span className="ml-2">{text}</span></button>); };
    
    if (loading && !league) return <LoadingSpinner fullScreen text="Cargando liga..." />;
    if (error) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-red-500">{error}</div>;
    if (!league) return null;

    const userRole = league.members[auth.currentUser?.uid]?.role;
    const renderTabContent = () => {
        const props = { league: { ...league, userId: auth.currentUser?.uid, userRole }, roundsData };
        if (loading) return <LoadingSpinner />; 
        switch (activeTab) {
            case 'clasificacion': return <ClassificationTab {...props} />; case 'mi-equipo': return <MyTeamTab {...props} />; case 'jornadas': return <RoundsTab {...props} />; case 'fichajes': return <TransfersTab {...props} />; case 'estadisticas': return <StatsTab {...props} />; case 'admin': return userRole === 'admin' ? <AdminTab {...props} /> : null; default: return null;
        }
    };
    return (
        <>
            <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} league={league} />
            <div className="bg-gray-50 min-h-screen">
                <header className="bg-white shadow-sm border-b sticky top-0 z-40"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="flex justify-between items-center h-16"><div className="flex items-center space-x-3"><button onClick={() => navigate('/dashboard')} className="text-gray-500 hover:text-gray-700"><ArrowLeft size={22} /></button><div><h1 className="text-lg font-bold text-gray-800">{league.name}</h1><p className="text-xs text-gray-500">Jornada {league.currentRound || 0} • {Object.keys(league.members).length} participantes</p></div></div><div className="flex items-center space-x-4">{userRole === 'admin' && <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-sm font-semibold">Admin</span>}{userRole === 'admin' && (<button onClick={() => setIsSettingsModalOpen(true)} className="text-gray-500 hover:text-gray-700"><Settings size={20} /></button>)}</div></div></div></header>
                <div className="bg-white border-b"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="flex space-x-8 -mb-px overflow-x-auto"><TabButton icon={<Trophy size={18} />} text="Clasificación" tabName="clasificacion" /><TabButton icon={<User size={18} />} text="Mi Equipo" tabName="mi-equipo" /><TabButton icon={<CalendarDays size={18} />} text="Jornadas" tabName="jornadas" /><TabButton icon={<Repeat size={18} />} text="Fichajes" tabName="fichajes" /><TabButton icon={<BarChart2 size={18} />} text="Estadísticas" tabName="estadisticas" />{userRole === 'admin' && <TabButton icon={<ShieldCheck size={18} />} text="Admin" tabName="admin" />}</div></div></div>
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">{renderTabContent()}</main>
            </div>
        </>
    );
}
