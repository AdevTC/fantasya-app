import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, collection, getDocs, orderBy, query } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { app, db } from '../config/firebase';
import toast from 'react-hot-toast';
import { RefreshCw, Clock, CheckCircle, XCircle, Users, Database, AlertCircle, Filter, X, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

const POSITION_MAP_DISPLAY = {
    'POR': 'Portero',
    'DEF': 'Defensa',
    'MED': 'Centrocampista',
    'DEL': 'Delantero'
};

export default function PlayersSyncTab() {
    const [syncStatus, setSyncStatus] = useState({
        status: 'loading',
        lastSync: null,
        playersCount: 0,
        lastError: null
    });
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(null);
    const [syncedPlayers, setSyncedPlayers] = useState([]);
    const [teamFilter, setTeamFilter] = useState('');
    const [positionFilter, setPositionFilter] = useState('');
    const [nationalityFilter, setNationalityFilter] = useState('');
    const [searchName, setSearchName] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    // Fetch sync status on mount
    useEffect(() => {
        fetchSyncStatus();
        fetchSyncedPlayers();
    }, []);

    // Get unique teams and positions for filters
    const uniqueTeams = useMemo(() => {
        const teams = [...new Set(syncedPlayers.map(p => p.team).filter(Boolean))];
        return teams.sort();
    }, [syncedPlayers]);

    const uniquePositions = useMemo(() => {
        const positions = [...new Set(syncedPlayers.map(p => p.position).filter(Boolean))];
        return positions.sort();
    }, [syncedPlayers]);

    const uniqueNationalities = useMemo(() => {
        const nationalities = [...new Set(syncedPlayers.map(p => p.nationality).filter(Boolean))];
        return nationalities.sort();
    }, [syncedPlayers]);

    // Filtered & Sorted players
    const filteredPlayers = useMemo(() => {
        setCurrentPage(1); // Reset to first page on filter change

        let result = syncedPlayers.filter(player => {
            const matchesTeam = !teamFilter || player.team === teamFilter;
            const matchesPosition = !positionFilter || player.position === positionFilter;
            const matchesNationality = !nationalityFilter || player.nationality === nationalityFilter;
            const matchesSearch = !searchName ||
                player.name?.toLowerCase().includes(searchName.toLowerCase());
            return matchesTeam && matchesPosition && matchesNationality && matchesSearch;
        });

        // Apply sorting
        if (sortConfig.key) {
            result.sort((a, b) => {
                let aValue = a[sortConfig.key] || '';
                let bValue = b[sortConfig.key] || '';

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [syncedPlayers, teamFilter, positionFilter, nationalityFilter, searchName, sortConfig]);

    // Pagination
    const totalPages = Math.ceil(filteredPlayers.length / ITEMS_PER_PAGE);
    const paginatedPlayers = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredPlayers.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredPlayers, currentPage]);

    // Handle sort
    const handleSort = (key) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Clear filters
    const clearFilters = () => {
        setTeamFilter('');
        setPositionFilter('');
        setNationalityFilter('');
        setSearchName('');
        setSortConfig({ key: 'name', direction: 'asc' });
        setCurrentPage(1);
    };

    const hasActiveFilters = teamFilter || positionFilter || nationalityFilter || searchName;

    // Helper to render sort icon
    const SortIcon = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-4 h-4 text-gray-400 opacity-50" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            : <ArrowDown className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    };

    const fetchSyncStatus = async () => {
        try {
            const auth = getAuth(app);
            const token = await auth.currentUser?.getIdToken();

            // Try the status Cloud Function first
            if (token) {
                try {
                    const statusResponse = await fetch('https://getlaligasyncstatus-6co4rpvhqa-uc.a.run.app', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (statusResponse.ok) {
                        const statusData = await statusResponse.json();
                        setSyncStatus(statusData);
                        return;
                    }
                } catch (funcError) {
                    console.log("Status Cloud Function not available, using Firestore");
                }
            }

            // Fallback to Firestore directly
            const statusDoc = await getDoc(doc(db, "config", "laLigaSync"));

            if (statusDoc.exists()) {
                const data = statusDoc.data();
                setSyncStatus({
                    status: data.status || 'unknown',
                    lastSync: data.lastSync || data.startedAt || null,
                    playersCount: data.playersCount || 0,
                    lastError: data.lastError || null
                });
            } else {
                setSyncStatus({
                    status: 'never_synced',
                    lastSync: null,
                    playersCount: 0,
                    lastError: null
                });
            }
        } catch (error) {
            console.error("Error fetching sync status:", error);
            setSyncStatus({
                status: 'error',
                lastSync: null,
                playersCount: 0,
                lastError: error.message
            });
        }
    };

    const fetchSyncedPlayers = async () => {
        try {
            const playersRef = collection(db, "laLigaPlayers");
            const q = query(playersRef, orderBy("name"));
            const querySnapshot = await getDocs(q);
            const players = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setSyncedPlayers(players);
        } catch (error) {
            console.error("Error fetching synced players:", error);
        }
    };

    const handleSync = async () => {
        if (isSyncing) return;

        setIsSyncing(true);
        setSyncProgress({ message: 'Iniciando sincronización...', stage: 'init' });

        try {
            const auth = getAuth(app);
            const token = await auth.currentUser?.getIdToken();

            if (!token) {
                throw new Error('No estás autenticado');
            }

            const response = await fetch('https://synclaligaplayers-6co4rpvhqa-uc.a.run.app', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Error ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                toast.success(result.message);
                setSyncProgress({ message: result.message, stage: 'complete' });
                await fetchSyncStatus();
                await fetchSyncedPlayers();
            } else {
                throw new Error('La sincronización falló');
            }
        } catch (error) {
            console.error("Error syncing players:", error);
            let errorMsg = error.message;

            // Check for specific IAM/CORS errors
            if (error.code === 'permission-denied' || error.code === 'unauthenticated' || errorMsg.includes('Unauthorized')) {
                errorMsg = "No tienes permiso para sincronizar jugadores. Contacta al administrador.";
            } else if (error.message.includes('CORS') || error.message.includes('fetch')) {
                errorMsg = "Error de configuración CORS. Verifica que las funciones tengan IAM policy configurada.";
            }

            toast.error(`Error: ${errorMsg}`);
            setSyncProgress({ message: `Error: ${errorMsg}`, stage: 'error' });
            await fetchSyncStatus();
        } finally {
            setIsSyncing(false);
            setTimeout(() => setSyncProgress(null), 5000);
        }
    };

    const formatLastSync = (timestamp) => {
        if (!timestamp) return 'Nunca';
        try {
            let date;
            if (timestamp.toDate) {
                date = timestamp.toDate();
            } else if (typeof timestamp === 'string') {
                date = new Date(timestamp);
            } else if (timestamp.seconds) {
                // Firestore Timestamp format
                date = new Date(timestamp.seconds * 1000);
            } else {
                date = new Date(timestamp);
            }

            if (isNaN(date.getTime())) {
                return 'Fecha inválida';
            }

            return new Intl.DateTimeFormat('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'Fecha inválida';
        }
    };

    const getStatusBadge = () => {
        switch (syncStatus.status) {
            case 'in_progress':
                return (
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Sincronizando...
                    </span>
                );
            case 'completed':
                return (
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                        <CheckCircle className="w-4 h-4" />
                        Sincronizado
                    </span>
                );
            case 'error':
                return (
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                        <XCircle className="w-4 h-4" />
                        Error
                    </span>
                );
            case 'never_synced':
                return (
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        <AlertCircle className="w-4 h-4" />
                        No sincronizado
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
                        Desconocido
                    </span>
                );
        }
    };

    const statsCards = [
        {
            icon: Users,
            label: 'Total Jugadores',
            value: syncedPlayers.length,
            color: 'emerald'
        },
        {
            icon: Database,
            label: 'Última Sincronización',
            value: formatLastSync(syncStatus.lastSync),
            color: 'blue'
        }
    ];

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                            Sincronización de Jugadores La Liga
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Sincroniza la base de datos de jugadores desde la API oficial de football-data.org
                        </p>
                    </div>
                    {getStatusBadge()}
                </div>

                {/* Sync Button */}
                <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora'}
                </button>

                {/* Progress Message */}
                {syncProgress && (
                    <div className={`mt-4 p-4 rounded-lg ${syncProgress.stage === 'error'
                        ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                        : syncProgress.stage === 'complete'
                            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
                            : 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                        }`}>
                        <p className="text-sm font-medium">{syncProgress.message}</p>
                    </div>
                )}

                {/* Error Details */}
                {syncStatus.lastError && syncStatus.status === 'error' && (
                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">
                            Último error:
                        </p>
                        <p className="text-sm text-red-700 dark:text-red-400">{syncStatus.lastError}</p>
                    </div>
                )}

                {/* IAM Policy Warning Banner */}
                {syncStatus.status === 'error' && syncStatus.lastError?.includes('permission-denied') && (
                    <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                        <div className="flex gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-red-800 dark:text-red-300">
                                <p className="font-semibold mb-1">Error de Permisos (IAM)</p>
                                <p className="mb-2">Las funciones de Cloud necesitan permisos adicionales. Para arreglar esto:</p>
                                <ol className="list-decimal list-inside space-y-1">
                                    <li>Ve a <a href="https://console.cloud.google.com/functions/list" target="_blank" rel="noopener noreferrer" className="underline font-medium">Google Cloud Console</a></li>
                                    <li>Selecciona el proyecto <strong>tictaktools</strong></li>
                                    <li>Abre las funciones <strong>syncLaLigaPlayers</strong> y <strong>getLaLigaSyncStatus</strong></li>
                                    <li>Ve a la pestaña <strong>Permissions</strong></li>
                                    <li>Añade <code>allAuthenticatedUsers</code> con el rol <strong>Cloud Functions Invoker</strong></li>
                                </ol>
                            </div>
                        </div>
                    </div>
                )}

                {/* Info Banner */}
                <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-800 dark:text-amber-300">
                            <p className="font-semibold mb-1">Información importante</p>
                            <ul className="list-disc list-inside space-y-1">
                                <li>La API de football-data.org tiene un límite de 10 solicitudes por minuto</li>
                                <li>La sincronización puede tardar varios minutos (aprox. 13-15 minutos para 20 equipos)</li>
                                <li>Los jugadores se almacenan en la colección <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">laLigaPlayers</code></li>
                                <li>El historial de equipos y posiciones se preserva automáticamente</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid sm:grid-cols-2 gap-4">
                {statsCards.map((stat, index) => (
                    <div key={index} className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-lg bg-${stat.color}-100 dark:bg-${stat.color}-900/50`}>
                                <stat.icon className={`w-6 h-6 text-${stat.color}-600 dark:text-${stat.color}-400`} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                                <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{stat.value}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Synced Players Table */}
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700">
                <div className="p-6 border-b dark:border-gray-700">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            <Database className="w-5 h-5" />
                            Jugadores Sincronizados ({filteredPlayers.length}{hasActiveFilters ? ` de ${syncedPlayers.length}` : ''})
                        </h3>

                        {/* Filters */}
                        <div className="flex flex-col gap-4 w-full sm:w-auto">
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <Filter className="w-4 h-4" />
                                    <span>Filtros:</span>
                                </div>

                                {/* Search by name */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre..."
                                        value={searchName}
                                        onChange={(e) => setSearchName(e.target.value)}
                                        className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent w-full sm:w-48"
                                    />
                                </div>

                                {/* Team Filter */}
                                <select
                                    value={teamFilter}
                                    onChange={(e) => setTeamFilter(e.target.value)}
                                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                >
                                    <option value="">Todos los equipos</option>
                                    {uniqueTeams.map(team => (
                                        <option key={team} value={team}>{team}</option>
                                    ))}
                                </select>

                                {/* Position Filter */}
                                <select
                                    value={positionFilter}
                                    onChange={(e) => setPositionFilter(e.target.value)}
                                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                >
                                    <option value="">Todas las posiciones</option>
                                    {uniquePositions.map(position => (
                                        <option key={position} value={position}>
                                            {POSITION_MAP_DISPLAY[position] || position}
                                        </option>
                                    ))}
                                </select>

                                {/* Nationality Filter */}
                                <select
                                    value={nationalityFilter}
                                    onChange={(e) => setNationalityFilter(e.target.value)}
                                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                >
                                    <option value="">Todas las nacionalidades</option>
                                    {uniqueNationalities.map(nat => (
                                        <option key={nat} value={nat}>{nat}</option>
                                    ))}
                                </select>

                                {/* Clear Filters Button */}
                                {hasActiveFilters && (
                                    <button
                                        onClick={clearFilters}
                                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                        Limpiar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th
                                    className="p-4 text-left font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    onClick={() => handleSort('name')}
                                >
                                    <div className="flex items-center gap-2">
                                        Nombre <SortIcon columnKey="name" />
                                    </div>
                                </th>
                                <th
                                    className="p-4 text-left font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    onClick={() => handleSort('position')}
                                >
                                    <div className="flex items-center gap-2">
                                        Posición <SortIcon columnKey="position" />
                                    </div>
                                </th>
                                <th
                                    className="p-4 text-left font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    onClick={() => handleSort('team')}
                                >
                                    <div className="flex items-center gap-2">
                                        Equipo <SortIcon columnKey="team" />
                                    </div>
                                </th>
                                <th
                                    className="p-4 text-left font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    onClick={() => handleSort('nationality')}
                                >
                                    <div className="flex items-center gap-2">
                                        Nacionalidad <SortIcon columnKey="nationality" />
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {syncedPlayers.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="p-8 text-center text-gray-500 dark:text-gray-400">
                                        No hay jugadores sincronizados. Haz clic en "Sincronizar Ahora" para comenzar.
                                    </td>
                                </tr>
                            ) : filteredPlayers.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="p-8 text-center text-gray-500 dark:text-gray-400">
                                        No hay jugadores que coincidan con los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                paginatedPlayers.map(player => (
                                    <tr key={player.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="p-4 font-medium text-gray-800 dark:text-gray-200">
                                            {player.name}
                                        </td>
                                        <td className="p-4 text-gray-600 dark:text-gray-400">
                                            {POSITION_MAP_DISPLAY[player.position] || player.position}
                                        </td>
                                        <td className="p-4 text-gray-600 dark:text-gray-400">
                                            {player.team}
                                        </td>
                                        <td className="p-4 text-gray-600 dark:text-gray-400">
                                            {player.nationality || '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {filteredPlayers.length > 0 && (
                    <div className="flex items-center justify-between p-4 border-t dark:border-gray-700">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, filteredPlayers.length)} de {filteredPlayers.length} jugadores
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Página {currentPage} de {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
