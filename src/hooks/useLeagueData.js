import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';

export function useLeagueData(leagueId) {
    const [league, setLeague] = useState(null);
    const [seasons, setSeasons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!leagueId) {
            setLoading(false);
            setError('No league ID provided.');
            return;
        }

        setLoading(true);

        const leagueRef = doc(db, 'leagues', leagueId);
        const unsubscribeLeague = onSnapshot(leagueRef, (leagueSnap) => {
            if (leagueSnap.exists()) {
                setLeague({ id: leagueSnap.id, ...leagueSnap.data() });
                setError('');
            } else {
                setError('No se encontró la liga.');
                setLeague(null);
                setSeasons([]);
            }
        }, (err) => {
            console.error("Error al obtener la liga:", err);
            setError('Error al cargar los datos de la liga.');
            setLoading(false);
        });

        const seasonsRef = collection(db, 'leagues', leagueId, 'seasons');
        const seasonsQuery = query(seasonsRef, orderBy('seasonNumber', 'asc'));
        const unsubscribeSeasons = onSnapshot(seasonsQuery, (seasonsSnap) => {
            const allSeasons = seasonsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSeasons(allSeasons);
            // La carga finaliza una vez que tenemos las temporadas
            setLoading(false);
        }, (err) => {
            console.error("Error al obtener las temporadas:", err);
            setError('Error al cargar las temporadas.');
            setLoading(false);
        });

        // Función de limpieza para detener la escucha cuando el componente se desmonte
        return () => {
            unsubscribeLeague();
            unsubscribeSeasons();
        };
    }, [leagueId]);

    return { league, seasons, loading, error };
}