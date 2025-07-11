import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import CreateLeagueModal from '../components/CreateLeagueModal';
import JoinLeagueModal from '../components/JoinLeagueModal';
import LoadingSpinner from '../components/LoadingSpinner'; // <-- Importamos el spinner
import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';

const LeagueCard = ({ league }) => { const navigate = useNavigate(); return ( <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"><div className="flex items-center justify-between mb-4"><h3 className="text-xl font-bold text-gray-800">{league.name}</h3><span className={`px-3 py-1 rounded-full text-sm font-semibold ${league.userRole === 'admin' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'}`}>{league.userRole === 'admin' ? 'Admin' : 'Miembro'}</span></div><div className="space-y-2 mb-4"><div className="flex justify-between text-sm"><span className="text-gray-600">Participantes:</span><span className="font-semibold">{Object.keys(league.members).length}</span></div><div className="flex justify-between text-sm"><span className="text-gray-600">Código de invitación:</span><span className="font-semibold text-deep-blue">{league.inviteCode}</span></div></div><button onClick={() => navigate(`/league/${league.id}`)} className="w-full bg-deep-blue hover:bg-deep-blue/90 text-white py-2 rounded-lg font-semibold transition-colors">Ver Liga</button></div>);};

export default function DashboardPage() {
    const navigate = useNavigate();
    const [leagues, setLeagues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

    const fetchLeagues = useCallback(async () => { setLoading(true); try { const user = auth.currentUser; if (!user) return; const q = query(collection(db, 'leagues'), where(`members.${user.uid}`, '!=', null)); const querySnapshot = await getDocs(q); const userLeagues = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), userRole: doc.data().members[user.uid].role })); setLeagues(userLeagues); } catch (error) { console.error("Error al obtener las ligas:", error); } finally { setLoading(false); } }, []);
    useEffect(() => { fetchLeagues(); }, [fetchLeagues]);
    const handleLogout = async () => { await signOut(auth); navigate('/login'); };

    return (
        <>
            <CreateLeagueModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onLeagueCreated={fetchLeagues} />
            <JoinLeagueModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} onLeagueJoined={fetchLeagues} />
            <div className="min-h-screen bg-gray-50">
                <div className="bg-white shadow-sm border-b"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="flex justify-between items-center h-16"><h1 className="text-xl font-bold text-gray-800">Fantasya</h1><button onClick={handleLogout} className="text-sm text-gray-600 hover:text-gray-800">Cerrar Sesión</button></div></div></div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="flex justify-between items-center mb-8">
                        <div><h2 className="text-3xl font-bold text-gray-800">Mis Ligas</h2><p className="text-gray-600">Gestiona todas tus ligas fantasy desde aquí.</p></div>
                        <div className="flex gap-4"><button onClick={() => setIsJoinModalOpen(true)} className="bg-white hover:bg-gray-100 border border-gray-300 text-gray-800 px-6 py-3 rounded-lg font-semibold flex items-center">Unirse a Liga</button><button onClick={() => setIsCreateModalOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-lg font-semibold flex items-center"><span className="mr-2 text-xl font-light">+</span>Crear Nueva Liga</button></div>
                    </div>
                    
                    {/* --- USO DEL SPINNER --- */}
                    {loading ? (
                        <LoadingSpinner text="Cargando tus ligas..." />
                    ) : leagues.length > 0 ? (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{leagues.map(league => (<LeagueCard key={league.id} league={league} />))}</div>
                    ) : (
                        <div className="text-center bg-white p-12 rounded-xl border border-dashed"><h3 className="text-xl font-semibold text-gray-700">No estás en ninguna liga todavía</h3><p className="text-gray-500 mt-2">Crea una nueva liga o únete a una existente con un código de invitación.</p></div>
                    )}

                    <div className="mt-12">
                         <h2 className="text-2xl font-bold text-gray-800">Panel de Administración</h2>
                         <p className="text-gray-600 mb-4">Herramientas para gestionar el juego.</p>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Link to="/players-database" className="bg-white p-6 rounded-xl shadow-sm border hover:border-emerald-500 hover:shadow-md transition-all flex items-center gap-4">
                                <Shield className="text-emerald-500" size={32} />
                                <div>
                                    <h3 className="font-bold text-lg text-gray-700">Base de Datos de Jugadores</h3>
                                    <p className="text-sm text-gray-500">Añade o edita los jugadores disponibles en el juego.</p>
                                </div>
                            </Link>
                         </div>
                    </div>
                </div>
            </div>
        </>
    );
}