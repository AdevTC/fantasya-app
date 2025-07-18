import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { User, ArrowLeft, Settings, Trophy, CalendarDays, Repeat, BarChart2, ShieldCheck, Medal, Star, ArrowUp, Flame, Crown, ChevronDown, TrendingUp, TrendingDown, Minus, ChevronsUpDown } from 'lucide-react';

import AdminTab from '../components/AdminTab';
import RoundsTab from '../components/RoundsTab';
import StatsTab from '../components/StatsTab';
import TransfersTab from '../components/TransfersTab';
import MyTeamTab from '../components/MyTeamTab';
import SettingsModal from '../components/SettingsModal';
import LoadingSpinner from '../components/LoadingSpinner';
import ThemeToggleButton from '../components/ThemeToggleButton';

const StatCard = ({ icon, title, value, colorClass }) => (
    <div className="bg-white dark:bg-gray-800/50 rounded-xl p-4 shadow-sm border dark:border-gray-700">
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
                <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
            </div>
            <div className={`text-xl ${colorClass}`}>{icon}</div>
        </div>
    </div>
);

const ClassificationRow = ({ player, isUser }) => {
    const { rank, teamName, username, totalPoints, diff, diffAhead, streak } = player;

    const getRowClass = (rank) => {
        if (rank === 1) return 'bg-podium-gold dark:bg-yellow-900/20';
        if (rank === 2) return 'bg-podium-silver dark:bg-gray-700/20';
        if (rank === 3) return 'bg-podium-bronze dark:bg-orange-900/20';
        if (isUser) return "bg-emerald-50 dark:bg-emerald-900/20";
        return "hover:bg-gray-50 dark:hover:bg-gray-800/60";
    };

    return (
        <tr className={getRowClass(rank)}>
            <td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center font-bold text-gray-700 dark:text-gray-300">{rank === 1 && <Crown className="text-yellow-500 mr-2" size={20} />}{rank === 2 && <Medal className="text-gray-400 mr-2" size={20} />}{rank === 3 && <Medal className="text-orange-400 mr-2" size={20} />}{rank || 'N/A'}º</div></td>
            <td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center"><div className="w-8 h-8 rounded-full flex items-center justify-center mr-3 bg-gradient-to-r from-gray-400 to-gray-600"><span className="text-white text-sm font-bold">{(teamName || '?').charAt(0)}</span></div>{username ? (<Link to={`/profile/${username}`} className="font-semibold text-gray-800 dark:text-gray-200 hover:text-deep-blue dark:hover:text-blue-400 hover:underline">{teamName || 'Nombre no disponible'}{isUser ? ' (Tú)' : ''}</Link>) : (<span className="font-semibold text-gray-800 dark:text-gray-200">{teamName || 'Nombre no disponible'}{isUser ? ' (Tú)' : ''}</span>)}</div></td>
            <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900 dark:text-white">{totalPoints?.toLocaleString() || 0}</td>
            <td className={`px-6 py-4 whitespace-nowrap font-semibold text-red-600 dark:text-red-500`}>{diff === 0 ? '—' : diff}</td>
            <td className={`px-6 py-4 whitespace-nowrap font-semibold text-orange-600 dark:text-orange-500`}>{diffAhead === 0 ? '—' : diffAhead}</td>
            <td className="px-6 py-4 whitespace-nowrap">{streak > 0 && <span className="flex items-center text-emerald-600 dark:text-emerald-400 font-semibold"><TrendingUp size={16} className="mr-1" /> +{streak}</span>}{streak < 0 && <span className="flex items-center text-red-600 dark:text-red-500 font-semibold"><TrendingDown size={16} className="mr-1" /> {streak}</span>}{streak === 0 && <span className="flex items-center text-gray-500 dark:text-gray-400 font-semibold"><Minus size={16} className="mr-1" /></span>}</td>
        </tr>
    );
};

