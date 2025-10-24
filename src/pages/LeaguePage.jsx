import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { doc, onSnapshot, collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { User, ArrowLeft, Settings, Trophy, CalendarDays, Repeat, BarChart2, ShieldCheck, Medal, Star, ArrowUp, Flame, Crown, ChevronDown, TrendingUp, TrendingDown, Minus, ChevronsUpDown, Swords, BookOpen, Menu, Sun, Moon, Eye } from 'lucide-react';

import { useLeagueData } from '../hooks/useLeagueData';
import AdminTab from '../components/AdminTab';
import RoundsTab from '../components/RoundsTab';
import StatsTab from '../components/StatsTab';
import TransfersTab from '../components/TransfersTab';
import MyTeamTab from '../components/MyTeamTab';
import SettingsModal from '../components/SettingsModal';
import LoadingSpinner from '../components/LoadingSpinner';
import ThemeToggleButton from '../components/ThemeToggleButton';
import HallOfFameTab from '../components/HallOfFameTab';
import RulesModal from '../components/RulesModal';
import LeagueSummaryModal from '../components/LeagueSummaryModal';
import ChallengesTab from '../components/ChallengesTab';
import { useTheme } from '../context/ThemeContext';

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

const ClassificationRow = ({ player, isUser, profile, className = '' }) => {
    const { rank, teamName, username, totalPoints, diff, diffAhead, streak } = player;

    const getRowClass = (rank) => {
        if (rank === 1) return 'bg-podium-gold dark:bg-yellow-900/20';
        if (rank === 2) return 'bg-podium-silver dark:bg-gray-700/20';
        if (rank === 3) return 'bg-podium-bronze dark:bg-orange-900/20';
        if (isUser) return "bg-emerald-50 dark:bg-emerald-900/20";
        return "hover:bg-gray-50 dark:hover:bg-gray-800/60";
    };

    return (
        <tr className={`${getRowClass(rank)} ${className}`}>
            <td className="px-4 sm:px-6 py-4 whitespace-nowrap"><div className="flex items-center font-bold text-gray-700 dark:text-gray-300">{rank === 1 && <Crown className="text-yellow-500 mr-2" size={20} />}{rank === 2 && <Medal className="text-gray-400 mr-2" size={20} />}{rank === 3 && <Medal className="text-orange-400 mr-2" size={20} />}{rank || 'N/A'}º</div></td>
            <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                    <img
                        src={profile?.photoURL || `https://ui-avatars.com/api/?name=${teamName || '?'}&background=random`}
                        alt={`Foto de ${teamName}`}
                        className="w-8 h-8 rounded-full object-cover mr-3"
                    />
                    {username ? (
                        <Link to={`/profile/${username}`} className="font-semibold text-gray-800 dark:text-gray-200 hover:text-deep-blue dark:hover:text-blue-400 hover:underline">{teamName || 'Nombre no disponible'}{isUser ? ' (Tú)' : ''}</Link>
                    ) : (
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{teamName || 'Nombre no disponible'}{isUser ? ' (Tú)' : ''}</span>
                    )}
                </div>
            </td>
            <td className="px-4 sm:px-6 py-4 whitespace-nowrap font-bold text-gray-900 dark:text-white">{totalPoints?.toLocaleString() || 0}</td>
            <td className={`px-4 sm:px-6 py-4 whitespace-nowrap font-semibold text-red-600 dark:text-red-500`}>{diff === 0 ? '—' : diff}</td>
            <td className={`px-4 sm:px-6 py-4 whitespace-nowrap font-semibold text-orange-600 dark:text-orange-500`}>{diffAhead === 0 ? '—' : diffAhead}</td>
            <td className="px-4 sm:px-6 py-4 whitespace-nowrap">{streak > 0 && <span className="flex items-center text-emerald-600 dark:text-emerald-400 font-semibold"><TrendingUp size={16} className="mr-1" /> +{streak}</span>}{streak < 0 && <span className="flex items-center text-red-600 dark:text-red-500 font-semibold"><TrendingDown size={16} className="mr-1" /> {streak}</span>}{streak === 0 && <span className="flex items-center text-gray-500 dark:text-gray-400 font-semibold"><Minus size={16} className="mr-1" /></span>}</td>
        </tr>
    );
};

const ClassificationTab = ({ season, roundsData }) => {
    const userId = auth.currentUser?.uid;
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedRound, setSelectedRound] = useState(roundsData.length > 0 ? roundsData[roundsData.length - 1].roundNumber : 1);
    const [memberProfiles, setMemberProfiles] = useState({});

    useEffect(() => {
        if (roundsData.length > 0) {
            setSelectedRound(roundsData[roundsData.length - 1].roundNumber);
        }
    }, [roundsData]);

    useEffect(() => {
        const fetchMemberProfiles = async () => {
            if (!season || !season.members) return;
            const memberIds = Object.keys(season.members).filter(uid => !season.members[uid].isPlaceholder);
            if (memberIds.length === 0) return;
            
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("__name__", "in", memberIds));
            
            const querySnapshot = await getDocs(q);
            const profiles = {};
            querySnapshot.forEach((doc) => {
                profiles[doc.id] = doc.data();
            });
            setMemberProfiles(profiles);
        };
        fetchMemberProfiles();
    }, [season]);

    const getRankedPlayersForRound = (roundNumber) => {
        const filteredRounds = roundsData.filter(r => r.roundNumber <= roundNumber);
        const memberPoints = {};
        Object.keys(season.members).forEach(uid => {
            memberPoints[uid] = { ...season.members[uid], uid, totalPoints: 0 };
        });
        filteredRounds.forEach(round => {
            if (round.scores) {
                Object.entries(round.scores).forEach(([uid, score]) => {
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
    const playersToShow = isExpanded ? classification : classification.slice(0, 5);

    return (
        <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard icon={<Medal />} title="Tu Posición" value={currentUserData?.rank ? `${currentUserData.rank}º` : 'N/A'} colorClass="text-emerald-500" />
                <StatCard icon={<Star />} title="Puntos" value={currentUserData?.totalPoints?.toLocaleString() || 0} colorClass="text-deep-blue" />
                <StatCard icon={<ArrowUp />} title="Diferencia Líder" value={currentUserData?.diff || 0} colorClass="text-energetic-orange" />
                <StatCard icon={<Flame />} title="Racha" value={currentUserData?.streak ? `${currentUserData.streak > 0 ? '+' : ''}${currentUserData.streak}` : 'N/A'} colorClass={currentUserData?.streak > 0 ? 'text-emerald-500' : currentUserData?.streak < 0 ? 'text-red-500' : 'text-gray-500'} />
            </div>
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/20 flex flex-col sm:flex-row justify-between items-center gap-4">
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
                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pos</th>
                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Jugador</th>
                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Puntos</th>
                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dif. Líder</th>
                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dif. Delante</th>
                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Racha</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800/40 divide-y divide-gray-200 dark:divide-gray-700">
                            {classification.map((player) => (<ClassificationRow key={`${player.uid}-mobile`} player={player} isUser={player.uid === userId} profile={memberProfiles[player.uid]} className="md:hidden" />))}
                            {playersToShow.map((player) => (<ClassificationRow key={`${player.uid}-desktop`} player={player} isUser={player.uid === userId} profile={memberProfiles[player.uid]} className="hidden md:table-row" />))}
                        </tbody>
                    </table>
                </div>
                {classification.length > 5 && (
                    <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/20 text-center hidden md:block">
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
    const { theme, toggleTheme } = useTheme();

    const { league, seasons, loading, error } = useLeagueData(leagueId);
    
    const [selectedSeason, setSelectedSeason] = useState(null);
    const [roundsData, setRoundsData] = useState([]);
    const [activeTab, setActiveTab] = useState('clasificacion');
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
    const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuRef]);
    
    useEffect(() => {
        if (!league || seasons.length === 0) return;
    
        const seasonIdFromUrl = searchParams.get('season');
        const seasonToSelect = seasons.find(s => s.id === seasonIdFromUrl) || seasons.find(s => s.id === league.activeSeason) || seasons[0];
    
        if (seasonToSelect) {
            setSelectedSeason(seasonToSelect);
        }
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
        if (!isMemberOfSelectedSeason && !['clasificacion', 'estadisticas', 'jornadas', 'salon-de-la-fama', 'retos'].includes(activeTab)) {
            return <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700"><p className="text-gray-600 dark:text-gray-400">No eres miembro de esta temporada. Solo puedes ver la información pública.</p></div>;
        }

        const props = { league, season: selectedSeason, roundsData, userRole, seasons };
        switch (activeTab) {
            case 'clasificacion': return <ClassificationTab {...props} />;
            case 'mi-equipo':     return <MyTeamTab {...props} />;
            case 'jornadas':      return <RoundsTab {...props} />;
            case 'fichajes':      return <TransfersTab {...props} />;
            case 'estadisticas':  return <StatsTab {...props} seasons={seasons} />; // <-- Pasa 'seasons' explícitamente si no está en props
            case 'salon-de-la-fama': return <HallOfFameTab {...props} />;
            case 'retos':         return <ChallengesTab {...props} />;
            case 'admin':         return userRole === 'admin' ? <AdminTab {...props} /> : null;
            default: return null;
        }
    };
    
    return (
        <>
            <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} league={league} seasons={seasons} />
            <RulesModal isOpen={isRulesModalOpen} onClose={() => setIsRulesModalOpen(false)} leagueName={league.name} rules={league.rules} />
            <LeagueSummaryModal isOpen={isSummaryModalOpen} onClose={() => setIsSummaryModalOpen(false)} league={league} season={selectedSeason} />

            {/* --- CONTENEDOR PRINCIPAL DE LA PÁGINA --- */}
            <div>
                {/* --- CABECERA DE LA LIGA (STICKY) --- */}
                {/* Se pega en la parte de arriba del scroll. z-30 para que esté por encima del contenido */}
                <header className="bg-white dark:bg-gray-800/50 shadow-sm border-b dark:border-gray-700 sticky top-0 z-30">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between items-center h-16">
                            <div className="flex items-center space-x-3">
                                <button onClick={() => navigate('/dashboard')} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><ArrowLeft size={22} /></button>
                                {selectedSeason.seasonPhotoURL && (
                                    <img src={selectedSeason.seasonPhotoURL} alt="Logo de la temporada" className="w-10 h-10 rounded-lg object-cover" />
                                )}
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
                            
                            <div className="hidden md:flex items-center space-x-2">
                                {userRole === 'admin' && <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 px-3 py-1 rounded-full text-sm font-semibold">Admin</span>}
                                <button onClick={() => setIsSummaryModalOpen(true)} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" title="Ver Resumen">
                                    <Eye size={20} />
                                </button>
                                <button onClick={() => setIsRulesModalOpen(true)} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" title="Ver Reglas">
                                    <BookOpen size={20} />
                                </button>
                                <ThemeToggleButton />
                                {league.ownerId === user?.uid && (<button onClick={() => setIsSettingsModalOpen(true)} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" title="Ajustes de Liga"><Settings size={20} /></button>)}
                            </div>

                            <div ref={menuRef} className="md:hidden relative">
                                <button onClick={() => setIsMenuOpen(prev => !prev)} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <Menu size={24} />
                                </button>
                                {isMenuOpen && (
                                    <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 z-50">
                                        <div className="p-2 space-y-1">
                                            <button onClick={() => { setIsSummaryModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                                <Eye size={16} /> Ver Resumen
                                            </button>
                                            <button onClick={() => { setIsRulesModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                                <BookOpen size={16} /> Ver Reglas
                                            </button>
                                            <button onClick={() => { toggleTheme(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                                                {theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}
                                            </button>
                                            {league.ownerId === user?.uid && (
                                                 <button onClick={() => { setIsSettingsModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                                    <Settings size={16} /> Ajustes de la Liga
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </header>
                
                {/* --- BARRA DE PESTAÑAS (STICKY) --- */}
                {/* Se pega debajo de la cabecera (top-16) porque la cabecera mide h-16 (4rem) */}
                <div className="bg-white dark:bg-gray-800/50 border-b dark:border-gray-700 sticky top-16 z-20">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex space-x-4 sm:space-x-8 -mb-px overflow-x-auto">
                            <TabButton icon={<Trophy size={18} />} text="Clasificación" tabName="clasificacion" />
                            <TabButton icon={<CalendarDays size={18} />} text="Jornadas" tabName="jornadas" />
                            <TabButton icon={<BarChart2 size={18} />} text="Estadísticas" tabName="estadisticas" />
                            <TabButton icon={<Flame size={18} />} text="Retos" tabName="retos" />
                            <TabButton icon={<Swords size={18} />} text="Salón de la Fama" tabName="salon-de-la-fama" />
                            {isMemberOfSelectedSeason && (
                                <>
                                    <TabButton icon={<User size={18} />} text="Mi Equipo" tabName="mi-equipo" />
                                    <TabButton icon={<Repeat size={18} />} text="Fichajes" tabName="fichajes" />
                                    {userRole === 'admin' && <TabButton icon={<ShieldCheck size={18} />} text="Admin" tabName="admin" />}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* --- CONTENIDO DE LA PESTAÑA --- */}
                {/* Este es el contenido que hará scroll por detrás de las barras fijas */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    {renderTabContent()}
                </main>
            </div>
        </>
    );
}
