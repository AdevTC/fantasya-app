import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, runTransaction, arrayUnion, arrayRemove, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../config/firebase';
import { Mail, Trophy, Star, Edit, Pin, BarChart2, Calendar, Award as PodiumIcon, UserPlus, UserCheck, MessageSquare, Shield, HelpCircle, Flame } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import TrophyComponent from '../components/Trophy';
import FeatBadge from '../components/FeatBadge';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import TrophyDetailModal from '../components/TrophyDetailModal';
import FeatDetailModal from '../components/FeatDetailModal';
import XPGuideModal from '../components/XPGuideModal';
import FollowListModal from '../components/FollowListModal';

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
    const [feats, setFeats] = useState([]);
    const [careerStats, setCareerStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isFollowing, setIsFollowing] = useState(false);
    const [followersCount, setFollowersCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [isTrophyModalOpen, setIsTrophyModalOpen] = useState(false);
    const [selectedTrophy, setSelectedTrophy] = useState(null);
    const [isFeatModalOpen, setIsFeatModalOpen] = useState(false);
    const [selectedFeat, setSelectedFeat] = useState(null);
    const [isXPModalOpen, setIsXPModalOpen] = useState(false);
    const [followModal, setFollowModal] = useState({ isOpen: false, title: '', userIds: [] });

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
        let currentPinned = profile.pinnedTrophies || [];
        const achievementIdentifier = `${achievement.trophyId}_${achievement.seasonName}`;
        const isAlreadyPinned = currentPinned.some(p => `${p.trophyId}_${p.seasonName}` === achievementIdentifier);
        let newPinnedTrophies;
        if (isAlreadyPinned) {
            newPinnedTrophies = currentPinned.filter(p => `${p.trophyId}_${p.seasonName}` !== achievementIdentifier);
            toast.success('Logro desfijado.');
        } else {
            if (currentPinned.length < 3) {
                newPinnedTrophies = [...currentPinned, achievement];
                toast.success('¡Logro fijado en tu perfil!');
            } else {
                toast.error('Puedes fijar un máximo de 3 logros.');
                return;
            }
        }
        try {
            await updateDoc(userRef, { pinnedTrophies: newPinnedTrophies });
        } catch (error) {
            toast.error('No se pudo actualizar el logro.');
        }
    };
    
    useEffect(() => {
        if (!username) return;

        let unsubscribeProfile = () => {};
        let unsubscribeFeats = () => {};

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
                
                unsubscribeProfile = onSnapshot(doc(db, 'users', userId), (doc) => {
                    if (doc.exists()) {
                        const profileData = {id: doc.id, ...doc.data()};
                        setProfile(profileData);
                        setFollowersCount(profileData.followers?.length || 0);
                        setFollowingCount(profileData.following?.length || 0);
                        if (currentUser) {
                            setIsFollowing(profileData.followers?.includes(currentUser.uid) || false);
                        }
                    }
                });

                const achievementsRef = collection(db, 'users', userId, 'achievements');
                const achievementsSnapshot = await getDocs(query(achievementsRef, orderBy('seasonName', 'desc')));
                
                const allEarnedTrophies = [];
                achievementsSnapshot.docs.forEach(doc => {
                    const seasonData = doc.data();
                    seasonData.trophies.forEach(trophy => {
                        allEarnedTrophies.push({ ...trophy, seasonName: seasonData.seasonName, leagueName: seasonData.leagueName, });
                    });
                });
                
                const groupedAchievements = {};
                allEarnedTrophies.forEach(trophy => {
                    if (!groupedAchievements[trophy.trophyId]) {
                        groupedAchievements[trophy.trophyId] = { ...trophy, wins: [] };
                    }
                    groupedAchievements[trophy.trophyId].wins.push(trophy);
                });
                setAchievements(Object.values(groupedAchievements));

                const featsRef = collection(db, 'users', userId, 'feats');
                unsubscribeFeats = onSnapshot(featsRef, (featsSnapshot) => {
                    const userFeats = featsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                    setFeats(userFeats);
                });

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
                                    if (i > 0 && rankedRound[i].points === rankedRound[i-1].points) { rank = playersWithRanks[i-1].rank; } else { rank = i + 1; }
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
        return () => {
            unsubscribeProfile();
            unsubscribeFeats();
        };
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
        } catch (error) {
            console.error("Error al actualizar seguimiento:", error);
            toast.error("No se pudo completar la acción.");
        }
    };

    const handleStartChat = async () => {
        if (!currentUser || !profile || currentUser.uid === profile.id) return;

        const functions = getFunctions();
        const createOrGetChat = httpsCallable(functions, 'createOrGetChat');
        
        toast.loading('Iniciando chat...');

        try {
            const result = await createOrGetChat({ otherUserUid: profile.id });
            toast.dismiss();

            const chatId = result.data.chatId;
            if (chatId) {
                navigate(`/chat/${chatId}`);
            } else {
                throw new Error('No se pudo obtener el ID del chat desde el servidor.');
            }
        } catch (error) {
            toast.dismiss();
            console.error("Error al llamar a la función createOrGetChat:", error);
            const errorMessage = error.message || "No se pudo iniciar el chat en este momento.";
            toast.error(errorMessage);
        }
    };

    const handleTrophyInfoClick = (achievement) => {
        setSelectedTrophy(achievement);
        setIsTrophyModalOpen(true);
    };

    const handleFeatInfoClick = (feat) => {
        setSelectedFeat(feat);
        setIsFeatModalOpen(true);
    };
    
    const openFollowersModal = () => {
        setFollowModal({ isOpen: true, title: 'Seguidores', userIds: profile.followers || [] });
    };

    const openFollowingModal = () => {
        setFollowModal({ isOpen: true, title: 'Siguiendo', userIds: profile.following || [] });
    };

    if (loading || !profile) return <LoadingSpinner fullScreen text="Cargando perfil..." />;
    if (error) return <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center text-red-500">{error}</div>;

    const currentLevel = Math.floor((profile.xp || 0) / 1000);
    const xpForNextLevel = (profile.xp || 0) % 1000;
    const xpPercentage = (xpForNextLevel / 1000) * 100;

    return (
        <>
            <TrophyDetailModal isOpen={isTrophyModalOpen} onClose={() => setIsTrophyModalOpen(false)} achievement={selectedTrophy} />
            <FeatDetailModal isOpen={isFeatModalOpen} onClose={() => setIsFeatModalOpen(false)} feat={selectedFeat} />
            <XPGuideModal isOpen={isXPModalOpen} onClose={() => setIsXPModalOpen(false)} />
            <FollowListModal 
                isOpen={followModal.isOpen} 
                onClose={() => setFollowModal({ isOpen: false, title: '', userIds: [] })}
                title={followModal.title}
                userIds={followModal.userIds}
            />

            <div className="min-h-screen p-4 md:p-8">
                <div className="max-w-4xl mx-auto">
                    <div className="bento-card p-8 mb-8">
                        <div className="flex flex-col sm:flex-row items-center gap-6">
                            <div className="relative">
                                <img 
                                    src={profile.photoURL || `https://ui-avatars.com/api/?name=${profile.username}&background=random`}
                                    alt="Foto de perfil"
                                    className="w-24 h-24 rounded-full object-cover border-4 border-emerald-400"
                                />
                                <div className="absolute -bottom-2 -right-2 bg-gray-800 text-white text-xs font-bold rounded-full h-8 w-8 flex items-center justify-center border-2 border-white dark:border-gray-800" title={`Nivel ${currentLevel}`}>
                                    {currentLevel}
                                </div>
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                                <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-200">{profile.username}</h1>
                                {profile.bio && <p className="mt-2 text-gray-600 dark:text-gray-300">{profile.bio}</p>}
                                <div className="flex items-center gap-6 mt-4 justify-center sm:justify-start">
                                    <button onClick={openFollowersModal} className="text-center hover:bg-gray-100 dark:hover:bg-gray-700/50 p-2 rounded-lg">
                                        <p className="font-bold text-lg">{followersCount}</p>
                                        <p className="text-sm text-gray-500">Seguidores</p>
                                    </button>
                                    <button onClick={openFollowingModal} className="text-center hover:bg-gray-100 dark:hover:bg-gray-700/50 p-2 rounded-lg">
                                        <p className="font-bold text-lg">{followingCount}</p>
                                        <p className="text-sm text-gray-500">Siguiendo</p>
                                    </button>
                                </div>
                                <div className="mt-4">
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 relative">
                                        <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${xpPercentage}%` }}></div>
                                        <button onClick={() => setIsXPModalOpen(true)} className="absolute -top-1 -right-1" title="¿Cómo gano XP?">
                                            <HelpCircle size={16} className="text-gray-400 hover:text-emerald-500" />
                                        </button>
                                    </div>
                                    <p className="text-xs text-right text-gray-500 mt-1">{xpForNextLevel} / 1000 XP para el siguiente nivel</p>
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

                    {profile.pinnedTrophies && profile.pinnedTrophies.length > 0 && (
                        <div className="bento-card border-2 border-yellow-400 dark:border-yellow-500 p-8 mb-8">
                            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4 text-center">Logros Destacados</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                {profile.pinnedTrophies.map((trophy, index) => (
                                    <div key={index} className="flex flex-col items-center gap-2">
                                        <TrophyComponent achievement={trophy} count={1} onInfoClick={() => handleTrophyInfoClick({ ...trophy, wins: [trophy] })} />
                                        <p className="text-center text-xs italic text-gray-500">{trophy.leagueName} - {trophy.seasonName}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {achievements.length > 0 && (
                        <div className="bento-card p-8 mb-8">
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-6">Palmarés</h2>
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-6">
                                {achievements.map((ach, index) => (
                                    <div key={index} className="relative">
                                        <TrophyComponent 
                                            achievement={ach} 
                                            count={ach.wins.length}
                                            onInfoClick={() => handleTrophyInfoClick(ach)} 
                                        />
                                        {currentUser?.uid === profile.id && (
                                            <button 
                                                onClick={() => handlePinTrophy(ach.wins[0])}
                                                title="Fijar logro"
                                                className={`absolute -top-2 -left-2 p-1.5 rounded-full transition-colors ${(profile.pinnedTrophies || []).some(p => `${p.trophyId}_${p.seasonName}` === `${ach.wins[0].trophyId}_${ach.wins[0].seasonName}`) ? 'bg-yellow-400 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-yellow-400 dark:hover:bg-yellow-600'}`}
                                            >
                                                <Pin size={12} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div className="bento-card p-8 mb-8">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-6">Retos de Jornada Conseguidos</h2>
                        {feats.length > 0 ? (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-6">
                                {feats.map(feat => (
                                    <FeatBadge key={feat.id} feat={feat} onInfoClick={() => handleFeatInfoClick(feat)} />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-gray-500 dark:text-gray-400">
                                <Flame size={48} className="mx-auto mb-4" />
                                <p>Este mánager todavía no ha completado ningún reto de jornada.</p>
                            </div>
                        )}
                    </div>

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
        </>
    );
}