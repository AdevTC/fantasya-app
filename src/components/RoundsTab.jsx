import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';
import { formatHolderNames } from '../utils/helpers';
import { Link } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';

export default function RoundsTab({ league }) {
    const [roundsData, setRoundsData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRound, setSelectedRound] = useState(null);

    useEffect(() => {
        const fetchRounds = async () => {
            setLoading(true);
            const roundsRef = collection(db, 'leagues', league.id, 'rounds');
            const q = query(roundsRef, orderBy('roundNumber', 'desc'));
            const querySnapshot = await getDocs(q);
            const rounds = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRoundsData(rounds);
            if (rounds.length > 0) {
                setSelectedRound(rounds[0]);
            }
            setLoading(false);
        };
        fetchRounds();
    }, [league.id]);
    
    const roundDetails = useMemo(() => {
        if (!selectedRound || !league.members) return null;
        
        // --- LÓGICA CORREGIDA PARA FILTRAR SOLO MIEMBROS VÁLIDOS ---
        const scores = selectedRound.scores || {};
        const playerScoresSorted = Object.keys(scores)
            .filter(uid => league.members[uid]) // Solo procesar si el miembro aún existe en la liga
            .map(uid => ({
                uid,
                name: league.members[uid]?.teamName || 'Desconocido',
                username: league.members[uid]?.username,
                points: scores[uid]
            }))
            .sort((a, b) => b.points - a.points);
        
        if (playerScoresSorted.length === 0) {
            return { playerScores: [], bestScore: 0, worstScore: 0, average: 0, bestScoreHolders: [], worstScoreHolders: [] };
        }

        const playerScoresRanked = [];
        for (let i = 0; i < playerScoresSorted.length; i++) {
            let rank;
            if (i > 0 && playerScoresSorted[i].points === playerScoresSorted[i - 1].points) {
                rank = playerScoresRanked[i - 1].rank;
            } else {
                rank = i + 1;
            }
            playerScoresRanked.push({ ...playerScoresSorted[i], rank });
        }
        
        const validScores = playerScoresRanked.map(s => s.points);
        const bestScore = Math.max(...validScores);
        const worstScore = Math.min(...validScores);
        const average = (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1);
        const bestScoreHolders = playerScoresRanked.filter(p => p.points === bestScore).map(p => p.name);
        const worstScoreHolders = playerScoresRanked.filter(p => p.points === worstScore).map(p => p.name);

        return { playerScores: playerScoresRanked, bestScore, bestScoreHolders, worstScore, worstScoreHolders, average };
    }, [selectedRound, league.members]);

    if (loading) return <LoadingSpinner text="Cargando jornadas..." />;
    if (roundsData.length === 0) return ( <div className="bg-white rounded-xl shadow-sm border p-6 text-center"><h3 className="text-lg font-semibold text-gray-800">No hay jornadas jugadas</h3><p className="mt-2 text-gray-500">El administrador aún no ha subido las puntuaciones de ninguna jornada.</p></div> );

    const getRowClass = (rank) => {
        if (rank === 1) return 'bg-podium-gold border-yellow-200';
        if (rank === 2) return 'bg-podium-silver border-gray-200';
        if (rank === 3) return 'bg-podium-bronze border-orange-200';
        return 'border-gray-200';
    };

    return (
        <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1"><div className="bg-white rounded-xl shadow-sm border p-6"><h3 className="text-lg font-semibold text-gray-800 mb-4">Seleccionar Jornada</h3><div className="space-y-2 max-h-96 overflow-y-auto">{roundsData.map(round => (<button key={round.id} onClick={() => setSelectedRound(round)} className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedRound?.id === round.id ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold' : 'hover:bg-gray-50 border-gray-200'}`}>Jornada {round.roundNumber}</button>))}</div></div></div>
            <div className="lg:col-span-2">{selectedRound && roundDetails && (<div className="bg-white rounded-xl shadow-sm border"><div className="px-6 py-4 border-b bg-gray-50"><h3 className="text-lg font-semibold text-gray-800">Jornada {selectedRound.roundNumber} - Resultados</h3></div><div className="p-6"><div className="grid md:grid-cols-3 gap-4 mb-6"><div className="text-center p-4 bg-yellow-50 rounded-lg"><p className="text-sm text-gray-600">Mejor Puntuación</p><p className="font-bold text-gray-800 truncate" title={`${formatHolderNames([...roundDetails.bestScoreHolders])} - ${roundDetails.bestScore} pts`}>{formatHolderNames([...roundDetails.bestScoreHolders])} - {roundDetails.bestScore} pts</p></div><div className="text-center p-4 bg-red-50 rounded-lg"><p className="text-sm text-gray-600">Peor Puntuación</p><p className="font-bold text-gray-800 truncate" title={`${formatHolderNames([...roundDetails.worstScoreHolders])} - ${roundDetails.worstScore} pts`}>{formatHolderNames([...roundDetails.worstScoreHolders])} - {roundDetails.worstScore} pts</p></div><div className="text-center p-4 bg-blue-50 rounded-lg"><p className="text-sm text-gray-600">Media</p><p className="font-bold text-gray-800">{roundDetails.average} pts</p></div></div><div className="space-y-3">{roundDetails.playerScores.map((player) => (<div key={player.uid} className={`flex items-center justify-between p-3 rounded-lg border ${getRowClass(player.rank)}`}><div className="flex items-center"><Link to={`/profile/${player.username}`} className="font-semibold hover:text-deep-blue hover:underline">{player.rank}º. {player.name}</Link></div><span className="font-bold text-lg">{player.points} pts</span></div>))}</div></div></div>)}</div>
        </div>
    );
}
