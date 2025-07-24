import { doc, getDocs, collection, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { TROPHY_DEFINITIONS } from '../components/AdminTab';

const calculateStandardDeviation = (array) => {
    const n = array.length;
    if (n < 2) return 0;
    const mean = array.reduce((a, b) => a + b) / n;
    return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / (n - 1));
};

export const calculateAndAwardTrophies = async (league, season) => {
    const members = season.members;
    const memberIds = Object.keys(members);
    const userTrophies = {};
    memberIds.forEach(uid => userTrophies[uid] = []);

    // --- Data Fetching ---
    const roundsRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'rounds');
    const transfersRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'transfers');
    const lineupsRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'lineups');

    const [roundsSnapshot, transfersSnapshot, lineupsSnapshot] = await Promise.all([
        getDocs(roundsRef),
        getDocs(transfersRef),
        getDocs(lineupsRef)
    ]);

    const rounds = roundsSnapshot.docs.map(d => ({...d.data(), id: d.id})).sort((a,b) => a.roundNumber - b.roundNumber);
    const transfers = transfersSnapshot.docs.map(d => d.data());
    const lineups = {};
    lineupsSnapshot.forEach(doc => lineups[doc.id] = doc.data());

    // --- Trophy Calculations ---

    // 1. Final Standings Trophies (Champion, Runner-up, Third Place)
    const finalStandings = memberIds
        .map(uid => ({ uid, totalPoints: members[uid].totalPoints || 0 }))
        .sort((a, b) => b.totalPoints - a.totalPoints);

    if (finalStandings[0]) userTrophies[finalStandings[0].uid].push({ trophyId: 'CHAMPION', value: finalStandings[0].totalPoints });
    if (finalStandings[1]) userTrophies[finalStandings[1].uid].push({ trophyId: 'RUNNER_UP', value: finalStandings[1].totalPoints });
    if (finalStandings[2]) userTrophies[finalStandings[2].uid].push({ trophyId: 'THIRD_PLACE', value: finalStandings[2].totalPoints });

    // 2. Round-based Trophies (Pichichi, Stone Hand, Wins, Podiums, Last Place, Remontada, Streak)
    const roundStats = {};
    memberIds.forEach(uid => roundStats[uid] = { scores: [], wins: 0, podiums: 0, lastPlaces: 0, consecutiveWins: 0 });

    rounds.forEach((round, roundIndex) => {
        const scoresForRound = Object.entries(round.scores || {})
            .filter(([, score]) => typeof score === 'number')
            .map(([uid, score]) => ({ uid, score }));

        if (scoresForRound.length > 0) {
            scoresForRound.sort((a, b) => b.score - a.score);
            const winner = scoresForRound[0];
            const lastPlaceScore = scoresForRound[scoresForRound.length - 1].score;

            scoresForRound.forEach(({ uid, score }, index) => {
                if (roundStats[uid]) {
                    roundStats[uid].scores.push(score);

                    let rank = index + 1;
                    if(index > 0 && score === scoresForRound[index - 1].score) {
                        rank = scoresForRound.findIndex(s => s.score === score) + 1;
                    }

                    if (rank === 1) {
                        roundStats[uid].wins++;
                        roundStats[uid].consecutiveWins++;
                        // Streak Master Check
                        if (roundStats[uid].consecutiveWins === 3) {
                             userTrophies[uid].push({ trophyId: 'STREAK_MASTER', value: 3 });
                        }
                        // Comeback King Check
                        if(roundIndex > 0) {
                            const prevRound = rounds[roundIndex-1];
                            const prevScores = Object.entries(prevRound.scores || {})
                                .filter(([, score]) => typeof score === 'number')
                                .map(([uid, score]) => ({ uid, score }))
                                .sort((a,b) => b.score - a.score);
                            const prevRank = prevScores.findIndex(p => p.uid === uid) + 1;
                            if(prevRank >= 4) {
                                userTrophies[uid].push({ trophyId: 'COMEBACK_KING', value: `J${round.roundNumber}`});
                            }
                        }
                    } else {
                        roundStats[uid].consecutiveWins = 0;
                    }

                    if (rank <= 3) roundStats[uid].podiums++;
                    if (score === lastPlaceScore) roundStats[uid].lastPlaces++;
                }
            });
        }
    });

    const findWinners = (metric, compareFn) => {
        let bestValue = null;
        let winners = [];
        memberIds.forEach(uid => {
            const value = metric(roundStats[uid], uid);
            if (value === null || value === undefined) return;

            if (bestValue === null || compareFn(value, bestValue)) {
                bestValue = value;
                winners = [uid];
            } else if (value === bestValue) {
                winners.push(uid);
            }
        });
        return { winners, value: bestValue };
    };

    findWinners(s => Math.max(...s.scores, 0), (a, b) => a > b).winners.forEach(uid => userTrophies[uid].push({ trophyId: 'TOP_SCORER', value: findWinners(s => Math.max(...s.scores, 0), (a, b) => a > b).value }));
    findWinners(s => Math.min(...s.scores, Infinity), (a, b) => a < b).winners.forEach(uid => userTrophies[uid].push({ trophyId: 'STONE_HAND', value: findWinners(s => Math.min(...s.scores, Infinity), (a, b) => a < b).value }));
    findWinners(s => s.wins, (a, b) => a > b).winners.forEach(uid => userTrophies[uid].push({ trophyId: 'MOST_WINS', value: findWinners(s => s.wins, (a, b) => a > b).value }));
    findWinners(s => s.podiums, (a, b) => a > b).winners.forEach(uid => userTrophies[uid].push({ trophyId: 'MOST_PODIUMS', value: findWinners(s => s.podiums, (a, b) => a > b).value }));
    findWinners(s => s.lastPlaces, (a, b) => a > b).winners.forEach(uid => userTrophies[uid].push({ trophyId: 'LANTERN_ROUGE', value: findWinners(s => s.lastPlaces, (a, b) => a > b).value }));
    
    const regularityData = roundStats;
    Object.keys(regularityData).forEach(uid => {
        regularityData[uid].stdDev = calculateStandardDeviation(regularityData[uid].scores);
    });
    findWinners(s => s.stdDev, (a,b) => a < b).winners.forEach(uid => userTrophies[uid].push({ trophyId: 'MOST_REGULAR', value: findWinners(s => s.stdDev, (a,b) => a < b).value.toFixed(2)}));

    // 3. Transfer-based Trophies (Market King, League Shark, Speculator, Galactic Signing)
    const transferStats = {};
    memberIds.forEach(uid => transferStats[uid] = { spent: 0, earned: 0, buys: 0 });
    transfers.forEach(t => {
        if(transferStats[t.buyerId]) {
            transferStats[t.buyerId].spent += t.price;
            transferStats[t.buyerId].buys++;
        }
        if(t.sellerId !== 'market' && transferStats[t.sellerId]) {
            transferStats[t.sellerId].earned += t.price;
        }
    });
    
    const findTransferWinners = (metric, compareFn) => {
        let bestValue = -Infinity;
        let winners = [];
        memberIds.forEach(uid => {
            const value = metric(transferStats[uid]);
            if(value > bestValue) {
                bestValue = value;
                winners = [uid];
            } else if (value === bestValue) {
                winners.push(uid);
            }
        });
        return { winners, value: bestValue };
    };

    const marketKing = findTransferWinners(t => t.spent, (a,b) => a > b);
    if (marketKing.value > 0) marketKing.winners.forEach(uid => userTrophies[uid].push({ trophyId: 'MARKET_KING', value: marketKing.value }));
    
    const leagueShark = findTransferWinners(t => t.earned - t.spent, (a,b) => a > b);
    if (leagueShark.value > 0) leagueShark.winners.forEach(uid => userTrophies[uid].push({ trophyId: 'LEAGUE_SHARK', value: leagueShark.value }));

    const speculator = findTransferWinners(t => t.buys, (a,b) => a > b);
    if (speculator.value > 0) speculator.winners.forEach(uid => userTrophies[uid].push({ trophyId: 'SPECULATOR', value: speculator.value }));
    
    const top5Prices = transfers.map(t => t.price).sort((a,b) => b - a).slice(0,5).filter(p => p > 0);
    if (top5Prices.length > 0) {
        const galacticSignings = transfers.filter(t => top5Prices.includes(t.price));
        galacticSignings.forEach(t => {
            if(userTrophies[t.buyerId] && !userTrophies[t.buyerId].some(trophy => trophy.trophyId === 'GALACTIC_SIGNING')) {
                userTrophies[t.buyerId].push({ trophyId: 'GALACTIC_SIGNING', value: t.playerName });
            }
        });
    }

    // 4. Lineup-based Trophies (Captain Fantastic, Golden Bench)
    const lineupStats = {};
    memberIds.forEach(uid => lineupStats[uid] = { captainPoints: 0, wastedBench: 0 });

    Object.entries(lineups).forEach(([lineupId,lineupData]) => {
        const lineupOwner = lineupId.split('-')[1];
        if(lineupOwner && lineupStats[lineupOwner]) {
             // Captain Fantastic
            if (lineupData.captainSlot) {
                const [slotType, ...slotRest] = lineupData.captainSlot.split('-');
                let captain = null;
                if (slotType === 'coach') captain = lineupData.coach;
                else if (slotType === 'players') captain = lineupData.players?.[lineupData.captainSlot];
                else if (slotType === 'bench') captain = lineupData.bench?.[slotRest.join('-')];
                if (captain?.points > 0) lineupStats[lineupOwner].captainPoints += captain.points;
            }
            // Golden Bench
            Object.values(lineupData.bench || {}).forEach(p => {
                if (p && p.points > 0 && !p.active) { 
                    lineupStats[lineupOwner].wastedBench += p.points;
                }
            });
        }
    });
    
    const findLineupWinners = (metric, compareFn) => {
        let bestValue = -Infinity;
        let winners = [];
        memberIds.forEach(uid => {
            const value = metric(lineupStats[uid]);
            if(value > bestValue) {
                bestValue = value;
                winners = [uid];
            } else if (value === bestValue) {
                winners.push(uid);
            }
        });
        return { winners, value: bestValue };
    };

    const captainFantastic = findLineupWinners(s => s.captainPoints, (a, b) => a > b);
    if (captainFantastic.value > 0) captainFantastic.winners.forEach(uid => userTrophies[uid].push({ trophyId: 'CAPTAIN_FANTASTIC', value: captainFantastic.value }));

    const goldenBench = findLineupWinners(s => s.wastedBench, (a, b) => a > b);
    if (goldenBench.value > 0) goldenBench.winners.forEach(uid => userTrophies[uid].push({ trophyId: 'GOLDEN_BENCH', value: goldenBench.value }));

    // --- Database Update ---
    const batch = writeBatch(db);
    for (const userId of memberIds) {
        if (userTrophies[userId].length > 0) {
            const achievementData = {
                seasonName: season.name,
                leagueName: league.name,
                trophies: userTrophies[userId].map(t => ({...t, name: TROPHY_DEFINITIONS[t.trophyId].name, description: TROPHY_DEFINITIONS[t.trophyId].description})),
                isPlaceholder: members[userId].isPlaceholder || false,
                teamName: members[userId].teamName
            };
            
            const leagueAchievementRef = doc(db, 'leagues', league.id, 'seasons', season.id, 'achievements', userId);
            batch.set(leagueAchievementRef, achievementData);
            
            if (!members[userId].isPlaceholder) {
                const userAchievementRef = doc(db, 'users', userId, 'achievements', season.id);
                batch.set(userAchievementRef, achievementData);
            }
        }
    }
    await batch.commit();
};


export const revokeTrophiesForSeason = async (leagueId, season) => {
    const batch = writeBatch(db);
    const memberIds = Object.keys(season.members);

    for (const userId of memberIds) {
        const leagueAchievementRef = doc(db, 'leagues', leagueId, 'seasons', season.id, 'achievements', userId);
        batch.delete(leagueAchievementRef);

        if (!season.members[userId].isPlaceholder) {
            const userAchievementRef = doc(db, 'users', userId, 'achievements', season.id);
            batch.delete(userAchievementRef);
        }
    }
    await batch.commit();
};