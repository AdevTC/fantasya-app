import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../config/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { CAREER_ACHIEVEMENTS } from '../config/achievements';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';

const AchievementCard = ({ achievement, progress }) => {
    const { name, description, icon, tiers } = achievement;
    const currentProgress = progress?.current || 0;
    const target = tiers[tiers.length - 1];
    const percentage = Math.min((currentProgress / target) * 100, 100);
    const isUnlocked = percentage === 100;

    return (
        <div className={`p-4 rounded-lg border ${isUnlocked ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700' : 'bg-white dark:bg-gray-800/50 dark:border-gray-700'}`}>
            <div className="flex items-start gap-4">
                <div className={`text-3xl ${isUnlocked ? 'text-emerald-500' : 'text-gray-400'}`}>{icon}</div>
                <div className="flex-1">
                    <h4 className="font-bold text-gray-800 dark:text-gray-200">{name}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
                    <div className="mt-3">
                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <span>Progreso</span>
                            <span>{currentProgress.toLocaleString()} / {target.toLocaleString()}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                            <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function AchievementsPage() {
    const { user, profile } = useAuth();
    const [achievementsProgress, setAchievementsProgress] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProgress = async () => {
            if (!user) return;
            setLoading(true);
            const progressRef = doc(db, 'career_achievements', user.uid);
            const docSnap = await getDoc(progressRef);
            if (docSnap.exists()) {
                setAchievementsProgress(docSnap.data());
            } else {
                setAchievementsProgress({}); // No progress yet
            }
            setLoading(false);
        };
        fetchProgress();
    }, [user]);

    const handleRecalculateStats = async () => {
        if (!window.confirm("Esta acción puede tardar un poco y consumirá lecturas de la base de datos. ¿Quieres continuar?")) return;

        const loadingToast = toast.loading('Recalculando estadísticas de carrera...');
        try {
            // Lógica de cálculo
            let seasonsPlayed = 0;
            let championshipsWon = 0;
            let totalPoints = 0;
            let totalTransfers = 0;
            
            const leaguesRef = collection(db, 'leagues');
            const leaguesSnapshot = await getDocs(leaguesRef);

            for (const leagueDoc of leaguesSnapshot.docs) {
                const seasonsRef = collection(db, 'leagues', leagueDoc.id, 'seasons');
                const qSeasons = query(seasonsRef, where(`members.${user.uid}`, '!=', null));
                const seasonsSnapshot = await getDocs(qSeasons);
                
                seasonsPlayed += seasonsSnapshot.size;

                for (const seasonDoc of seasonsSnapshot.docs) {
                    const achievementsRef = collection(db, 'users', user.uid, 'achievements');
                    const qAchievements = query(achievementsRef, where('__name__', '==', seasonDoc.id));
                    const achievementsSnapshot = await getDocs(qAchievements);
                    achievementsSnapshot.forEach(achDoc => {
                        if(achDoc.data().trophies.some(t => t.trophyId === 'CHAMPION')) {
                            championshipsWon++;
                        }
                    });

                    const roundsRef = collection(db, 'leagues', leagueDoc.id, 'seasons', seasonDoc.id, 'rounds');
                    const roundsSnapshot = await getDocs(roundsRef);
                    roundsSnapshot.forEach(roundDoc => {
                        const score = roundDoc.data().scores?.[user.uid];
                        if (typeof score === 'number') {
                            totalPoints += score;
                        }
                    });
                    
                    const transfersRef = collection(db, 'leagues', leagueDoc.id, 'seasons', seasonDoc.id, 'transfers');
                    const qTransfers = query(transfersRef, where('buyerId', '==', user.uid));
                    const transfersSnapshot = await getDocs(qTransfers);
                    totalTransfers += transfersSnapshot.size;
                }
            }
            
            const postsRef = collection(db, 'posts');
            const qPosts = query(postsRef, where('authorId', '==', user.uid));
            const postsSnapshot = await getDocs(qPosts);
            const postsCreated = postsSnapshot.size;
            let likesReceived = 0;
            postsSnapshot.forEach(doc => {
                likesReceived += (doc.data().likes?.length || 0);
            });
            
            const newProgress = {
                SEASONS_PLAYED_3: { current: seasonsPlayed },
                CHAMPIONSHIPS_WON_3: { current: championshipsWon },
                TOTAL_POINTS_50000: { current: totalPoints },
                TOTAL_TRANSFERS_100: { current: totalTransfers },
                POSTS_CREATED_50: { current: postsCreated },
                LIKES_RECEIVED_500: { current: likesReceived },
            };

            const progressRef = doc(db, 'career_achievements', user.uid);
            await setDoc(progressRef, newProgress);
            setAchievementsProgress(newProgress);
            
            toast.success('¡Estadísticas de carrera actualizadas!', { id: loadingToast });

        } catch (error) {
            console.error(error);
            toast.error('No se pudieron recalcular las estadísticas.', { id: loadingToast });
        }
    };


    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">Logros de Carrera</h1>
                <button onClick={handleRecalculateStats} className="btn-secondary flex items-center gap-2">
                    <RefreshCw size={16}/> Actualizar
                </button>
            </div>

            {loading ? <LoadingSpinner text="Cargando progreso..." /> : (
                <div className="space-y-6">
                    {Object.values(CAREER_ACHIEVEMENTS).map(ach => (
                        <AchievementCard key={ach.id} achievement={ach} progress={achievementsProgress?.[ach.id]} />
                    ))}
                </div>
            )}
        </div>
    );
}