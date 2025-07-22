import React, { useState, useEffect } from 'react';
import { doc, updateDoc, deleteField, collection, query, onSnapshot, writeBatch, getDocs, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import LoadingSpinner from './LoadingSpinner';
import { Calendar, List, Award, ThumbsDown, UserCheck, Sofa, ShoppingCart } from 'lucide-react';
import { calculateStandardDeviation } from '../utils/helpers';
import { useAuth } from '../hooks/useAuth';

export const TROPHY_DEFINITIONS = {
    CHAMPION: { name: 'Campeón de Liga', description: 'Ganador de la temporada con más puntos.' },
    RUNNER_UP: { name: 'Medalla de Plata', description: 'Segundo clasificado de la temporada.' },
    THIRD_PLACE: { name: 'Medalla de Bronce', description: 'Tercer clasificado de la temporada.' },
    TOP_SCORER: { name: 'Pichichi', description: 'Equipo con la mayor puntuación en una sola jornada.' },
    MARKET_KING: { name: 'Rey del Mercado', description: 'El que más ha gastado en fichajes durante la temporada.' },
    LEAGUE_SHARK: { name: 'Tiburón de la Liga', description: 'El que ha obtenido mayor beneficio neto en el mercado.' },
    MOST_WINS: { name: 'El Victorioso', description: 'El que ha ganado más jornadas.' },
    MOST_PODIUMS: { name: 'Experiencia en Podios', description: 'El que ha terminado más veces en el podio (Top 3).' },
    MOST_REGULAR: { name: 'Míster Regularidad', description: 'El jugador con la desviación estándar más baja en sus puntuaciones.'},
    LANTERN_ROUGE: { name: 'Farolillo Rojo', description: 'El que ha terminado más veces en última posición.' },
    STONE_HAND: { name: 'Mano de Piedra', description: 'Equipo con la peor puntuación en una sola jornada.' },
    CAPTAIN_FANTASTIC: { name: 'Capitán Fantástico', description: 'El que más puntos extra ha conseguido gracias a sus capitanes.' },
    GOLDEN_BENCH: { name: 'Banquillo de Oro', description: 'El que más puntos ha desperdiciado en el banquillo.' },
    SPECULATOR: { name: 'El Especulador', description: 'El que ha realizado más fichajes durante la temporada.' }
};

export default function AdminTab({ league, season, roundsData }) {
    const { profile: adminProfile } = useAuth();
    const [viewMode, setViewMode] = useState('single');
    const [round, setRound] = useState(season?.currentRound || 1);
    const [totalRounds, setTotalRounds] = useState(season?.totalRounds || 38);
    const [scores, setScores] = useState({});
    const [loading, setLoading] = useState(false);
    const [members, setMembers] = useState(season?.members || {});
    const [newTeamName, setNewTeamName] = useState('');
    const [allLineups, setAllLineups] = useState(null);

    useEffect(() => {
        if (!season) return;
        const seasonRef = doc(db, 'leagues', league.id, 'seasons', season.id);
        const unsubscribe = onSnapshot(seasonRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setMembers(data.members || {});
                setTotalRounds(data.totalRounds || 38);
                setRound(data.currentRound || 1);
            }
        });
        return () => unsubscribe();
    }, [league.id, season.id]);
    
    useEffect(() => {
        if (!season) return;
        const roundsRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'rounds');
        const q = query(roundsRef);
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allScores = {};
            snapshot.forEach(doc => {
                allScores[doc.id] = doc.data().scores;
            });
            setScores(allScores);
        });
        return () => unsubscribe();
    }, [league.id, season.id]);

    const handleScoreChange = (roundNum, uid, value) => {
        const newScores = { ...scores };
        if (!newScores[roundNum]) {
            newScores[roundNum] = {};
        }
        newScores[roundNum][uid] = value;
        setScores(newScores);
    };

    const handleSaveScores = async () => {
        setLoading(true);
        const loadingToast = toast.loading('Guardando y recalculando...');
        try {
            const batch = writeBatch(db);
            const seasonRef = doc(db, 'leagues', league.id, 'seasons', season.id);
            const roundsRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'rounds');

            batch.update(seasonRef, { totalRounds });

            for (const roundNum in scores) {
                if (Number(roundNum) <= totalRounds) {
                    const roundRef = doc(roundsRef, String(roundNum));
                    const scoresForRound = {};
                    for (const uid in scores[roundNum]) {
                        const rawValue = scores[roundNum][uid];
                        if (rawValue === null || rawValue === undefined || rawValue === '') continue;

                        const upperCaseValue = String(rawValue).toUpperCase();
                        if (upperCaseValue === 'NO11' || upperCaseValue === 'NR') {
                            scoresForRound[uid] = upperCaseValue;
                        } else {
                            const numValue = Number(String(rawValue).replace(',', '.'));
                            if (!isNaN(numValue)) {
                                scoresForRound[uid] = numValue;
                            }
                        }
                    }
                    batch.set(roundRef, { scores: scoresForRound, roundNumber: Number(roundNum) }, { merge: true });
                }
            }
            
            const existingRoundsSnap = await getDocs(roundsRef);
            existingRoundsSnap.forEach(doc => {
                if (Number(doc.id) > totalRounds) {
                    batch.delete(doc.ref);
                }
            });

            const updatedMembers = JSON.parse(JSON.stringify(members));
            for (const uid in updatedMembers) {
                updatedMembers[uid].totalPoints = 0;
            }

            for (const roundNum in scores) {
                if(Number(roundNum) <= totalRounds) {
                    for (const uid in scores[roundNum]) {
                        const score = scores[roundNum][uid];
                        if (updatedMembers[uid] && typeof score === 'number') {
                            updatedMembers[uid].totalPoints += score;
                        }
                    }
                }
            }
            batch.update(seasonRef, { members: updatedMembers });

            await batch.commit();
            toast.success('Datos guardados y totales recalculados.', { id: loadingToast });
        } catch (error) {
            console.error("Error al guardar los datos:", error);
            toast.error("Error al guardar los datos.", { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };

    const handleAddGhostTeam = async () => {
        if (!newTeamName.trim()) {
            toast.error("El nombre del equipo no puede estar vacío.");
            return;
        }
        setLoading(true);
        const loadingToast = toast.loading('Añadiendo equipo fantasma...');
        try {
            const seasonRef = doc(db, 'leagues', league.id, 'seasons', season.id);
            const placeholderId = `placeholder_${uuidv4()}`;
            await updateDoc(seasonRef, {
                [`members.${placeholderId}`]: {
                    teamName: newTeamName.trim(),
                    role: 'member',
                    isPlaceholder: true,
                    totalPoints: 0,
                    finances: { budget: 200, teamValue: 0 }
                }
            });
            toast.success('Equipo añadido.', { id: loadingToast });
            setNewTeamName('');
        } catch (error) {
            console.error("Error al añadir equipo:", error);
            toast.error("No se pudo añadir el equipo.", { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };
    
    const handleSetRole = async (targetUid, newRole) => {
        const loadingToast = toast.loading('Cambiando rol...');
        try {
            const seasonRef = doc(db, 'leagues', league.id, 'seasons', season.id);
            await updateDoc(seasonRef, {
                [`members.${targetUid}.role`]: newRole
            });
            toast.success('Rol actualizado.', { id: loadingToast });
        } catch (error) {
            toast.error('No se pudo cambiar el rol.', { id: loadingToast });
        }
    };
    
    const handleKickUser = async (targetUid, teamName) => {
        if (!window.confirm(`¿Seguro que quieres expulsar a "${teamName}" de la temporada?`)) return;
        const loadingToast = toast.loading('Expulsando jugador...');
        try {
            const seasonRef = doc(db, 'leagues', league.id, 'seasons', season.id);
            await updateDoc(seasonRef, {
                [`members.${targetUid}`]: deleteField()
            });
            toast.success('Jugador expulsado.', { id: loadingToast });
        } catch (error) {
            toast.error('No se pudo expulsar al jugador.', { id: loadingToast });
        }
    };
    
    const handleAwardTrophies = async () => {
        if (!window.confirm("¿Estás seguro de que quieres finalizar y (re)otorgar los trofeos? Esta acción borrará los trofeos anteriores de esta temporada y los recalculará.")) return;
        setLoading(true);
        const loadingToast = toast.loading('Calculando ganadores y otorgando trofeos...');

        try {
            const lineupsRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'lineups');
            const lineupsSnapshot = await getDocs(query(lineupsRef));
            const lineupsData = {};
            lineupsSnapshot.forEach(doc => { lineupsData[doc.id] = doc.data(); });
            
            const batch = writeBatch(db);
            const achievementsToAward = {};
            const players = Object.entries(members).map(([uid, data]) => ({ uid, ...data }));

            const seasonAchievementsRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'achievements');
            const oldSeasonAchievementsSnap = await getDocs(seasonAchievementsRef);
            oldSeasonAchievementsSnap.forEach(doc => batch.delete(doc.ref));

            for (const player of players) {
                if (!player.isPlaceholder) {
                    const userAchievementRef = doc(db, 'users', player.uid, 'achievements', season.id);
                    batch.delete(userAchievementRef);
                }
            }

            players.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
            if (players.length > 0) {
                players.filter(p => p.totalPoints === players[0].totalPoints).forEach(winner => {
                    if (!achievementsToAward[winner.uid]) achievementsToAward[winner.uid] = [];
                    achievementsToAward[winner.uid].push({ trophyId: 'CHAMPION', ...TROPHY_DEFINITIONS.CHAMPION });
                });
            }
            if (players.length > 1) {
                const secondScore = players[1].totalPoints;
                players.filter(p => p.totalPoints === secondScore).forEach(winner => {
                    if (!achievementsToAward[winner.uid]) achievementsToAward[winner.uid] = [];
                    achievementsToAward[winner.uid].push({ trophyId: 'RUNNER_UP', ...TROPHY_DEFINITIONS.RUNNER_UP });
                });
            }
            if (players.length > 2) {
                const thirdScore = players[2].totalPoints;
                players.filter(p => p.totalPoints === thirdScore).forEach(winner => {
                    if (!achievementsToAward[winner.uid]) achievementsToAward[winner.uid] = [];
                    achievementsToAward[winner.uid].push({ trophyId: 'THIRD_PLACE', ...TROPHY_DEFINITIONS.THIRD_PLACE });
                });
            }

            const statsByPlayer = {};
            players.forEach(p => { statsByPlayer[p.uid] = { scores: [], roundFinishes: Array(players.length).fill(0), lastPlaces: 0, captainPoints: 0, wastedBenchPoints: 0 }; });
            
            roundsData.forEach(round => {
                const roundId = round.id || round.roundNumber.toString();
                const participatingUids = Object.keys(round.scores || {}).filter(uid => typeof round.scores[uid] === 'number' && statsByPlayer[uid]);
                const rankedRound = participatingUids.map(uid => ({ uid, points: round.scores[uid] })).sort((a, b) => b.points - a.points);
                if (rankedRound.length > 0) {
                    const lowestScore = rankedRound[rankedRound.length - 1].points;
                    rankedRound.forEach((p, index) => {
                        let rank = index;
                        while (rank > 0 && rankedRound[rank - 1].points === p.points) { rank--; }
                        if (statsByPlayer[p.uid]) statsByPlayer[p.uid].roundFinishes[rank]++;
                        if (p.points === lowestScore) statsByPlayer[p.uid].lastPlaces++;
                    });
                }
                Object.entries(round.scores || {}).forEach(([uid, score]) => {
                    if (statsByPlayer[uid] && typeof score === 'number') {
                        statsByPlayer[uid].scores.push(score);
                        const lineup = lineupsData[`${roundId}-${uid}`];
                        if (lineup?.captainSlot) {
                            const [slotType, ...slotRest] = lineup.captainSlot.split('-'); const slotKey = slotRest.join('-'); let captain = null; if (slotType === 'coach') captain = lineup.coach; else if (slotType === 'players') captain = lineup.players?.[lineup.captainSlot]; else if (slotType === 'bench') captain = lineup.bench?.[slotKey]; if (captain?.points > 0) { statsByPlayer[uid].captainPoints += captain.points; }
                        }
                        ['GK', 'DF', 'MF', 'FW'].forEach(pos => { const benchPlayer = lineup?.bench?.[pos]; if (benchPlayer?.points > 0 && benchPlayer.status === 'playing' && !benchPlayer.active) { statsByPlayer[uid].wastedBenchPoints += benchPlayer.points; } });
                    }
                });
            });
            
            let topScorer = { uids: [], score: -Infinity };
            let worstScore = { uids: [], score: Infinity };
            roundsData.forEach(round => {
                Object.entries(round.scores || {}).forEach(([uid, score]) => {
                    if (typeof score === 'number') {
                        if (score > topScorer.score) topScorer = { uids: [uid], score };
                        else if (score === topScorer.score) topScorer.uids.push(uid);
                        if (score < worstScore.score) worstScore = { uids: [uid], score };
                        else if (score === worstScore.score) worstScore.uids.push(uid);
                    }
                });
            });
            if (topScorer.score > -Infinity) topScorer.uids.forEach(uid => { if (!achievementsToAward[uid]) achievementsToAward[uid] = []; achievementsToAward[uid].push({ trophyId: 'TOP_SCORER', ...TROPHY_DEFINITIONS.TOP_SCORER }); });
            if (worstScore.score < Infinity) worstScore.uids.forEach(uid => { if (!achievementsToAward[uid]) achievementsToAward[uid] = []; achievementsToAward[uid].push({ trophyId: 'STONE_HAND', ...TROPHY_DEFINITIONS.STONE_HAND }); });

            let mostWins = { uids: [], count: 0 }, mostPodiums = { uids: [], count: 0 }, mostLasts = { uids: [], count: 0 };
            let bestCaptain = { uids: [], points: 0 }, goldenBench = { uids: [], points: 0 };
            Object.entries(statsByPlayer).forEach(([uid, data]) => {
                const wins = data.roundFinishes[0] || 0;
                const podiums = (data.roundFinishes[0] || 0) + (data.roundFinishes[1] || 0) + (data.roundFinishes[2] || 0);
                const lasts = data.lastPlaces || 0;
                if(wins > mostWins.count) mostWins = { uids: [uid], count: wins }; else if (wins === mostWins.count) mostWins.uids.push(uid);
                if(podiums > mostPodiums.count) mostPodiums = { uids: [uid], count: podiums }; else if (podiums === mostPodiums.count) mostPodiums.uids.push(uid);
                if(lasts > mostLasts.count) mostLasts = { uids: [uid], count: lasts }; else if (lasts === mostLasts.count) mostLasts.uids.push(uid);
                if (data.captainPoints > bestCaptain.points) bestCaptain = { uids: [uid], points: data.captainPoints }; else if (data.captainPoints === bestCaptain.points) bestCaptain.uids.push(uid);
                if (data.wastedBenchPoints > goldenBench.points) goldenBench = { uids: [uid], points: data.wastedBenchPoints }; else if (data.wastedBenchPoints === goldenBench.points) goldenBench.uids.push(uid);
            });
            if (mostWins.count > 0) mostWins.uids.forEach(uid => { if (!achievementsToAward[uid]) achievementsToAward[uid] = []; achievementsToAward[uid].push({ trophyId: 'MOST_WINS', ...TROPHY_DEFINITIONS.MOST_WINS }); });
            if (mostPodiums.count > 0) mostPodiums.uids.forEach(uid => { if (!achievementsToAward[uid]) achievementsToAward[uid] = []; achievementsToAward[uid].push({ trophyId: 'MOST_PODIUMS', ...TROPHY_DEFINITIONS.MOST_PODIUMS }); });
            if (mostLasts.count > 0) mostLasts.uids.forEach(uid => { if (!achievementsToAward[uid]) achievementsToAward[uid] = []; achievementsToAward[uid].push({ trophyId: 'LANTERN_ROUGE', ...TROPHY_DEFINITIONS.LANTERN_ROUGE }); });
            if (bestCaptain.points > 0) bestCaptain.uids.forEach(uid => { if (!achievementsToAward[uid]) achievementsToAward[uid] = []; achievementsToAward[uid].push({ trophyId: 'CAPTAIN_FANTASTIC', ...TROPHY_DEFINITIONS.CAPTAIN_FANTASTIC }); });
            if (goldenBench.points > 0) goldenBench.uids.forEach(uid => { if (!achievementsToAward[uid]) achievementsToAward[uid] = []; achievementsToAward[uid].push({ trophyId: 'GOLDEN_BENCH', ...TROPHY_DEFINITIONS.GOLDEN_BENCH }); });
            
            let mostRegular = { uids: [], value: Infinity };
            Object.entries(statsByPlayer).forEach(([uid, data]) => {
                const regularity = calculateStandardDeviation(data.scores);
                if(data.scores.length > 1 && regularity < mostRegular.value) mostRegular = { uids: [uid], value: regularity };
                else if (data.scores.length > 1 && regularity === mostRegular.value) mostRegular.uids.push(uid);
            });
            if (mostRegular.value !== Infinity) mostRegular.uids.forEach(uid => { if (!achievementsToAward[uid]) achievementsToAward[uid] = []; achievementsToAward[uid].push({ trophyId: 'MOST_REGULAR', ...TROPHY_DEFINITIONS.MOST_REGULAR }); });

            const transfersRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'transfers');
            const transfersSnapshot = await getDocs(transfersRef);
            const transfers = transfersSnapshot.docs.map(doc => doc.data());
            const spending = {}, netBalance = {}, transferCount = {};
            transfers.forEach(t => {
                if (t.buyerId !== 'market' && members[t.buyerId]) { spending[t.buyerId] = (spending[t.buyerId] || 0) + t.price; netBalance[t.buyerId] = (netBalance[t.buyerId] || 0) - t.price; transferCount[t.buyerId] = (transferCount[t.buyerId] || 0) + 1; }
                if (t.sellerId !== 'market' && members[t.sellerId]) { netBalance[t.sellerId] = (netBalance[t.sellerId] || 0) + t.price; }
            });
            let maxSpent = 0; for(const uid in spending) { if(spending[uid] > maxSpent) maxSpent = spending[uid]; }
            const marketKings = Object.keys(spending).filter(uid => spending[uid] === maxSpent);
            let maxNet = -Infinity; for(const uid in netBalance) { if(netBalance[uid] > maxNet) maxNet = netBalance[uid]; }
            const leagueSharks = Object.keys(netBalance).filter(uid => netBalance[uid] === maxNet);
            let maxTransfers = 0; for(const uid in transferCount) { if(transferCount[uid] > maxTransfers) maxTransfers = transferCount[uid]; }
            const speculators = Object.keys(transferCount).filter(uid => transferCount[uid] === maxTransfers);
            if (maxSpent > 0) marketKings.forEach(uid => { if (!achievementsToAward[uid]) achievementsToAward[uid] = []; achievementsToAward[uid].push({ trophyId: 'MARKET_KING', ...TROPHY_DEFINITIONS.MARKET_KING }); });
            if (maxNet > -Infinity) leagueSharks.forEach(uid => { if (!achievementsToAward[uid]) achievementsToAward[uid] = []; achievementsToAward[uid].push({ trophyId: 'LEAGUE_SHARK', ...TROPHY_DEFINITIONS.LEAGUE_SHARK }); });
            if (maxTransfers > 0) speculators.forEach(uid => { if (!achievementsToAward[uid]) achievementsToAward[uid] = []; achievementsToAward[uid].push({ trophyId: 'SPECULATOR', ...TROPHY_DEFINITIONS.SPECULATOR }); });
            
            for(const userId in achievementsToAward) {
                const achievementRef = doc(db, 'leagues', league.id, 'seasons', season.id, 'achievements', userId);
                const isPlaceholder = members[userId]?.isPlaceholder || false;
                const teamName = members[userId]?.teamName || '';
                batch.set(achievementRef, { trophies: achievementsToAward[userId], isPlaceholder, teamName });
                if (!isPlaceholder) {
                    const userAchievementRef = doc(db, 'users', userId, 'achievements', season.id);
                    batch.set(userAchievementRef, { seasonName: season.name, leagueName: league.name, trophies: achievementsToAward[userId] });
                }
            }

            if (players.length > 0) {
                const champion = players[0];
                const championName = members[champion.uid]?.teamName || 'Un valiente competidor';
                const postContent = `🏆 ¡La ${season.name} de la liga "${league.name}" ha llegado a su fin! 🏆\n\n¡Enhorabuena a ${championName} por proclamarse campeón de la liga! 👑\n\nPronto se podrán consultar todos los ganadores de trofeos en el Salón de la Fama.`;
                
                const postsRef = collection(db, 'posts');
                batch.set(doc(postsRef), {
                    content: postContent,
                    tags: ['finaldetemporada', 'campeon', league.name.toLowerCase().replace(/\s/g, '')],
                    authorId: auth.currentUser.uid,
                    authorUsername: adminProfile.username,
                    authorPhotoURL: adminProfile.photoURL || null,
                    createdAt: serverTimestamp(),
                    likes: [],
                });
            }

            await batch.commit();
            toast.success('¡Trofeos otorgados y publicación creada con éxito!', { id: loadingToast });

        } catch (error) {
            console.error("Error al otorgar trofeos:", error);
            toast.error("No se pudieron otorgar los trofeos.", { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };
    
    if (!season || !members) {
        return <LoadingSpinner text="Cargando datos de administrador..." />;
    }

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-4 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Gestión de Puntuaciones</h3>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setViewMode('single')} className={`p-2 rounded-md ${viewMode === 'single' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="Vista de Jornada Única"><List size={20} /></button>
                        <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="Vista de Calendario Completo"><Calendar size={20} /></button>
                    </div>
                </div>

                {viewMode === 'single' ? (
                    <div>
                        <div className="mb-6"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Seleccionar Jornada a Editar</label><input type="number" value={round} onChange={(e) => setRound(Number(e.target.value))} className="input dark:bg-gray-700 dark:border-gray-600 !w-32" min="1" /></div>
                        <div className="space-y-4">
                            <h4 className="font-semibold text-gray-800 dark:text-gray-200">Puntuaciones de la Jornada {round}</h4>
                            {Object.keys(members).map(uid => (
                                <div key={uid} className="flex items-center justify-between">
                                    <span className="text-gray-700 dark:text-gray-300">{members[uid].teamName}</span>
                                    <input 
                                        type="text"
                                        placeholder="--"
                                        value={scores[round]?.[uid] ?? ''} 
                                        onChange={(e) => handleScoreChange(round, uid, e.target.value)} 
                                        className="input dark:bg-gray-700 dark:border-gray-600 !w-24 text-center"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nº Total de Jornadas en la Temporada</label><input type="number" value={totalRounds} onChange={(e) => setTotalRounds(Number(e.target.value))} className="input dark:bg-gray-700 dark:border-gray-600 !w-32" min="1" max="50"/></div>
                        <div className="overflow-x-auto border dark:border-gray-700 rounded-lg">
                            <table className="min-w-full text-sm text-center">
                                <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <th className="p-2 text-left sticky left-0 bg-gray-50 dark:bg-gray-800 font-semibold text-gray-600 dark:text-gray-300 z-10 w-48">Jugador</th>
                                        {Array.from({ length: totalRounds }, (_, i) => i + 1).map(r => (<th key={r} className="p-2 font-semibold text-gray-600 dark:text-gray-300 min-w-[5rem]">{r}</th>))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {Object.entries(members).map(([uid, member]) => (
                                        <tr key={uid} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="p-2 text-left sticky left-0 bg-white dark:bg-gray-700/80 backdrop-blur-sm font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap z-10">{member.teamName}</td>
                                            {Array.from({ length: totalRounds }, (_, i) => i + 1).map(r => (
                                                <td key={r} className="p-0">
                                                    <input
                                                        type="text"
                                                        placeholder="-"
                                                        value={scores[r]?.[uid] ?? ''}
                                                        onChange={(e) => handleScoreChange(r, uid, e.target.value)}
                                                        className="w-full h-full p-1 text-center bg-transparent dark:text-white border-none focus:outline-none focus:bg-emerald-50 dark:focus:bg-emerald-900/50 rounded-sm"
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                <div className="mt-8 pt-4 border-t dark:border-gray-700 flex justify-end">
                    <button onClick={handleSaveScores} disabled={loading} className="btn-primary disabled:opacity-50">
                        {loading ? 'Guardando...' : 'Guardar y Recalcular Puntos'}
                    </button>
                </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Añadir Participantes (sin registro)</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Añade equipos a la temporada. Podrán reclamarlos al unirse con el código de invitación.</p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} className="input dark:bg-gray-700 dark:border-gray-600 flex-grow" placeholder="Nombre del nuevo equipo"/>
                    <button onClick={handleAddGhostTeam} disabled={loading} className="btn-primary whitespace-nowrap">{loading ? 'Añadiendo...' : 'Añadir Equipo'}</button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Gestión de Miembros</h3>
                <div className="space-y-3">{Object.entries(members).map(([uid, member]) => (<div key={uid} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg gap-2"><div><p className="font-semibold text-gray-800 dark:text-gray-200">{member.teamName} {member.isPlaceholder && <span className="text-xs font-bold text-gray-500 dark:text-gray-400">(Sin reclamar)</span>}</p><p className={`text-sm font-bold ${member.role === 'admin' ? 'text-emerald-600' : 'text-gray-500 dark:text-gray-400'}`}>{uid === league.ownerId ? 'Propietario' : member.role === 'admin' ? 'Admin' : 'Miembro'}</p></div>
                    <div className="flex gap-2 self-end sm:self-center">
                        {uid !== league.ownerId && ( <>
                            {member.isPlaceholder ? ( <button onClick={() => handleKickUser(uid, member.teamName)} className="btn-action bg-red-500 hover:bg-red-600">Expulsar</button> ) : ( <>
                                {member.role === 'member' ? ( <button onClick={() => handleSetRole(uid, 'admin')} className="btn-action bg-blue-500 hover:bg-blue-600">Hacer Admin</button> ) : ( <button onClick={() => handleSetRole(uid, 'member')} className="btn-action bg-gray-500 hover:bg-gray-600">Quitar Admin</button> )}
                                <button onClick={() => handleKickUser(uid, member.teamName)} className="btn-action bg-red-500 hover:bg-red-600">Expulsar</button>
                            </> )}
                        </>)}
                    </div>
                </div>))}</div>
            </div>
            
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2"><Award /> Fin de Temporada</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Una vez que la temporada haya concluido, usa esta herramienta para (re)calcular y asignar los trofeos a los perfiles de los ganadores.
                </p>
                <button 
                    onClick={handleAwardTrophies} 
                    disabled={loading} 
                    className="btn-primary w-full sm:w-auto disabled:opacity-50"
                >
                    {loading ? 'Calculando...' : 'Calcular y Otorgar Trofeos'}
                </button>
            </div>
        </div>
    );
}