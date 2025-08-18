import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import CreateLeagueModal from '../components/CreateLeagueModal';
import JoinLeagueModal from '../components/JoinLeagueModal';
import LoadingSpinner from '../components/LoadingSpinner';
import InfoModal from '../components/InfoModal';
import RulesModal from '../components/RulesModal';
import RequestJoinModal from '../components/RequestJoinModal';
import LeagueSummaryModal from '../components/LeagueSummaryModal';
import AdBanner from '../components/AdBanner'; 
import { Plus, Users, ShieldCheck, Info, BookOpen, Copy, CheckCircle, Flag, Send, Eye, Trophy } from 'lucide-react'; // <-- AÑADIMOS TROPHY
import toast from 'react-hot-toast';

const LeagueCard = ({ league, onShowRules, onShowSummary, onShowRequest, isMember }) => {
    const navigate = useNavigate();

    const handleCopyCode = (e, code) => {
        e.stopPropagation();
        navigator.clipboard.writeText(code);
        toast.success("¡Código de invitación copiado!");
    };
    
    const isActive = league.activeSeason === league.seasonId;

    return (
        <div className="bento-card group flex flex-col">
            <div 
                className="cursor-pointer flex-grow"
                onClick={() => navigate(`/league/${league.id}?season=${league.seasonId}`)}
            >
                <div className="relative">
                    <div 
                        className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg mb-4 bg-cover bg-center" 
                        style={{ backgroundImage: `url(${league.seasonPhotoURL || 'https://source.unsplash.com/random/800x600?soccer,stadium'})`}}
                    ></div>
                     <div className={`absolute top-3 right-3 px-2 py-1 text-xs font-bold text-white rounded-full flex items-center gap-1.5 ${isActive ? 'bg-emerald-500/90' : 'bg-gray-500/80'}`}>
                        {isActive ? <CheckCircle size={14} /> : <Flag size={14} />}
                        {isActive ? 'Activa' : 'Finalizada'}
                    </div>
                </div>

                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{league.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{league.seasonName}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 flex-grow">{league.description}</p>
            </div>
            
            <div className="mt-auto pt-4 space-y-3">
                {isMember ? (
                    <div 
                        onClick={(e) => handleCopyCode(e, league.inviteCode)}
                        className="flex items-center justify-between text-sm p-2 bg-gray-100 dark:bg-gray-900/50 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                        <span className="text-gray-600 dark:text-gray-400">Código: <span className="font-bold text-gray-800 dark:text-gray-200">{league.inviteCode}</span></span>
                        <Copy size={16} className="text-gray-500"/>
                    </div>
                ) : (
                    <button onClick={() => onShowRequest(league)} className="w-full btn-secondary flex items-center justify-center gap-2">
                        <Send size={16}/> Solicitar Unirse
                    </button>
                )}
                <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center text-gray-600 dark:text-gray-300">
                        <Users size={16} className="mr-2" />
                        <span>{Object.keys(league.members).length} Participantes</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => onShowSummary(league)} className="font-semibold text-gray-500 dark:text-gray-400 hover:text-emerald-500 flex items-center gap-1" title="Ver Resumen">
                            <Eye size={16} />
                        </button>
                        <button onClick={() => onShowRules(league.name, league.rules)} className="font-semibold text-gray-500 dark:text-gray-400 hover:text-emerald-500 flex items-center gap-1" title="Ver Reglas">
                            <BookOpen size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Componente para el estado vacío
const EmptyState = ({ title, message, buttonText, onButtonClick, icon }) => (
    <div className="bento-card text-center p-8 sm:p-12 flex flex-col items-center justify-center">
        <div className="text-emerald-500 mb-4">{icon}</div>
        <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400 mt-2 mb-6 max-w-sm">{message}</p>
        <button onClick={onButtonClick} className="btn-primary flex items-center justify-center gap-2">
            <Plus size={20} />
            {buttonText}
        </button>
    </div>
);

export default function DashboardPage() {
    const { profile } = useAuth();
    const [myLeagues, setMyLeagues] = useState([]);
    const [otherLeagues, setOtherLeagues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [rulesModal, setRulesModal] = useState({ isOpen: false, name: '', rules: '' });
    const [requestModal, setRequestModal] = useState({ isOpen: false, league: null });
    const [summaryModal, setSummaryModal] = useState({ isOpen: false, league: null, season: null });
    const [activeView, setActiveView] = useState('myLeagues');

    const fetchLeagues = useCallback(() => {
        const user = auth.currentUser;
        if (!user) {
            setLoading(false);
            return;
        }
        
        setLoading(true);
        const leaguesQuery = query(collection(db, 'leagues'));
        
        const unsubscribe = onSnapshot(leaguesQuery, async (leaguesSnapshot) => {
            const allLeaguesAndSeasons = [];
            for (const leagueDoc of leaguesSnapshot.docs) {
                const seasonsRef = collection(db, 'leagues', leagueDoc.id, 'seasons');
                const seasonsSnapshot = await getDocs(seasonsRef);
                
                seasonsSnapshot.forEach(seasonDoc => {
                    const leagueData = leagueDoc.data();
                    const seasonData = seasonDoc.data();
                    allLeaguesAndSeasons.push({
                        id: leagueDoc.id,
                        name: leagueData.name,
                        ownerId: leagueData.ownerId,
                        activeSeason: leagueData.activeSeason,
                        rules: leagueData.rules || '',
                        seasonId: seasonDoc.id,
                        seasonName: seasonData.name,
                        seasonPhotoURL: seasonData.seasonPhotoURL,
                        description: seasonData.description || '',
                        prizes: seasonData.prizes || '',
                        members: seasonData.members || {},
                        inviteCode: seasonData.inviteCode,
                    });
                });
            }

            const myLeaguesData = allLeaguesAndSeasons.filter(l => l.members[user.uid]);
            const otherLeaguesData = allLeaguesAndSeasons.filter(l => !l.members[user.uid]);
            const shuffledOtherLeagues = otherLeaguesData.sort(() => 0.5 - Math.random()).slice(0, 6);

            setMyLeagues(myLeaguesData);
            setOtherLeagues(shuffledOtherLeagues);
            setLoading(false);
        }, (error) => {
            console.error("Error al obtener las ligas y temporadas:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const unsubscribe = fetchLeagues();
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [fetchLeagues]);

    const handleShowRules = (name, rules) => setRulesModal({ isOpen: true, name, rules });
    const handleShowRequest = (league) => setRequestModal({ isOpen: true, league });
    const handleShowSummary = (league) => {
        const season = { 
            seasonName: league.seasonName, 
            seasonPhotoURL: league.seasonPhotoURL, 
            description: league.description, 
            prizes: league.prizes 
        };
        setSummaryModal({ isOpen: true, league, season });
    };

    if (loading) {
        return <LoadingSpinner fullScreen text="Cargando tu panel..." />;
    }
    
    return (
        <>
            <CreateLeagueModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onLeagueCreated={() => {}} />
            <JoinLeagueModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} onLeagueJoined={() => {}} />
            <InfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} />
            <RulesModal isOpen={rulesModal.isOpen} onClose={() => setRulesModal({ isOpen: false, name: '', rules: '' })} leagueName={rulesModal.name} rules={rulesModal.rules} />
            <RequestJoinModal isOpen={requestModal.isOpen} onClose={() => setRequestModal({ isOpen: false, league: null })} league={requestModal.league} />
            <LeagueSummaryModal isOpen={summaryModal.isOpen} onClose={() => setSummaryModal({ isOpen: false, league: null, season: null })} league={summaryModal.league} season={summaryModal.season} />
            
            <div className="p-4 sm:p-6 md:p-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-200">Dashboard</h2>
                        <button onClick={() => setIsInfoModalOpen(true)} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" title="Información de la App">
                            <Info size={20} />
                        </button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                        <button onClick={() => setIsJoinModalOpen(true)} className="btn-secondary w-full sm:w-auto">Unirse con código</button>
                        <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2">
                            <Plus size={20} />Crear Liga
                        </button>
                    </div>
                </div>

                <div className="flex border-b dark:border-gray-700 mb-6">
                    <button 
                        onClick={() => setActiveView('myLeagues')}
                        className={`px-4 py-3 font-semibold transition-colors ${activeView === 'myLeagues' ? 'border-b-2 border-emerald-500 text-emerald-500' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
                    >
                        Mis Ligas ({myLeagues.length})
                    </button>
                    <button 
                        onClick={() => setActiveView('otherLeagues')}
                        className={`px-4 py-3 font-semibold transition-colors ${activeView === 'otherLeagues' ? 'border-b-2 border-emerald-500 text-emerald-500' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
                    >
                        Otras Ligas
                    </button>
                </div>
                
                {loading ? (
                    <LoadingSpinner text="Cargando ligas..." />
                ) : (
                    <div>
                        {activeView === 'myLeagues' && (
                            myLeagues.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {myLeagues.map(league => (
                                        <LeagueCard key={`${league.id}-${league.seasonId}`} league={league} onShowRules={handleShowRules} onShowSummary={handleShowSummary} isMember={true} />
                                    ))}
                                </div>
                            ) : (
                                // --- ESTE ES EL NUEVO ESTADO VACÍO ---
                                <EmptyState
                                    title="¡Bienvenido a Fantasya!"
                                    message="Parece que todavía no estás en ninguna liga. ¡Crea la tuya e invita a tus amigos o únete a una existente con un código!"
                                    buttonText="Crear mi primera Liga"
                                    onButtonClick={() => setIsCreateModalOpen(true)}
                                    icon={<Trophy size={48} />}
                                />
                            )
                        )}

                        {activeView === 'otherLeagues' && (
                             otherLeagues.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {otherLeagues.map(league => (
                                        <LeagueCard key={`${league.id}-${league.seasonId}`} league={league} onShowRules={handleShowRules} onShowRequest={handleShowRequest} onShowSummary={handleShowSummary} isMember={false} />
                                    ))}
                                </div>
                            ) : (
                                <div className="bento-card text-center p-12">
                                    <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">No hay otras ligas disponibles</h3>
                                    <p className="text-gray-500 dark:text-gray-400 mt-2">¡Parece que eres de los primeros! Anímate y crea la tuya.</p>
                                </div>
                            )
                        )}
                    </div>
                )}
                
                <AdBanner slot={import.meta.env.VITE_ADSENSE_DASHBOARD_FOOTER_SLOT} />
            </div>
        </>
    );
}