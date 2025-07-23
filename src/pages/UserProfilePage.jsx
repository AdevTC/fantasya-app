import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, runTransaction, arrayUnion, arrayRemove, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { Mail, Trophy, Star, Edit, Pin, BarChart2, Calendar, Award as PodiumIcon, UserPlus, UserCheck, MessageSquare } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import TrophyComponent from '../components/Trophy';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';

const CareerStatCard = ({ icon, value, label }) => (
    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
        <div className="text-emerald-500 mx-auto w-fit">{icon}</div>
        <p className="text-2xl font-bold text-gray-800 dark:text-gray-200 mt-1">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
);

const SeasonSummaryCard = ({ season }) => {
    return (
        <Link to={`/league/${season.leagueId}?season=${season.seasonId}`} className="block bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md hover:border-emerald-500 transition-all">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">{season.leagueName}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Temporada: <span className="font-semibold text-gray-600 dark:text-gray-300">{season.seasonName}</span></p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Tu nombre de equipo: <span className="font-semibold text-vibrant-purple">{season.userTeamName}</span></p>
                </div>
                <span className="bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full text-sm font-semibold">{Object.keys(season.members).length} Participantes</span>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4 border-t dark:border-gray-600 pt-4">
                <div className="flex items-center gap-2">
                    <Trophy size={18} className="text-yellow-500" />
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Posición</p>
                        <p className="font-bold text-gray-800 dark:text-gray-200">{season.userRank}º</p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    <Star size={18} className="text-blue-500" />
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Puntos Totales</p>
                        <p className="font-bold text-gray-800 dark:text-gray-200">{season.userTotalPoints}</p>
                    </div>
                </div>
            </div>
        </Link>
    );
};

