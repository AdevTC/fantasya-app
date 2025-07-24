import React from 'react';
import { doc, runTransaction, arrayUnion, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export const awardFeat = async (userId, featId, details, transaction, featDoc = null) => {
    const featRef = doc(db, 'users', userId, 'feats', featId);

    const newInstance = {
        ...details,
        date: new Date() 
    };

    const processAward = async (trans) => {
        const docToProcess = featDoc === null ? await trans.get(featRef) : featDoc;

        if (!docToProcess.exists()) {
            trans.set(featRef, { instances: [newInstance] });
        } else {
            trans.update(featRef, { instances: arrayUnion(newInstance) });
        }
    };

    try {
        if (transaction) {
            await processAward(transaction);
        } else {
            await runTransaction(db, processAward);
        }
    } catch (error) {
        console.error(`Error al otorgar la hazaña ${featId}:`, error);
    }
};