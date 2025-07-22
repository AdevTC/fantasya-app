import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import CreateLeagueModal from '../components/CreateLeagueModal';
import JoinLeagueModal from '../components/JoinLeagueModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { Shield, User, UserCog, Search, Rss, Bookmark, LogOut } from 'lucide-react';
import ThemeToggleButton from '../components/ThemeToggleButton';
import { useAuth } from '../hooks/useAuth';

const LeagueCard = ({ league }) => {
    const navigate = useNavigate();
    return (
        <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md dark:hover:border-emerald-500 transition-shadow">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">{league.name}</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${league.userRole === 'admin' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>{league.userRole === 'admin' ? 'Admin' : 'Miembro'}</span>
            </div>
            <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-400">Temporada:</span><span className="font-semibold dark:text-gray-100">{league.seasonName}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-400">Participantes:</span><span className="font-semibold dark:text-gray-100">{Object.keys(league.members).length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-400">Código de temporada:</span><span className="font-semibold text-deep-blue dark:text-blue-400">{league.inviteCode}</span></div>
            </div>
            <button onClick={() => navigate(`/league/${league.id}?season=${league.seasonId}`)} className="w-full bg-deep-blue hover:bg-deep-blue/90 text-white py-2 rounded-lg font-semibold transition-colors">
                Ver Temporada
            </button>
        </div>
    );
};

export default function DashboardPage() {
    const navigate = useNavigate();
    const { profile } = useAuth();
    const [leagues, setLeagues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

    const fetchLeagues = useCallback(() => {
        const user = auth.currentUser;
        if (!user) {
            setLoading(false);
            return;
        }
        
        setLoading(true);
        const leaguesQuery = query(collection(db, 'leagues'));
        
        const unsubscribe = onSnapshot(leaguesQuery, async (leaguesSnapshot) => {
            const userLeaguesAndSeasons = [];
            for (const leagueDoc of leaguesSnapshot.docs) {
                const seasonsRef = collection(db, 'leagues', leagueDoc.id, 'seasons');
                const seasonsQuery = query(seasonsRef, where(`members.${user.uid}`, '!=', null));
                
                const seasonsSnapshot = await getDocs(seasonsQuery);
                
                seasonsSnapshot.forEach(seasonDoc => {
                    const leagueData = leagueDoc.data();
                    const seasonData = seasonDoc.data();
                    userLeaguesAndSeasons.push({
                        id: leagueDoc.id,
                        name: leagueData.name,
                        seasonId: seasonDoc.id,
                        seasonName: seasonData.name,
                        members: seasonData.members,
                        inviteCode: seasonData.inviteCode,
                        userRole: seasonData.members[user.uid].role
                    });
                });
            }
            setLeagues(userLeaguesAndSeasons);
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

    const handleLogout = async () => { await signOut(auth); navigate('/login'); };

    return (
        <>
            <CreateLeagueModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onLeagueCreated={() => {}} />
            <JoinLeagueModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} onLeagueJoined={() => {}} />
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="bg-white dark:bg-gray-800/50 shadow-sm border-b dark:border-gray-700">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between items-center h-16">
                            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">Fantasya</h1>
                            <div className="flex items-center gap-1 sm:gap-2">
                                <ThemeToggleButton />
                                <div className="hidden md:flex items-center gap-1 sm:gap-2">
                                    <Link to="/feed" title="Feed" className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                        <Rss size={20} />
                                    </Link>
                                    <Link to="/search" title="Buscar" className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                        <Search size={20} />
                                    </Link>
                                    <Link to="/saved-posts" title="Guardados" className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                        <Bookmark size={20} />
                                    </Link>
                                    {profile?.username && (
                                        <Link to={`/profile/${profile.username}`} title="Mi Perfil" className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                            <User size={20} />
                                        </Link>
                                    )}
                                </div>
                                <button onClick={handleLogout} title="Cerrar Sesión" className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    <LogOut size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                        <div>
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-200">Mis Temporadas</h2>
                            <p className="text-gray-600 dark:text-gray-400">Gestiona todas tus temporadas activas desde aquí.</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <button onClick={() => setIsJoinModalOpen(true)} className="btn-secondary w-full">Unirse a Temporada</button>
                            <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary w-full"><span className="mr-2 font-light">+</span>Crear Nueva Liga</button>
                        </div>
                    </div>
                    
                    {loading ? (
                        <LoadingSpinner text="Cargando tus ligas y temporadas..." />
                    ) : leagues.length > 0 ? (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{leagues.map(league => (<LeagueCard key={`${league.id}-${league.seasonId}`} league={league} />))}</div>
                    ) : (
                        <div className="text-center bg-white dark:bg-gray-800/50 p-12 rounded-xl border border-dashed dark:border-gray-700">
                            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">No estás en ninguna temporada todavía</h3>
                            <p className="text-gray-500 dark:text-gray-400 mt-2">Crea una nueva liga o únete a una temporada existente con un código de invitación.</p>
                        </div>
                    )}
                    
                    {profile && profile.appRole === 'superadmin' && (
                        <div className="mt-12">
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Panel de Super Administración</h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-4">Herramientas para gestionar el juego y los usuarios.</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <Link to="/players-database" className="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm border dark:border-gray-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-md transition-all flex items-center gap-4">
                                    <Shield className="text-emerald-500" size={32} />
                                    <div>
                                        <h3 className="font-bold text-lg text-gray-700 dark:text-gray-300">Base de Datos de Jugadores</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Añade o edita los jugadores.</p>
                                    </div>
                                </Link>
                                <Link to="/super-admin" className="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm border dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all flex items-center gap-4">
                                    <UserCog className="text-blue-500" size={32} />
                                    <div>
                                        <h3 className="font-bold text-lg text-gray-700 dark:text-gray-300">Gestionar Roles de Usuario</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Asigna roles de superadmin.</p>
                                    </div>
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}