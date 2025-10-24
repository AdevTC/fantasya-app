// src/components/HistoricalStatsTab.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import LoadingSpinner from './LoadingSpinner';
import { Link } from 'react-router-dom';
import { Filter, ArrowUp, ArrowDown, ChevronsUpDown, ChevronLeft, ChevronRight, Users, Swords, X, Check, BarChart, Info, Plus, ArrowRight, Trash2, Pencil } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Componente reutilizable para encabezados de tabla ordenables
const SortableHeader = ({ label, columnKey, sortConfig, requestSort }) => {
    // ... (Mismo componente que antes, sin cambios)
    const isActive = sortConfig.key === columnKey;
    const directionIcon = isActive ? (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ChevronsUpDown size={14} className="text-gray-400" />;

    return (
        <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => requestSort(columnKey)}>
            <div className="flex items-center gap-1">
                {label} {directionIcon}
            </div>
        </th>
    );
};

// --- COMPONENTE DE COMPARACIÓN POR GRUPOS ---
// *** MODIFICADO: Acepta 'seasons' y tiene filtro interno ***
const GroupComparisonView = ({ historicalData, comparisonGroups, onBack, seasons }) => {

    const playerColors = [
        'text-blue-600 dark:text-blue-400',
        'text-emerald-600 dark:text-emerald-400',
        'text-red-600 dark:text-red-400',
        'text-yellow-600 dark:text-yellow-400',
        'text-purple-600 dark:text-purple-400',
    ];

    const getPlayerColor = (index) => playerColors[index % playerColors.length];

    // --- NUEVO ESTADO: Filtro de temporada interno ---
    const [filterSeasonId, setFilterSeasonId] = useState('general'); // 'general' o un seasonId

    const activeGroups = useMemo(() => comparisonGroups.filter(g => g.members.length > 0), [comparisonGroups]);
    const groupNames = useMemo(() => activeGroups.map(g => g.name), [activeGroups]); 

    // --- useMemo MODIFICADO: Ahora depende de 'filterSeasonId' ---
    const multiH2hStats = useMemo(() => {
        
        // --- NUEVA LÓGICA DE FILTRADO ---
        // Filtra los datos ANTES de calcular nada, según el filtro interno
        const dataToUse = (filterSeasonId === 'general')
            ? historicalData
            : historicalData.filter(d => d.seasonId === filterSeasonId);
        // --- FIN LÓGICA ---

        const playerStats = {};
        const winCounts = {};
        const tieCounts = {}; // (Victorias en empate)
        let totalTies = 0; // Contador de jornadas empatadas
        const groupDetails = {}; 

        groupNames.forEach((name, i) => {
            playerStats[name] = { scores: [], jornadas: 0 };
            winCounts[name] = 0;
            tieCounts[name] = 0;
            groupDetails[name] = activeGroups[i].members.join(', ');
        });

        // 1. Agregar datos (usando dataToUse)
        dataToUse.forEach(d => {
            const groupIndex = activeGroups.findIndex(group => group.members.includes(d.Jugador));
            if (groupIndex > -1) {
                const groupName = groupNames[groupIndex];
                playerStats[groupName].scores.push(d.Puntuacion);
            }
        });

        // 2. Calcular estadísticas generales
        groupNames.forEach(name => {
            const scores = playerStats[name].scores;
            playerStats[name] = {
                avg: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0,
                max: scores.length ? Math.max(...scores) : 0,
                jornadas: scores.length,
            };
        });

        // 3. Encontrar enfrentamientos directos (usando dataToUse)
        const matchups = [];
        const allRounds = new Map(); 

        dataToUse.forEach(d => {
            const key = `${d.seasonId}-${d.Jornada}`;
            if (!allRounds.has(key)) {
                allRounds.set(key, { season: d.TEMPORADA, round: d.Jornada, scores: [] });
            }
            allRounds.get(key).scores.push({ teamName: d.Jugador, score: d.Puntuacion });
        });

        allRounds.forEach(round => {
            const groupScoresInRound = [];
            let allGroupsPresent = true;

            for (let i = 0; i < activeGroups.length; i++) {
                const group = activeGroups[i].members; 
                const groupName = groupNames[i];
                const scoresForThisGroup = round.scores.filter(s => group.includes(s.teamName));
                
                if (scoresForThisGroup.length === 0) {
                    allGroupsPresent = false; 
                    break;
                }
                
                const bestScore = Math.max(...scoresForThisGroup.map(s => s.score));
                groupScoresInRound.push({ groupName, score: bestScore });
            }

            if (allGroupsPresent) {
                const maxScore = Math.max(...groupScoresInRound.map(s => s.score));
                const winners = groupScoresInRound.filter(s => s.score === maxScore).map(s => s.groupName);
                
                if (winners.length === 1) {
                    winCounts[winners[0]]++;
                } else if (winners.length > 1) {
                    totalTies++; 
                    winners.forEach(groupName => {
                        tieCounts[groupName]++; 
                    });
                }

                matchups.push({ 
                    season: round.season, 
                    round: round.round, 
                    scores: groupScoresInRound, 
                    winners 
                });
            }
        });

        matchups.sort((a, b) => a.season - b.season || a.round - b.round);

        return { playerStats, matchups, winCounts, tieCounts, totalTies, groupDetails };
    }, [historicalData, activeGroups, groupNames, filterSeasonId]); // <-- Añadido filterSeasonId


    return (
        <div className="space-y-6">
            <button onClick={onBack} className="btn-secondary mb-4 flex items-center gap-2">
                <ChevronLeft size={16} /> Volver al Historial
            </button>
            
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                
                {/* --- NUEVO FILTRO DE TEMPORADA (ARRIBA DERECHA) --- */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-4">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                        Comparativa H2H
                    </h3>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtrar por:</label>
                        <select
                            value={filterSeasonId}
                            onChange={(e) => setFilterSeasonId(e.target.value)}
                            className="input !py-1 !px-2 !w-auto text-sm"
                        >
                            <option value="general">General (Todas)</option>
                            {seasons.sort((a, b) => (a.seasonNumber || 0) - (b.seasonNumber || 0)).map(season => (
                                <option key={season.id} value={season.id}>
                                    {season.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                {/* --- FIN FILTRO --- */}


                <div className="text-center text-gray-800 dark:text-gray-200 mb-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                    {groupNames.map((name, index) => (
                        <React.Fragment key={name}>
                            <span className={`font-bold text-xl ${getPlayerColor(index)} flex items-center gap-1.5`} title={multiH2hStats.groupDetails[name]}>
                                {name} <Info size={14} />
                            </span>
                            {index < groupNames.length - 1 && <Swords size={20} className="text-gray-500" />}
                        </React.Fragment>
                    ))}
                </div>
                
                {/* --- SECCIÓN DE RESULTADOS H2H (con condicional 2 vs 3+) --- */}
                <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-2">Resultados en Enfrentamientos Directos</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">(Jornadas en las que jugaron todos los grupos: {multiH2hStats.matchups.length})</p>
                
                {groupNames.length === 2 ? (
                    // VISTA 3 CAJAS (para 2 jugadores)
                    <div className="grid grid-cols-3 gap-4 text-center mb-6">
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                            <div className={`text-3xl font-bold ${getPlayerColor(0)}`}>
                                {multiH2hStats.winCounts[groupNames[0]]}
                            </div>
                            <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 truncate mt-1">Victorias {groupNames[0]}</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                            <div className="text-3xl font-bold text-gray-600 dark:text-gray-300">
                                {multiH2hStats.totalTies} 
                            </div>
                            <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 truncate mt-1">Empates</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                            <div className={`text-3xl font-bold ${getPlayerColor(1)}`}>
                                {multiH2hStats.winCounts[groupNames[1]]}
                            </div>
                            <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 truncate mt-1">Victorias {groupNames[1]}</div>
                        </div>
                    </div>
                ) : (
                    // VISTA ANTERIOR (para 3+ jugadores)
                    <div className={`grid grid-cols-${groupNames.length} gap-4 text-center mb-6`}>
                        {groupNames.map((name, index) => (
                            <div key={name} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                                 <div className="text-3xl font-bold flex justify-center items-end gap-2">
                                    <span className={getPlayerColor(index)} title="Victorias">
                                        {multiH2hStats.winCounts[name]}
                                    </span>
                                    <span className="text-2xl text-gray-400">/</span>
                                    <span className="text-gray-600 dark:text-gray-300 text-3xl font-bold" title="Empates">
                                        {multiH2hStats.tieCounts[name]}
                                    </span>
                                </div>
                                <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 truncate mt-1">{name}</div>
                            </div>
                        ))}
                    </div>
                )}
                {/* --- FIN SECCIÓN RESULTADOS --- */}


                <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-4">Estadísticas Generales (Agregadas)</h4>
                <div className="overflow-x-auto border dark:border-gray-700 rounded-lg">
                    {/* ... (mismo JSX que antes para tabla de estadísticas) ... */}
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/60">
                            <tr>
                                <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300">Estadística</th>
                                {groupNames.map((name, index) => (
                                    <th key={name} className={`p-3 text-center font-semibold ${getPlayerColor(index)}`}>
                                        {name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-gray-700">
                            <tr className="bg-white dark:bg-gray-800">
                                <td className="p-3 font-medium text-gray-700 dark:text-gray-300">Puntuación Media</td>
                                {groupNames.map(name => (
                                    <td key={name} className="p-3 text-center font-semibold text-gray-800 dark:text-gray-200">{multiH2hStats.playerStats[name].avg}</td>
                                ))}
                            </tr>
                            <tr className="bg-white dark:bg-gray-800">
                                <td className="p-3 font-medium text-gray-700 dark:text-gray-300">Puntuación Máxima</td>
                                {groupNames.map(name => (
                                    <td key={name} className="p-3 text-center font-semibold text-gray-800 dark:text-gray-200">{multiH2hStats.playerStats[name].max || 0}</td>
                                ))}
                            </tr>
                            <tr className="bg-white dark:bg-gray-800">
                                <td className="p-3 font-medium text-gray-700 dark:text-gray-300">Total Jornadas Jugadas</td>
                                {groupNames.map(name => (
                                    <td key={name} className="p-3 text-center font-semibold text-gray-800 dark:text-gray-200">{multiH2hStats.playerStats[name].jornadas}</td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Enfrentamientos Directos ({multiH2hStats.matchups.length})</h3>
                </div>
                 <div className="overflow-x-auto">
                    {/* ... (mismo JSX que antes para tabla de enfrentamientos) ... */}
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/60">
                            <tr>
                                <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300">Temp.</th>
                                <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300">Jorn.</th>
                                {groupNames.map((name, index) => (
                                    <th key={name} className={`p-3 text-center font-semibold ${getPlayerColor(index)}`}>{name}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-gray-700">
                           {multiH2hStats.matchups.map((match, index) => (
                                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td className="p-3 text-center">{match.season}</td>
                                    <td className="p-3 text-center">{match.round}</td>
                                    {match.scores.map(({ groupName, score }) => {
                                        const isWinner = match.winners.includes(groupName);
                                        const isTie = match.winners.length > 1;
                                        const cellColor = isWinner ? (isTie ? 'text-yellow-600 dark:text-yellow-400' : 'text-emerald-600 dark:text-emerald-400') : 'text-gray-600 dark:text-gray-400';
                                        
                                        return (
                                            <td key={groupName} className={`p-3 text-center font-bold ${cellColor}`}>
                                                {score} {isWinner && (isTie ? '🤝' : '👑')}
                                            </td>
                                        )
                                    })}
                                </tr>
                           ))}
                           {multiH2hStats.matchups.length === 0 && (
                               <tr>
                                   <td colSpan={groupNames.length + 2} className="p-8 text-center text-gray-500 dark:text-gray-400">
                                       No se encontraron jornadas en las que compitieran todos los grupos seleccionados {filterSeasonId !== 'general' && 'en esta temporada'}.
                                   </td>
                               </tr>
                           )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};


// --- COMPONENTE PRINCIPAL: HistoricalStatsTab ---
export default function HistoricalStatsTab({ league, seasons }) {
    // ... (mismos estados que antes) ...
    const [historicalData, setHistoricalData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedSeasons, setSelectedSeasons] = useState([]);
    const [selectedPlayers, setSelectedPlayers] = useState([]); 
    const [filterMinScore, setFilterMinScore] = useState('');
    const [filterMaxScore, setFilterMaxScore] = useState('');
    const [showPlayerFilter, setShowPlayerFilter] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'Puntuacion', direction: 'desc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [customItemsPerPage, setCustomItemsPerPage] = useState('');
    const [comparisonGroups, setComparisonGroups] = useState([
        { name: 'Grupo 1', members: [] },
        { name: 'Grupo 2', members: [] },
        { name: 'Grupo 3', members: [] },
        { name: 'Grupo 4', members: [] },
        { name: 'Grupo 5', members: [] }
    ]);
    const [showComparison, setShowComparison] = useState(false);

    const fetchHistoricalData = useCallback(async () => {
        // ... (misma función fetchHistoricalData que antes) ...
        if (!league || !seasons || seasons.length === 0) {
            setLoading(false);
            setError('No hay datos de temporadas disponibles.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const allScores = [];
            for (const season of seasons) {
                const roundsRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'rounds');
                const roundsSnapshot = await getDocs(roundsRef);
                roundsSnapshot.forEach(roundDoc => {
                    const roundData = roundDoc.data();
                    const roundNumber = roundData.roundNumber;
                    const scores = roundData.scores || {};
                    Object.entries(scores).forEach(([userId, score]) => {
                        const member = season.members[userId];
                        if (member && typeof score === 'number') {
                            allScores.push({
                                id: `${season.id}-${roundNumber}-${userId}`,
                                Jugador: member.teamName || 'Desconocido', 
                                username: member.username, 
                                userId: userId, 
                                Jornada: roundNumber,
                                Puntuacion: score,
                                TEMPORADA: season.seasonNumber || seasons.findIndex(s => s.id === season.id) + 1,
                                seasonId: season.id
                            });
                        }
                    });
                });
            }
            setHistoricalData(allScores);
        } catch (err) {
            console.error("Error fetching historical data:", err);
            setError('Error al cargar los datos históricos.');
            toast.error('Error al cargar los datos históricos.');
        } finally {
            setLoading(false);
        }
    }, [league, seasons]);

    useEffect(() => {
        fetchHistoricalData();
    }, [fetchHistoricalData]);

    useEffect(() => {
        setSelectedSeasons(seasons.map(s => s.id));
    }, [seasons]);

    // ... (mismas funciones 'useMemo' y 'handle' que antes) ...
    
    // allTeamNames
    const allTeamNames = useMemo(() => {
        const teamNameSet = new Set();
        historicalData.forEach(item => { if (item.Jugador) teamNameSet.add(item.Jugador); });
        return Array.from(teamNameSet).sort((a, b) => a.localeCompare(b));
    }, [historicalData]);

    // filteredData
    const filteredData = useMemo(() => {
        return historicalData.filter(item => {
            if (selectedSeasons.length > 0 && !selectedSeasons.includes(item.seasonId)) return false;
            if (selectedPlayers.length > 0 && !selectedPlayers.includes(item.Jugador)) return false;
            if (filterMinScore !== '' && item.Puntuacion < Number(filterMinScore)) return false;
            if (filterMaxScore !== '' && item.Puntuacion > Number(filterMaxScore)) return false;
            return true;
        });
    }, [historicalData, selectedSeasons, selectedPlayers, filterMinScore, filterMaxScore]);

    // sortedData
    const sortedData = useMemo(() => {
        let sortableItems = [...filteredData];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];
                let comparison = 0;
                if (valA > valB) comparison = 1;
                else if (valA < valB) comparison = -1;
                else {
                    if (a.TEMPORADA < b.TEMPORADA) comparison = -1;
                    else if (a.TEMPORADA > b.TEMPORADA) comparison = 1;
                    else {
                        if (a.Jornada < b.Jornada) comparison = -1;
                        else if (a.Jornada > b.Jornada) comparison = 1;
                    }
                }
                return sortConfig.direction === 'asc' ? comparison : comparison * -1;
            });
        }
        let rank = 0, lastScore = -Infinity, itemsAtCurrentRank = 1;
        return sortableItems.map((item) => {
            if (sortConfig.key === 'Puntuacion') { 
                if (item.Puntuacion !== lastScore) {
                    rank += itemsAtCurrentRank;
                    lastScore = item.Puntuacion;
                    itemsAtCurrentRank = 1;
                } else itemsAtCurrentRank++;
                return { ...item, Posicion: rank };
            }
            return { ...item, Posicion: null };
        });
    }, [filteredData, sortConfig]);

    // requestSort
    const requestSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
        setSortConfig({ key, direction });
        setCurrentPage(1);
    };

    // handleSeasonSelection
    const handleSeasonSelection = (seasonId) => {
         setSelectedSeasons(prev =>
            prev.includes(seasonId) ? prev.filter(id => id !== seasonId) : [...prev, seasonId]
        );
        setCurrentPage(1);
    };

    // handlePlayerSelection
    const handlePlayerSelection = (teamName) => {
        setSelectedPlayers(prev =>
            prev.includes(teamName)
                ? prev.filter(name => name !== teamName)
                : [...prev, teamName]
        );
        setCurrentPage(1);
    };

    // ... (resto de handlers: AllPlayers, DeselectAllPlayers, AllSeasons, DeselectAllSeasons, ItemsPerPage) ...
    const handleSelectAllPlayers = () => { setSelectedPlayers(allTeamNames); setCurrentPage(1); };
    const handleDeselectAllPlayers = () => { setSelectedPlayers([]); setCurrentPage(1); };
    const handleSelectAllSeasons = () => { setSelectedSeasons(seasons.map(s => s.id)); setCurrentPage(1); };
    const handleDeselectAllSeasons = () => { setSelectedSeasons([]); setCurrentPage(1); };
    const handleItemsPerPageChange = (value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num > 0) setItemsPerPage(num);
        else if (value === '') {}
        setCustomItemsPerPage(value);
    };

    // --- FUNCIONES MANEJO GRUPOS (sin cambios) ---
    const handleAssignToGroup = (playerName, groupIndex) => {
        setComparisonGroups(prevGroups => {
            const newGroups = prevGroups.map((group, i) => ({ ...group, members: group.members.filter(p => p !== playerName) }));
            const targetGroup = newGroups[groupIndex];
            targetGroup.members.push(playerName);
            if (targetGroup.members.length === 1) targetGroup.name = playerName;
            newGroups.forEach((group, i) => { if (group.members.length === 0) group.name = `Grupo ${i + 1}`; });
            return newGroups;
        });
    };

    const handleRemoveFromGroup = (playerName) => {
         setComparisonGroups(prevGroups => {
            return prevGroups.map((group, i) => {
                const newMembers = group.members.filter(p => p !== playerName);
                let newName = group.name;
                if (newMembers.length === 0) newName = `Grupo ${i + 1}`;
                else if (group.name === playerName) newName = newMembers[0];
                return { name: newName, members: newMembers };
            });
        });
    };
    
    const handleGroupNameChange = (newName, groupIndex) => {
        setComparisonGroups(prevGroups => {
            const newGroups = [...prevGroups];
            newGroups[groupIndex].name = newName;
            return newGroups;
        });
    };
    
    const unassignedPlayers = useMemo(() => {
        const allAssigned = new Set(comparisonGroups.flatMap(g => g.members));
        return selectedPlayers.filter(p => !allAssigned.has(p));
    }, [selectedPlayers, comparisonGroups]);
    
    const activeGroupCount = useMemo(() => comparisonGroups.filter(g => g.members.length > 0).length, [comparisonGroups]);


    // Paginación
    const totalPages = Math.ceil(sortedData.length / itemsPerPage);
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = sortedData.slice(indexOfFirstItem, indexOfLastItem);

    if (loading) {
        return <LoadingSpinner text="Cargando historial de jornadas..." />;
    }
    if (error) {
        return <div className="text-red-500 text-center p-4">{error}</div>;
    }

    // --- RENDERIZADO (MODIFICADO: Pasa 'seasons' a GroupComparisonView) ---
    if (showComparison) {
        return (
            <GroupComparisonView
                historicalData={historicalData} 
                comparisonGroups={comparisonGroups}
                onBack={() => setShowComparison(false)}
                seasons={seasons} // <-- Pasamos las temporadas
            />
        );
    }

    // --- RENDERIZADO PRINCIPAL (sin cambios) ---
    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                    <Filter size={18} /> Filtros del Historial
                </h3>
                {/* Filtro de Temporadas */}
                <div className="mb-4">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Temporadas:</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                        {seasons.map(season => (
                            <button key={season.id} onClick={() => handleSeasonSelection(season.id)}
                                className={`px-3 py-1 text-xs font-semibold rounded-full border ${selectedSeasons.includes(season.id) ? 'bg-emerald-100 dark:bg-emerald-900/50 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                                {season.name}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleSelectAllSeasons} className="text-xs text-blue-600 hover:underline">Seleccionar Todas</button>
                        <button onClick={handleDeselectAllSeasons} className="text-xs text-red-600 hover:underline">Deseleccionar Todas</button>
                    </div>
                </div>

                 {/* Filtro Jugadores (por TeamName) */}
                <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                         <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Jugadores ({selectedPlayers.length} / {allTeamNames.length})</label>
                        <button onClick={() => setShowPlayerFilter(!showPlayerFilter)} className="text-xs btn-tertiary !py-1">{showPlayerFilter ? 'Ocultar' : 'Mostrar'} lista</button>
                    </div>
                    {showPlayerFilter && (
                         <div className="border dark:border-gray-600 rounded-md p-2 max-h-48 overflow-y-auto mb-2">
                             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                {allTeamNames.map(teamName => (
                                    <label key={teamName} className="flex items-center gap-2 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                                        <input type="checkbox" checked={selectedPlayers.includes(teamName)} onChange={() => handlePlayerSelection(teamName)} className="form-checkbox h-4 w-4 text-deep-blue"/>
                                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{teamName}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                     <div className="flex gap-2">
                        <button onClick={handleSelectAllPlayers} className="text-xs text-blue-600 hover:underline">Seleccionar Todos</button>
                        <button onClick={handleDeselectAllPlayers} className="text-xs text-red-600 hover:underline">Deseleccionar Todos</button>
                    </div>
                </div>

                {/* Filtros Puntuación */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Puntuación Mínima:</label>
                        <input type="number" value={filterMinScore} onChange={(e) => { setFilterMinScore(e.target.value); setCurrentPage(1); }} placeholder="Ej: 50" className="input text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Puntuación Máxima:</label>
                        <input type="number" value={filterMaxScore} onChange={(e) => { setFilterMaxScore(e.target.value); setCurrentPage(1); }} placeholder="Ej: 100" className="input text-sm" />
                    </div>
                </div>
            </div>
            
            {/* --- SECCIÓN CREADOR DE GRUPOS --- */}
            {selectedPlayers.length > 0 && (
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6 space-y-4">
                     <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Crear Grupos de Comparación</h3>
                     <p className="text-sm text-gray-500 dark:text-gray-400">
                         Agrupa jugadores (incluso "perfiles fantasma" con distintos nombres) para compararlos.
                     </p>
                     
                     {unassignedPlayers.length > 0 && (
                        <div className="p-3 border dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-800">
                             <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Jugadores sin grupo:</h4>
                             <div className="flex flex-wrap gap-2">
                                {unassignedPlayers.map(name => (
                                    <div key={name} className="flex items-center gap-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded p-2">
                                        <span className="text-sm font-medium truncate">{name}</span>
                                        <span className="text-gray-400">|</span>
                                        {comparisonGroups.map((_, index) => (
                                            <button key={index} onClick={() => handleAssignToGroup(name, index)}
                                                className="px-2 py-0.5 text-xs font-bold rounded bg-blue-100 text-blue-700 hover:bg-blue-200" title={`Añadir a Grupo ${index + 1}`}>
                                                G{index + 1}
                                            </button>
                                        ))}
                                    </div>
                                ))}
                             </div>
                        </div>
                     )}

                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {comparisonGroups.map((group, index) => (
                            <div key={index} className="border-2 border-dashed dark:border-gray-600 rounded-lg p-3 min-h-[100px] bg-white dark:bg-gray-800 flex flex-col">
                                <div className="relative flex items-center mb-2">
                                    <input
                                        type="text"
                                        value={group.name}
                                        onChange={(e) => handleGroupNameChange(e.target.value, index)}
                                        className="input !text-base !font-bold !pl-1 !pr-6 !py-1 w-full dark:bg-gray-700"
                                        placeholder={`Grupo ${index + 1}`}
                                    />
                                    <Pencil size={12} className="absolute right-2 text-gray-400" />
                                </div>
                                <div className="space-y-2 flex-grow">
                                    {group.members.length === 0 && <p className="text-xs text-gray-400">Añade jugadores aquí...</p>}
                                    {group.members.map(name => (
                                        <div key={name} className="flex justify-between items-center bg-gray-100 dark:bg-gray-700 p-1.5 rounded">
                                            <span className="text-sm truncate">{name}</span>
                                            <button onClick={() => handleRemoveFromGroup(name)} title="Quitar del grupo">
                                                <X size={14} className="text-red-500" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    {activeGroupCount >= 2 && (
                        <div className="text-center pt-4">
                            <button onClick={() => setShowComparison(true)} className="btn-primary flex items-center gap-2 mx-auto">
                                <Swords size={18} /> Comparar {activeGroupCount} Grupos
                            </button>
                        </div>
                    )}
                </div>
            )}


            {/* Tabla Principal de Datos Históricos */}
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700">
                <div className="p-4 sm:p-6 flex flex-wrap justify-between items-center gap-4 border-b dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                        Historial de Puntuaciones ({sortedData.length} registros)
                    </h3>
                    <div className="flex items-center gap-2 text-sm">
                        <span>Mostrar:</span>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); setCustomItemsPerPage(''); }}
                            className="input !py-1 !px-2 !w-auto text-sm"
                        >
                            <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option><option value={itemsPerPage}>Personalizado</option>
                        </select>
                         <input
                            type="number"
                            value={customItemsPerPage}
                            onChange={(e) => handleItemsPerPageChange(e.target.value)}
                            placeholder="Nº" min="1" className="input !py-1 !px-2 !w-16 text-sm"
                        />
                        <span>por página</span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/60">
                            <tr>
                                <SortableHeader label="Posición" columnKey="Posicion" sortConfig={sortConfig} requestSort={requestSort} />
                                <SortableHeader label="Jugador (Equipo)" columnKey="Jugador" sortConfig={sortConfig} requestSort={requestSort} />
                                <SortableHeader label="Jornada" columnKey="Jornada" sortConfig={sortConfig} requestSort={requestSort} />
                                <SortableHeader label="Puntuación" columnKey="Puntuacion" sortConfig={sortConfig} requestSort={requestSort} />
                                <SortableHeader label="Temporada" columnKey="TEMPORADA" sortConfig={sortConfig} requestSort={requestSort} />
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-gray-700">
                            {currentItems.length > 0 ? (
                                currentItems.map((item, index) => (
                                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                        <td className="p-3 text-center w-20">{item.Posicion ? `${item.Posicion}º` : '-'}</td>
                                        <td className="p-3 font-semibold text-gray-800 dark:text-gray-200">
                                            {item.username ? (
                                                <Link to={`/profile/${item.username}`} className="hover:text-deep-blue dark:hover:text-blue-400 hover:underline">
                                                    {item.Jugador}
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-normal block">(@{item.username})</span>
                                                </Link>
                                            ) : (
                                                <span>
                                                    {item.Jugador}
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-normal block">(Sin vincular)</span>
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">{item.Jornada}</td>
                                        <td className="p-3 text-center font-bold text-emerald-600 dark:text-emerald-400">{item.Puntuacion}</td>
                                        <td className="p-3 text-center">{item.TEMPORADA}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="p-8 text-center text-gray-500 dark:text-gray-400">
                                        No hay datos que coincidan con los filtros seleccionados.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                 {totalPages > 1 && (
                    <div className="p-4 flex justify-center items-center gap-4 text-sm border-t dark:border-gray-700">
                        <button onClick={() => setCurrentPage(c => Math.max(1, c - 1))} disabled={currentPage === 1} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
                            <ChevronLeft size={20} />
                        </button>
                        <span>Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong></span>
                        <button onClick={() => setCurrentPage(c => Math.min(totalPages, c + 1))} disabled={currentPage === totalPages} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}