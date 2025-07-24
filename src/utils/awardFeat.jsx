import React from 'react';
import { doc, runTransaction, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { Award } from 'lucide-react';

export const awardFeat = async (userId, featId, details) => {
    const featRef = doc(db, 'users', userId, 'feats', featId);

    try {
        await runTransaction(db, async (transaction) => {
            const featDoc = await transaction.get(featRef);
            
            const newInstance = {
                ...details,
                date: serverTimestamp()
            };

            if (!featDoc.exists()) {
                transaction.set(featRef, { instances: [newInstance] });
            } else {
                transaction.update(featRef, { instances: arrayUnion(newInstance) });
            }
        });
        
        toast.custom((t) => (
            <div
              className={`${
                t.visible ? 'animate-enter' : 'animate-leave'
              } max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}
            >
              <div className="flex-1 w-0 p-4">
                <div className="flex items-start">
                  <div className={`flex-shrink-0 pt-0.5 text-2xl text-yellow-500`}>
                    <Award />
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      ¡Reto Conseguido!
                    </p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Has completado: {details.challengeTitle}
                    </p>
                  </div>
                </div>
              </div>
            </div>
        ));
        console.log(`Hazaña ${featId} otorgada a ${userId}`);
    } catch (error) {
        console.error(`Error al otorgar la hazaña ${featId}:`, error);
    }
};