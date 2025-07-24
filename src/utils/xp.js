import { doc, updateDoc, increment, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';

export const XP_VALUES = {
    POINTS_PER_10: 1,
    TRANSFER: 5,
    POST: 10,
    POST_WITH_IMAGE: 15,
    TROPHY: 100,
    CHALLENGE: 25,
};

export const grantXp = async (userId, action, value = 1) => {
    if (!userId || !action || !XP_VALUES[action]) return;
    try {
        const userRef = doc(db, 'users', userId);
        const xpToGrant = XP_VALUES[action] * value;
        await updateDoc(userRef, {
            xp: increment(xpToGrant)
        });
    } catch (error) {
        console.error(`Error granting XP for action ${action}:`, error);
    }
};

export const calculateXpForAllUsers = async () => {
    const batch = writeBatch(db);
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const leaguesSnapshot = await getDocs(collection(db, 'leagues'));
    const postsSnapshot = await getDocs(collection(db, 'posts'));

    const userXp = {};

    usersSnapshot.forEach(userDoc => {
        userXp[userDoc.id] = 0;
    });

    postsSnapshot.forEach(postDoc => {
        const post = postDoc.data();
        if (userXp[post.authorId] !== undefined) {
            userXp[post.authorId] += post.imageURL ? XP_VALUES.POST_WITH_IMAGE : XP_VALUES.POST;
        }
    });

    for (const leagueDoc of leaguesSnapshot.docs) {
        const seasonsSnapshot = await getDocs(collection(db, 'leagues', leagueDoc.id, 'seasons'));
        for (const seasonDoc of seasonsSnapshot.docs) {
            const transfersSnapshot = await getDocs(collection(db, 'leagues', leagueDoc.id, 'seasons', seasonDoc.id, 'transfers'));
            const roundsSnapshot = await getDocs(collection(db, 'leagues', leagueDoc.id, 'seasons', seasonDoc.id, 'rounds'));
            const achievementsSnapshot = await getDocs(collection(db, 'leagues', leagueDoc.id, 'seasons', seasonDoc.id, 'achievements'));

            transfersSnapshot.forEach(transferDoc => {
                const transfer = transferDoc.data();
                if (userXp[transfer.buyerId] !== undefined) {
                    userXp[transfer.buyerId] += XP_VALUES.TRANSFER;
                }
            });

            roundsSnapshot.forEach(roundDoc => {
                const scores = roundDoc.data().scores || {};
                for (const userId in scores) {
                    if (userXp[userId] !== undefined && typeof scores[userId] === 'number') {
                        userXp[userId] += Math.floor(scores[userId] / 10) * XP_VALUES.POINTS_PER_10;
                    }
                }
            });

            achievementsSnapshot.forEach(achDoc => {
                const userId = achDoc.id;
                const data = achDoc.data();
                if (userXp[userId] !== undefined && !data.isPlaceholder) {
                    userXp[userId] += (data.trophies?.length || 0) * XP_VALUES.TROPHY;
                }
            });
        }
    }

    for (const userId in userXp) {
        const userRef = doc(db, 'users', userId);
        batch.update(userRef, { xp: userXp[userId] });
    }

    await batch.commit();
};