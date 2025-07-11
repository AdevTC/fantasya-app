import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
// --- CORRECCIÓN: Se añade el icono 'Star' a la lista de importaciones ---
import { Mail, Shield, Trophy, Users, Star } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

// Componente para la tarjeta resumen de cada liga
const LeagueSummaryCard = ({ league }) => {
    return (
        <Link to={`/league/${league.id}`} className="block bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-emerald-500 transition-all">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-xl font-bold text-gray-800">{league.name}</h3>
                    <p className="text-sm text-gray-500">Tu nombre de equipo: <span className="font-semibold text-vibrant-purple">{league.userTeamName}</span></p>
                </div>
                <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-semibold">{Object.keys(league.members).length} Participantes</span>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4 border-t pt-4">
                <div className="flex items-center gap-2">
                    <Trophy size={18} className="text-yellow-500" />
                    <div>
                        <p className="text-xs text-gray-500">Posición</p>
                        <p className="font-bold text-gray-800">{league.userRank}º</p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    <Star size={18} className="text-blue-500" />
                    <div>
                        <p className="text-xs text-gray-500">Puntos Totales</p>
                        <p className="font-bold text-gray-800">{league.userTotalPoints}</p>
                    </div>
                </div>
            </div>
        </Link>
    );
};


export default function UserProfilePage() {
    const { username } = useParams();
    const [profile, setProfile] = useState(null);
    const [leagues, setLeagues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const getRankInLeague = useCallback((leagueData, userId) => {
        const members = Object.entries(leagueData.members).map(([uid, data]) => ({ uid, ...data }));
        members.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
        
        let rank = 0;
        for (let i = 0; i < members.length; i++) {
            if (i > 0 && members[i].totalPoints === members[i - 1].totalPoints) {
                // Si hay empate, el rank es el mismo que el anterior
                const previousRank = members.find(p => p.uid === members[i-1].uid)?.rank
                rank = previousRank;
            } else {
                rank = i + 1;
            }
             members[i].rank = rank; // Asignamos el rank para la siguiente iteración
            if(members[i].uid === userId) return rank;
        }
        return rank; // Fallback
    }, []);

    useEffect(() => {
        const fetchProfileAndLeagues = async () => {
            setLoading(true);
            setError('');
            try {
                const usersRef = collection(db, 'users');
                const qUser = query(usersRef, where("username", "==", username));
                const userSnapshot = await getDocs(qUser);

                if (userSnapshot.empty) {
                    throw new Error('No se encontró ningún usuario con ese nombre.');
                }
                
                const userProfile = userSnapshot.docs[0].data();
                const userId = userSnapshot.docs[0].id;
                setProfile(userProfile);

                const leaguesRef = collection(db, 'leagues');
                const qLeagues = query(leaguesRef, where(`members.${userId}`, '!=', null));
                const leaguesSnapshot = await getDocs(qLeagues);

                const userLeagues = leaguesSnapshot.docs.map(doc => {
                    const leagueData = doc.data();
                    const memberData = leagueData.members[userId];
                    const rank = getRankInLeague(leagueData, userId);

                    return {
                        id: doc.id,
                        name: leagueData.name,
                        userTeamName: memberData.teamName,
                        userRank: rank,
                        userTotalPoints: memberData.totalPoints || 0,
                        members: leagueData.members
                    };
                });

                setLeagues(userLeagues);

            } catch (err) {
                console.error("Error al buscar el perfil:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (username) {
            fetchProfileAndLeagues();
        }
    }, [username, getRankInLeague]);

    if (loading) return <LoadingSpinner fullScreen text="Cargando perfil..." />;
    if (error) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-red-500">{error}</div>;
    if (!profile) return null;

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border p-8 mb-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <div className="w-24 h-24 bg-gradient-to-br from-vibrant-purple to-deep-blue rounded-full flex items-center justify-center text-white text-4xl font-bold">
                            {profile.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h1 className="text-4xl font-bold text-gray-800 text-center sm:text-left">{profile.username}</h1>
                            <div className="flex items-center gap-2 mt-2 text-gray-500 justify-center sm:justify-start">
                                <Mail size={16} />
                                <span>{profile.email}</span>
                            </div>
                        </div>
                    </div>
                </div>

                 <div className="space-y-4">
                    <h2 className="text-2xl font-bold text-gray-800">Ligas en las que participa</h2>
                    {leagues.length > 0 ? (
                        leagues.map(league => <LeagueSummaryCard key={league.id} league={league} />)
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                            <p className="text-gray-600">Este usuario no participa en ninguna liga todavía.</p>
                        </div>
                    )}
                 </div>
                 <div className="text-center mt-8">
                    <Link to="/dashboard" className="text-deep-blue hover:underline font-semibold">Volver al Dashboard</Link>
                </div>
            </div>
        </div>
    );
}