const ClassificationTab = ({ season, roundsData }) => {
    const userId = auth.currentUser?.uid;
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedRound, setSelectedRound] = useState(roundsData.length > 0 ? roundsData[roundsData.length - 1].roundNumber : 1);

    useEffect(() => {
        if (roundsData.length > 0) {
            setSelectedRound(roundsData[roundsData.length - 1].roundNumber);
        }
    }, [roundsData]);

    const getRankedPlayersForRound = (roundNumber) => {
        const filteredRounds = roundsData.filter(r => r.roundNumber <= roundNumber);
        const memberPoints = {};
        Object.keys(season.members).forEach(uid => {
            memberPoints[uid] = { ...season.members[uid], uid, totalPoints: 0 };
        });
        filteredRounds.forEach(round => {
            if (round.scores) {
                Object.entries(round.scores).forEach(([uid, score]) => {
                    // --- CORRECCIÓN: Asegurarse de que solo se suman números ---
                    if (memberPoints[uid] && typeof score === 'number') {
                        memberPoints[uid].totalPoints += score;
                    }
                });
            }
        });
        const players = Object.values(memberPoints);
        players.sort((a, b) => b.totalPoints - a.totalPoints);
        
        const ranked = [];
        for (let i = 0; i < players.length; i++) {
            let rank;
            if (i > 0 && players[i].totalPoints === players[i - 1].totalPoints) {
                rank = ranked[i - 1].rank;
            } else {
                rank = i + 1;
            }
            ranked.push({ ...players[i], rank });
        }
        return ranked;
    };

    const classification = useMemo(() => {
        if (!season || !season.members || !roundsData || selectedRound < 1) return [];

        const currentRanks = getRankedPlayersForRound(selectedRound);
        const prevRanks = selectedRound > 1 ? getRankedPlayersForRound(selectedRound - 1) : null;
        
        const leaderPoints = currentRanks.length > 0 ? currentRanks[0].totalPoints : 0;

        return currentRanks.map((player, index) => {
            const diff = player.totalPoints - leaderPoints;
            const diffAhead = index > 0 ? player.totalPoints - currentRanks[index - 1].totalPoints : 0;
            
            let streak = 0;
            if (prevRanks) {
                const prevPlayer = prevRanks.find(p => p.uid === player.uid);
                if (prevPlayer) {
                    streak = prevPlayer.rank - player.rank;
                }
            }
            return { ...player, diff, streak, diffAhead };
        });
    }, [season, roundsData, selectedRound]);
    
    const currentUserData = classification.find(p => p.uid === userId);
    const playersToShow = isExpanded ? classification : classification.slice(0, 3);

    return (
        <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard icon={<Medal />} title="Tu Posición" value={currentUserData?.rank ? `${currentUserData.rank}º` : 'N/A'} colorClass="text-emerald-500" />
                <StatCard icon={<Star />} title="Puntos" value={currentUserData?.totalPoints?.toLocaleString() || 0} colorClass="text-deep-blue" />
                <StatCard icon={<ArrowUp />} title="Diferencia Líder" value={currentUserData?.diff || 0} colorClass="text-energetic-orange" />
                <StatCard icon={<Flame />} title="Racha" value={currentUserData?.streak ? `${currentUserData.streak > 0 ? '+' : ''}${currentUserData.streak}` : 'N/A'} colorClass={currentUserData?.streak > 0 ? 'text-emerald-500' : currentUserData?.streak < 0 ? 'text-red-500' : 'text-gray-500'} />
            </div>
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/20 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Clasificación General</h3>
                    <div className="flex items-center gap-2">
                        <label htmlFor="round-filter" className="text-sm font-medium text-gray-600 dark:text-gray-400">Ver Jornada:</label>
                        <select
                            id="round-filter"
                            value={selectedRound}
                            onChange={(e) => setSelectedRound(Number(e.target.value))}
                            className="input !w-auto !py-1 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            disabled={roundsData.length === 0}
                        >
                            {roundsData.map(r => <option key={r.roundNumber} value={r.roundNumber}>{r.roundNumber}</option>)}
                        </select>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-800/20">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pos</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Jugador</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Puntos</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dif. Líder</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dif. Delante</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Racha</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800/40 divide-y divide-gray-200 dark:divide-gray-700">
                            {playersToShow.map((player) => (<ClassificationRow key={player.uid} player={player} isUser={player.uid === userId} />))}
                        </tbody>
                    </table>
                </div>
                {classification.length > 3 && (
                    <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/20 text-center">
                        <button onClick={() => setIsExpanded(!isExpanded)} className="text-deep-blue dark:text-blue-400 hover:text-deep-blue/80 font-semibold text-sm flex items-center justify-center w-full">
                            <ChevronDown className={`inline mr-2 transition-transform ${isExpanded ? 'rotate-180' : ''}`} size={16} />
                            {isExpanded ? 'Mostrar menos' : 'Ver clasificación completa'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default function LeaguePage() {
    const { leagueId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const [league, setLeague] = useState(null);
    const [seasons, setSeasons] = useState([]);
    const [selectedSeason, setSelectedSeason] = useState(null);
    const [roundsData, setRoundsData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('clasificacion');
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    useEffect(() => {
        if (!leagueId) return;
    
        const leagueRef = doc(db, 'leagues', leagueId);
        const unsubscribeLeague = onSnapshot(leagueRef, (leagueSnap) => {
            if (leagueSnap.exists()) {
                setLeague({ id: leagueSnap.id, ...leagueSnap.data() });
            } else {
                setError('No se encontró la liga.');
                setLoading(false);
            }
        }, (err) => {
            console.error("Error al obtener la liga:", err);
            setError('Error al cargar los datos de la liga.');
            setLoading(false);
        });
    
        const seasonsRef = collection(db, 'leagues', leagueId, 'seasons');
        const seasonsQuery = query(seasonsRef, orderBy('seasonNumber', 'asc'));
        const unsubscribeSeasons = onSnapshot(seasonsQuery, (seasonsSnap) => {
            const allSeasons = seasonsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSeasons(allSeasons);
        });
    
        return () => {
            unsubscribeLeague();
            unsubscribeSeasons();
        };
    }, [leagueId]);
    
    useEffect(() => {
        if (!league || seasons.length === 0) {
            setLoading(true);
            return;
        }
    
        const seasonIdFromUrl = searchParams.get('season');
        const seasonToSelect = seasons.find(s => s.id === seasonIdFromUrl) || seasons.find(s => s.id === league.activeSeason) || seasons[0];
    
        if (seasonToSelect) {
            setSelectedSeason(seasonToSelect);
        }
        setLoading(false);
    }, [league, seasons, searchParams]);

    useEffect(() => {
        if (!selectedSeason || !leagueId) return;

        if (searchParams.get('season') !== selectedSeason.id) {
            setSearchParams({ season: selectedSeason.id }, { replace: true });
        }
        
        const roundsRef = collection(db, 'leagues', leagueId, 'seasons', selectedSeason.id, 'rounds');
        const q = query(roundsRef, orderBy('roundNumber'));
        const unsubscribeRounds = onSnapshot(q, (querySnapshot) => {
            const rounds = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRoundsData(rounds);
        });

        return () => unsubscribeRounds();
    }, [selectedSeason, leagueId, searchParams, setSearchParams]);

    const TabButton = ({ icon, text, tabName }) => {
        const isActive = activeTab === tabName;
        return (
            <button 
                onClick={() => setActiveTab(tabName)} 
                className={`flex items-center py-4 px-2 border-b-2 font-semibold whitespace-nowrap transition-all duration-200 ${isActive ? 'border-emerald-500 text-emerald-500' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
                {icon}
                <span className="ml-2">{text}</span>
            </button>
        );
    };
    
    if (loading || !league || !selectedSeason) return <LoadingSpinner fullScreen text="Cargando liga..." />;
    if (error) return <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center text-red-500">{error}</div>;

    const user = auth.currentUser;
    const isMemberOfSelectedSeason = user && selectedSeason.members && selectedSeason.members[user.uid];
    const userRole = isMemberOfSelectedSeason ? selectedSeason.members[user.uid].role : 'guest';

    const renderTabContent = () => {
        if (!selectedSeason) return <LoadingSpinner />;
        if (!isMemberOfSelectedSeason && activeTab !== 'clasificacion') {
            return <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700"><p className="text-gray-600 dark:text-gray-400">No eres miembro de esta temporada. Solo puedes ver la clasificación.</p></div>;
        }

        const props = { league, season: selectedSeason, roundsData, userRole };
        switch (activeTab) {
            case 'clasificacion': return <ClassificationTab {...props} />;
            case 'mi-equipo':     return <MyTeamTab {...props} />;
            case 'jornadas':      return <RoundsTab {...props} />;
            case 'fichajes':      return <TransfersTab {...props} />;
            case 'estadisticas':  return <StatsTab {...props} />;
            case 'admin':         return userRole === 'admin' ? <AdminTab {...props} /> : null;
            default: return null;
        }
    };
    
    return (
        <>
            <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} league={league} seasons={seasons} />
            <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
                <header className="bg-white dark:bg-gray-800/50 shadow-sm border-b dark:border-gray-700 sticky top-0 z-40">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between items-center h-16">
                            <div className="flex items-center space-x-3">
                                <button onClick={() => navigate('/dashboard')} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><ArrowLeft size={22} /></button>
                                <div>
                                    <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200">{league.name}</h1>
                                    {seasons.length > 0 && (
                                        <div className="relative">
                                            <select value={selectedSeason.id} onChange={(e) => setSelectedSeason(seasons.find(s => s.id === e.target.value))} className="text-xs text-gray-500 dark:text-gray-400 font-semibold bg-transparent -ml-1 pr-6 appearance-none focus:outline-none cursor-pointer dark:focus:bg-gray-800">
                                                {seasons.map(s => (
                                                    <option key={s.id} value={s.id} className="bg-white dark:bg-gray-800">
                                                        {s.id === league.activeSeason ? '★ ' : ''}{s.name} • {Object.keys(s.members).length} participantes
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronsUpDown size={12} className="absolute top-1/2 right-0 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <ThemeToggleButton />
                                {userRole === 'admin' && <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 px-3 py-1 rounded-full text-sm font-semibold">Admin</span>}
                                {league.ownerId === user?.uid && (<button onClick={() => setIsSettingsModalOpen(true)} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><Settings size={20} /></button>)}
                            </div>
                        </div>
                    </div>
                </header>
                <div className="bg-white dark:bg-gray-800/50 border-b dark:border-gray-700">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex space-x-8 -mb-px overflow-x-auto">
                            <TabButton icon={<Trophy size={18} />} text="Clasificación" tabName="clasificacion" />
                            {isMemberOfSelectedSeason && (
                                <>
                                    <TabButton icon={<User size={18} />} text="Mi Equipo" tabName="mi-equipo" />
                                    <TabButton icon={<CalendarDays size={18} />} text="Jornadas" tabName="jornadas" />
                                    <TabButton icon={<Repeat size={18} />} text="Fichajes" tabName="fichajes" />
                                    <TabButton icon={<BarChart2 size={18} />} text="Estadísticas" tabName="estadisticas" />
                                    {userRole === 'admin' && <TabButton icon={<ShieldCheck size={18} />} text="Admin" tabName="admin" />}
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    {renderTabContent()}
                </main>
            </div>
        </>
    );
}