export default function UserProfilePage() {
    const { username } = useParams();
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const [profile, setProfile] = useState(null);
    const [seasons, setSeasons] = useState([]);
    const [achievements, setAchievements] = useState([]);
    const [careerStats, setCareerStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isFollowing, setIsFollowing] = useState(false);
    const [followersCount, setFollowersCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);

    const getRankInSeason = useCallback((seasonData, userId) => {
        const members = Object.entries(seasonData.members).map(([uid, data]) => ({ uid, ...data }));
        members.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
        let rank = 0;
        for (let i = 0; i < members.length; i++) {
            if (i > 0 && members[i].totalPoints === members[i - 1].totalPoints) {
                rank = members[i-1].rank;
            } else {
                rank = i + 1;
            }
            members[i].rank = rank;
            if(members[i].uid === userId) return rank;
        }
        return rank;
    }, []);
    
    const handlePinTrophy = async (achievement) => {
        if (!currentUser || currentUser.uid !== profile.id) return;
        const userRef = doc(db, 'users', currentUser.uid);
        try {
            const newPinnedTrophy = profile.pinnedTrophy?.trophyId === achievement.trophyId && profile.pinnedTrophy?.seasonName === achievement.seasonName ? null : achievement;
            await updateDoc(userRef, {
                pinnedTrophy: newPinnedTrophy
            });
            toast.success(newPinnedTrophy ? '¡Logro fijado en tu perfil!' : 'Logro desfijado.');
        } catch (error) {
            toast.error('No se pudo actualizar el logro.');
        }
    };

    useEffect(() => {
        if (!username) return;

        const fetchProfileData = async () => {
            setLoading(true);
            setError('');
            try {
                const usersRef = collection(db, 'users');
                const qUser = query(usersRef, where("username", "==", username));
                const userSnapshot = await getDocs(qUser);

                if (userSnapshot.empty) throw new Error('No se encontró ningún usuario con ese nombre.');
                
                const userDoc = userSnapshot.docs[0];
                const userId = userDoc.id;
                const profileData = {id: userId, ...userDoc.data()};
                setProfile(profileData);

                setFollowersCount(profileData.followers?.length || 0);
                setFollowingCount(profileData.following?.length || 0);
                if (currentUser) {
                    setIsFollowing(profileData.followers?.includes(currentUser.uid) || false);
                }

                const achievementsRef = collection(db, 'users', userId, 'achievements');
                const achievementsSnapshot = await getDocs(query(achievementsRef, orderBy('seasonName', 'desc')));
                const allAchievements = achievementsSnapshot.docs.flatMap(doc => doc.data().trophies.map(t => ({...t, seasonName: doc.data().seasonName, leagueName: doc.data().leagueName })));
                setAchievements(allAchievements);

                const leaguesRef = collection(db, 'leagues');
                const leaguesSnapshot = await getDocs(leaguesRef);
                const userSeasons = [];
                let totalWins = 0, totalPodiums = 0, roundsPlayed = 0, totalPointsSum = 0;

                for (const leagueDoc of leaguesSnapshot.docs) {
                    const seasonsRef = collection(db, 'leagues', leagueDoc.id, 'seasons');
                    const qSeasons = query(seasonsRef, where(`members.${userId}`, '!=', null));
                    const seasonsSnapshot = await getDocs(qSeasons);
                    
                    for (const seasonDoc of seasonsSnapshot.docs) {
                        const leagueData = leagueDoc.data();
                        const seasonData = seasonDoc.data();
                        const memberData = seasonData.members[userId];
                        const rank = getRankInSeason(seasonData, userId);
                        userSeasons.push({ leagueId: leagueDoc.id, seasonId: seasonDoc.id, leagueName: leagueData.name, seasonName: seasonData.name, userTeamName: memberData.teamName, userRank: rank, userTotalPoints: memberData.totalPoints || 0, members: seasonData.members });

                        const roundsRef = collection(db, 'leagues', leagueDoc.id, 'seasons', seasonDoc.id, 'rounds');
                        const roundsSnapshot = await getDocs(roundsRef);
                        roundsSnapshot.forEach(roundDoc => {
                            const scores = roundDoc.data().scores || {};
                            if (scores[userId] !== undefined && typeof scores[userId] === 'number') {
                                roundsPlayed++;
                                totalPointsSum += scores[userId];

                                const rankedRound = Object.entries(scores)
                                    .filter(([, score]) => typeof score === 'number')
                                    .map(([uid, points]) => ({ uid, points }))
                                    .sort((a, b) => b.points - a.points);
                                
                                const playersWithRanks = [];
                                for (let i = 0; i < rankedRound.length; i++) {
                                    let rank;
                                    if (i > 0 && rankedRound[i].points === rankedRound[i-1].points) {
                                        rank = playersWithRanks[i-1].rank;
                                    } else {
                                        rank = i + 1;
                                    }
                                    playersWithRanks.push({ ...rankedRound[i], rank });
                                }

                                const userEntryInRound = playersWithRanks.find(p => p.uid === userId);

                                if (userEntryInRound) {
                                    const userRankInRound = userEntryInRound.rank;
                                    if (userRankInRound === 1) totalWins++;
                                    if (userRankInRound <= 3) totalPodiums++;
                                }
                            }
                        });
                    }
                }
                setSeasons(userSeasons);
                setCareerStats({
                    seasonsPlayed: userSeasons.length,
                    totalWins, totalPodiums, roundsPlayed,
                    averagePoints: roundsPlayed > 0 ? (totalPointsSum / roundsPlayed).toFixed(2) : 0
                });

            } catch (err) {
                console.error("Error al buscar el perfil:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchProfileData();
    }, [username, getRankInSeason, currentUser]);
    
    const handleFollowToggle = async () => {
        if (!currentUser || !profile || currentUser.uid === profile.id) return;
        
        const currentUserRef = doc(db, 'users', currentUser.uid);
        const targetUserRef = doc(db, 'users', profile.id);

        try {
            await runTransaction(db, async (transaction) => {
                if (isFollowing) {
                    transaction.update(currentUserRef, { following: arrayRemove(profile.id) });
                    transaction.update(targetUserRef, { followers: arrayRemove(currentUser.uid) });
                } else {
                    transaction.update(currentUserRef, { following: arrayUnion(profile.id) });
                    transaction.update(targetUserRef, { followers: arrayUnion(currentUser.uid) });
                }
            });

            setFollowersCount(prev => isFollowing ? prev - 1 : prev + 1);
            setIsFollowing(!isFollowing);
        } catch (error) {
            console.error("Error al actualizar seguimiento:", error);
            toast.error("No se pudo completar la acción.");
        }
    };

    const handleStartChat = async () => {
        if (!currentUser || !profile || currentUser.uid === profile.id) return;

        const chatId = [currentUser.uid, profile.id].sort().join('_');
        const chatRef = doc(db, 'chats', chatId);
        
        try {
            const chatSnap = await getDoc(chatRef);
            if (!chatSnap.exists()) {
                await setDoc(chatRef, {
                    participants: [currentUser.uid, profile.id],
                    createdAt: serverTimestamp(),
                    lastMessage: ''
                });
            }
            navigate(`/chat/${chatId}`);
        } catch (error) {
            console.error("Error al iniciar el chat:", error);
            toast.error("No se pudo iniciar el chat.");
        }
    };

    if (loading) return <LoadingSpinner fullScreen text="Cargando perfil..." />;
    if (error) return <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center text-red-500">{error}</div>;
    if (!profile) return null;

    return (
        <div className="min-h-screen p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="bento-card p-8 mb-8">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <img 
                            src={profile.photoURL || `https://ui-avatars.com/api/?name=${profile.username}&background=random`}
                            alt="Foto de perfil"
                            className="w-24 h-24 rounded-full object-cover border-4 border-emerald-400"
                        />
                        <div className="flex-1 text-center sm:text-left">
                            <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-200">{profile.username}</h1>
                            <div className="flex items-center justify-center sm:justify-start gap-2 mt-2 text-gray-500 dark:text-gray-400">
                                <Mail size={16} />
                                <span>{profile.email}</span>
                            </div>
                            {profile.bio && <p className="mt-4 text-gray-600 dark:text-gray-300">{profile.bio}</p>}
                             <div className="flex items-center justify-center sm:justify-start gap-6 mt-4">
                                <div className="text-center">
                                    <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{followersCount}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Seguidores</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{followingCount}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Siguiendo</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col items-center sm:items-end gap-2 w-full sm:w-auto">
                             {currentUser?.uid === profile.id ? (
                                <Link to="/edit-profile" className="btn-secondary w-full flex items-center justify-center gap-2">
                                    <Edit size={16}/> Editar Perfil
                                </Link>
                            ) : (
                                <>
                                    <button onClick={handleFollowToggle} className={`w-full flex items-center justify-center gap-2 ${isFollowing ? 'btn-secondary' : 'btn-primary'}`}>
                                        {isFollowing ? <UserCheck size={16}/> : <UserPlus size={16}/>}
                                        {isFollowing ? 'Siguiendo' : 'Seguir'}
                                    </button>
                                     <button onClick={handleStartChat} className="btn-secondary w-full flex items-center justify-center gap-2">
                                        <MessageSquare size={16}/> Enviar Mensaje
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                
                {careerStats && (
                    <div className="bento-card p-8 mb-8">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-6">Estadísticas de Carrera</h2>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                           <CareerStatCard icon={<Trophy size={24}/>} value={careerStats.seasonsPlayed} label="Temporadas Jugadas"/>
                           <CareerStatCard icon={<Calendar size={24}/>} value={careerStats.roundsPlayed} label="Jornadas Jugadas"/>
                           <CareerStatCard icon={<Star size={24}/>} value={careerStats.totalWins} label="Victorias en Jornadas"/>
                           <CareerStatCard icon={<PodiumIcon size={24}/>} value={careerStats.totalPodiums} label="Podios en Jornadas"/>
                           <CareerStatCard icon={<BarChart2 size={24}/>} value={careerStats.averagePoints} label="Media de Puntos"/>
                        </div>
                    </div>
                )}


                {profile.pinnedTrophy && (
                    <div className="bento-card border-2 border-yellow-400 dark:border-yellow-500 p-8 mb-8">
                        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4 text-center">Logro Destacado</h2>
                        <div className="flex flex-col items-center gap-2">
                            <TrophyComponent achievement={profile.pinnedTrophy} />
                            <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-2">{profile.pinnedTrophy.description}</p>
                            <p className="text-center text-xs italic text-gray-500">{profile.pinnedTrophy.leagueName} - {profile.pinnedTrophy.seasonName}</p>
                        </div>
                    </div>
                )}

                {achievements.length > 0 && (
                    <div className="bento-card p-8 mb-8">
                         <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-6">Palmarés</h2>
                         <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-6">
                            {achievements.map((ach, index) => (
                                <div key={index} className="relative">
                                    <TrophyComponent achievement={ach} />
                                    {currentUser?.uid === profile.id && (
                                        <button 
                                            onClick={() => handlePinTrophy(ach)} 
                                            title="Fijar logro"
                                            className={`absolute -top-2 -right-2 p-1.5 rounded-full transition-colors ${profile.pinnedTrophy?.trophyId === ach.trophyId && profile.pinnedTrophy?.seasonName === ach.seasonName ? 'bg-yellow-400 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-yellow-400 dark:hover:bg-yellow-600'}`}
                                        >
                                            <Pin size={12} />
                                        </button>
                                    )}
                                </div>
                            ))}
                         </div>
                    </div>
                )}

                 <div className="space-y-4">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Temporadas en las que participa</h2>
                    {seasons.length > 0 ? (
                        seasons.map(season => <SeasonSummaryCard key={season.seasonId} season={season} />)
                    ) : (
                        <div className="bento-card p-8 text-center">
                            <p className="text-gray-600 dark:text-gray-400">Este usuario no participa en ninguna temporada todavía.</p>
                        </div>
                    )}
                 </div>
            </div>
        </div>
    );
}