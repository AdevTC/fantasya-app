import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, auth } from '../config/firebase';
import { doc, setDoc, getDoc, collection, query, onSnapshot, serverTimestamp, updateDoc, orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Send, Clock, Info, Crown, CalendarCheck, GripVertical, UserPlus, Edit } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { calculatePorraWinner } from '../utils/porraUtils';

// --- IMPORTACIONES DE DND-KIT (MODIFICADAS) ---
import {
    DndContext,
    closestCenter,
    PointerSensor, // Para ratón y dispositivos con puntero
    TouchSensor,   // Para dispositivos táctiles
    MouseSensor,   // Añadido por si acaso, aunque Pointer debería bastar
    useSensor,
    useSensors,
    DragOverlay,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createPortal } from 'react-dom';

const SortableItem = ({ id, member, index }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 100 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg shadow-sm">
            <div className="flex items-center gap-3 overflow-hidden">
                <span className="font-bold text-lg w-6 text-center text-emerald-600 dark:text-emerald-400">{index + 1}º</span>
                <img
                    src={member.photoURL || `https://ui-avatars.com/api/?name=${member.teamName || '?'}&background=random`}
                    alt={member.teamName}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
                <span className="font-semibold truncate" title={member.teamName}>{member.teamName}</span>
                {member.isPlaceholder && (
                    <span className="text-xs text-red-500 dark:text-red-400 flex-shrink-0">(Fantasma)</span>
                )}
            </div>
            {/* El botón (handle) para iniciar el arrastre */}
            <button {...listeners} className="p-1 text-gray-500 dark:text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"> {/* Añadido touch-none */}
                <GripVertical size={20} />
            </button>
        </div>
    );
};

export default function PorraTab({ league, season, roundsData, userRole }) {
    const userId = auth.currentUser?.uid;
    const [selectedRoundNumber, setSelectedRoundNumber] = useState(null);
    const [porraData, setPorraData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [predictionLoading, setPredictionLoading] = useState(false);
    const [roundResults, setRoundResults] = useState(null);
    const [porraWinner, setPorraWinner] = useState(null);
    const [deadline, setDeadline] = useState('');
    const [rankedItems, setRankedItems] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [userToSubmitFor, setUserToSubmitFor] = useState(userId);
    const [hasExistingPrediction, setHasExistingPrediction] = useState(false);
    const [isDeadlinePassedLocally, setIsDeadlinePassedLocally] = useState(false);
    const [isEditingDeadline, setIsEditingDeadline] = useState(false);
    const predictionListenerUnsubscribeRef = useRef(null);
    const deadlineTimerRef = useRef(null);

    const allRoundsForSelector = useMemo(() => {
        const total = season.totalRounds || 0;
        if (total === 0) return roundsData.map(r => ({ roundNumber: r.roundNumber, name: r.name || '' }));
        const baseRounds = Array.from({ length: total }, (_, i) => ({ roundNumber: i + 1, name: '' }));
        const existingRoundsMap = new Map(roundsData.map(r => [r.roundNumber, r]));
        return baseRounds.map(baseRound => ({
            roundNumber: baseRound.roundNumber,
            name: existingRoundsMap.get(baseRound.roundNumber)?.name || ''
        }));
    }, [season.totalRounds, roundsData]);

    // --- CONFIGURACIÓN DE SENSORES (MODIFICADA) ---
    const sensors = useSensors(
        useSensor(PointerSensor), // Usa PointerSensor para interacciones de ratón/puntero
        useSensor(TouchSensor, { // Configura TouchSensor específicamente para táctil
          activationConstraint: {
            // Requiere mantener pulsado 250ms O mover 5px antes de iniciar el drag
            delay: 250,
            tolerance: 5,
          },
        })
        // useSensor(MouseSensor) // Podrías añadirlo si PointerSensor da problemas, pero usualmente no es necesario
      );

    useEffect(() => {
        if (allRoundsForSelector.length > 0) {
            const defaultRound = season.currentRound || allRoundsForSelector[0].roundNumber;
            setSelectedRoundNumber(defaultRound);
        } else {
            setSelectedRoundNumber(null);
        }
    }, [allRoundsForSelector, season.currentRound]);

    const porraRef = useMemo(() => {
        if (!selectedRoundNumber) return null;
        return doc(db, 'leagues', league.id, 'seasons', season.id, 'porra', `round_${selectedRoundNumber}`);
    }, [league.id, season.id, selectedRoundNumber]);

    const predictionRef = useMemo(() => {
        if (!porraRef || !userToSubmitFor) return null;
        return doc(porraRef, 'predictions', userToSubmitFor);
    }, [porraRef, userToSubmitFor]);

     const allPredictionsRef = useMemo(() => {
        if (!porraRef) return null;
        return collection(porraRef, 'predictions');
    }, [porraRef]);

    useEffect(() => {
        if (userId) setUserToSubmitFor(userId);
        setIsEditingDeadline(false);

        if (!selectedRoundNumber || !porraRef || !userId) {
            setLoading(false); setRankedItems([]); setIsDeadlinePassedLocally(false); setPorraData(null); setDeadline(''); return;
        }

        setLoading(true); setPorraData(null); setDeadline(''); setPorraWinner(null); setRankedItems([]); setHasExistingPrediction(false); setIsDeadlinePassedLocally(false);

        const unsubPorra = onSnapshot(porraRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data(); setPorraData(data);
                if (!isEditingDeadline) { setDeadline(data.deadline?.toDate().toISOString().slice(0, 16) || ''); }
                setIsDeadlinePassedLocally(data.deadline ? new Date() > data.deadline.toDate() : false);
            } else { setPorraData({ isOpen: false, deadline: null }); setDeadline(''); setIsDeadlinePassedLocally(false); }
        }, (error) => { console.error("Error al cargar estado de porra:", error); setLoading(false); setPorraData({ isOpen: false, deadline: null }); });

        const currentRoundData = roundsData.find(r => r.roundNumber === selectedRoundNumber); setRoundResults(currentRoundData?.scores || null);

        return () => {
            unsubPorra(); if (deadlineTimerRef.current) { clearTimeout(deadlineTimerRef.current); deadlineTimerRef.current = null; }
            if (predictionListenerUnsubscribeRef.current) { predictionListenerUnsubscribeRef.current(); predictionListenerUnsubscribeRef.current = null; }
        };
    }, [selectedRoundNumber, roundsData, userId]); // Quitar porraRef y otras dependencias implícitas

     useEffect(() => {
        if (predictionListenerUnsubscribeRef.current) { predictionListenerUnsubscribeRef.current(); predictionListenerUnsubscribeRef.current = null; }
        
        setRankedItems([]); setHasExistingPrediction(false); // Resetear explícitamente

        if (!predictionRef) {
            const initialOrder = Object.keys(season.members).sort((a,b)=>season.members[a].teamName.localeCompare(season.members[b].teamName));
            setRankedItems(initialOrder); setPredictionLoading(false); if(porraData !== null) setLoading(false); return;
        }

        setPredictionLoading(true);

        predictionListenerUnsubscribeRef.current = onSnapshot(predictionRef, (docSnap) => {
            const dataExists = docSnap.exists(); setHasExistingPrediction(dataExists);
            const savedRanking = dataExists ? docSnap.data()?.ranking || [] : []; const allMemberUIDs = Object.keys(season.members);
            let currentRanking = savedRanking.filter(uid => allMemberUIDs.includes(uid));
            allMemberUIDs.forEach(uid => { if (!currentRanking.includes(uid)) currentRanking.push(uid); });
            if (!dataExists && currentRanking.length > 0) { currentRanking.sort((uidA, uidB) => season.members[uidA].teamName.localeCompare(season.members[uidB].teamName)); }
            setRankedItems(currentRanking); setPredictionLoading(false); setLoading(false);
        }, (error) => {
             console.error(`Error al cargar predicción para ${userToSubmitFor}:`, error); const initialOrder = Object.keys(season.members).sort((a,b)=>season.members[a].teamName.localeCompare(season.members[b].teamName));
             setRankedItems(initialOrder); setHasExistingPrediction(false); setPredictionLoading(false); setLoading(false);
        });

        return () => { if (predictionListenerUnsubscribeRef.current) { predictionListenerUnsubscribeRef.current(); predictionListenerUnsubscribeRef.current = null; } };
    }, [predictionRef, season.members]);

    useEffect(() => {
        let unsub = () => {};
        if (porraRef && roundResults && allPredictionsRef) {
            unsub = onSnapshot(query(allPredictionsRef), (snap) => {
                const allPredictions = {}; snap.forEach(doc => { allPredictions[doc.id] = doc.data(); });
                if (Object.keys(allPredictions).length > 0 && roundResults && Object.keys(roundResults).length > 0) {
                     const winner = calculatePorraWinner(allPredictions, roundResults, season.members); setPorraWinner(winner);
                } else { setPorraWinner(null); }
            }, (error) => { console.error("Error al calcular el ganador: ", error); setPorraWinner(null); });
        } else { setPorraWinner(null); }
        return () => unsub();
    }, [roundResults, porraRef, allPredictionsRef, season.members]);

    useEffect(() => {
        if (deadlineTimerRef.current) { clearTimeout(deadlineTimerRef.current); deadlineTimerRef.current = null; }
        if (porraData?.deadline) {
            const deadlineDate = porraData.deadline.toDate(); const now = new Date(); const timeUntilDeadline = deadlineDate.getTime() - now.getTime();
            if (timeUntilDeadline <= 0) { setIsDeadlinePassedLocally(true); } else {
                setIsDeadlinePassedLocally(false); deadlineTimerRef.current = setTimeout(() => { setIsDeadlinePassedLocally(true); }, timeUntilDeadline);
            }
        } else { setIsDeadlinePassedLocally(false); }
        return () => { if (deadlineTimerRef.current) { clearTimeout(deadlineTimerRef.current); deadlineTimerRef.current = null; } };
    }, [porraData?.deadline]);

    function handleDragStart(event) { setActiveId(event.active.id); }

    function handleDragEnd(event) {
        const { active, over } = event; setActiveId(null);
        if (over && active.id !== over.id) {
            setRankedItems((items) => {
                const oldIndex = items.indexOf(active.id); const newIndex = items.indexOf(over.id);
                if (oldIndex !== -1 && newIndex !== -1) return arrayMove(items, oldIndex, newIndex);
                return items;
            });
        }
    }
    
    const member = activeId ? season.members[activeId] : null;

    const handleAdminSelectUser = (e) => {
        const selectedUserId = e.target.value; if (selectedUserId !== userToSubmitFor) { setUserToSubmitFor(selectedUserId); setPredictionLoading(true); }
    };

    const handleOpenPorra = async () => {
        if (!deadline) { toast.error("Debes establecer una fecha y hora límite."); return; } if (!porraRef) { toast.error("Error de referencia de jornada."); return; }
        const deadlineDate = new Date(deadline); if (isNaN(deadlineDate.getTime())) { toast.error("Fecha límite inválida."); return; }
        try { setLoading(true); await setDoc(porraRef, { isOpen: true, deadline: deadlineDate, openedAt: serverTimestamp() }, { merge: true }); toast.success(`¡Porra J${selectedRoundNumber} abierta!`); setIsEditingDeadline(false); }
        catch (error) { console.error("Error al abrir la porra: ", error); toast.error('No se pudo abrir la porra.'); } finally { setLoading(false); }
    };

    const handleClosePorra = async () => {
        if (!porraRef) { toast.error("Error de referencia de jornada."); return; }
        try { setLoading(true); await updateDoc(porraRef, { isOpen: false }); toast.success(`Porra J${selectedRoundNumber} cerrada.`); setIsEditingDeadline(false); }
        catch (error) { console.error("Error al cerrar la porra: ", error); toast.error('No se pudo cerrar la porra.'); } finally { setLoading(false); }
    };

    const handleUpdateDeadline = async () => {
        if (!deadline) { toast.error("Debes establecer una fecha y hora límite."); return; } if (!porraRef) { toast.error("Error de referencia de jornada."); return; }
        const newDeadlineDate = new Date(deadline); if (isNaN(newDeadlineDate.getTime())) { toast.error("Fecha límite inválida."); return; }
        try { setLoading(true); await updateDoc(porraRef, { deadline: newDeadlineDate }); toast.success(`¡Plazo de la Porra J${selectedRoundNumber} actualizado!`); setIsEditingDeadline(false); }
        catch (error) { console.error("Error al actualizar el plazo:", error); toast.error(`No se pudo actualizar el plazo. Error: ${error.message}`); } finally { setLoading(false); }
    };

    const handleSubmitPrediction = async () => {
        if (!porraData?.isOpen || isDeadlinePassedLocally) { toast.error(isDeadlinePassedLocally ? 'El plazo ha finalizado.' : 'La porra no está abierta.'); return; }
        if (!predictionRef) { toast.error("Error de referencia de jornada/usuario."); return; }
        const wasExisting = hasExistingPrediction; setLoading(true);
        try { await setDoc(predictionRef, { ranking: rankedItems, submittedAt: serverTimestamp(), username: season.members[userToSubmitFor]?.username || season.members[userToSubmitFor]?.teamName || 'Desconocido' }, { merge: true });
            if(userToSubmitFor === userId) { toast.success(`¡Tu porra ha sido ${wasExisting ? 'actualizada' : 'enviada'}!`); }
            else { toast.success(`¡Porra ${wasExisting ? 'actualizada' : 'enviada'} para ${season.members[userToSubmitFor]?.teamName}!`); }
        } catch (error) { console.error("Error al enviar la porra: ", error); toast.error(`No se pudo enviar la porra. Error: ${error.message}`); } finally { setLoading(false); }
    };

    if (allRoundsForSelector.length === 0) return <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700"><p className="text-gray-600 dark:text-gray-400">Aún no se han creado jornadas (o 'totalRounds' no está configurado en la temporada).</p></div>;
    if (!selectedRoundNumber || !userId) return <LoadingSpinner text="Cargando..." />;

    const canSubmit = porraData?.isOpen && !isDeadlinePassedLocally;

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="space-y-6">
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-4">
                    <label htmlFor="round-selector" className="flex items-center gap-2 text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2"> <CalendarCheck size={20} /> Viendo Porra de la Jornada: </label>
                    <select id="round-selector" value={selectedRoundNumber} onChange={(e) => setSelectedRoundNumber(Number(e.target.value))} className="input w-full dark:bg-gray-700 dark:border-gray-600">
                        {allRoundsForSelector.map(r => (<option key={r.roundNumber} value={r.roundNumber}> Jornada {r.roundNumber} {r.name ? `(${r.name})` : ''} </option>))}
                    </select>
                </div>

                {loading && porraData === null ? ( <LoadingSpinner text={`Cargando datos de la porra J${selectedRoundNumber}...`} /> ) : (
                    <>
                        {userRole === 'admin' && userId && (
                           <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-6 border border-blue-200 dark:border-blue-700 space-y-4">
                               <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200">Panel de Administrador - Jornada {selectedRoundNumber}</h3>
                               <div className="flex flex-col sm:flex-row gap-4 items-end">
                                   <div className="flex-grow">
                                       <label className="label text-blue-700 dark:text-blue-300">Fecha y Hora Límite</label>
                                       <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="input dark:bg-gray-700 dark:border-gray-600" disabled={ (porraData?.isOpen && !isEditingDeadline) || loading || predictionLoading}/>
                                   </div>
                                    {!porraData?.isOpen && !isEditingDeadline && ( <button onClick={handleOpenPorra} disabled={loading || !deadline} className="btn-primary w-full sm:w-auto"> Abrir Porra </button> )}
                                    {porraData?.isOpen && !isEditingDeadline && ( <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto"> <button onClick={() => setIsEditingDeadline(true)} disabled={loading} className="btn-secondary flex items-center justify-center gap-1 w-full sm:w-auto"> <Edit size={16}/> Editar Plazo </button> <button onClick={handleClosePorra} disabled={loading} className="btn-secondary !bg-red-100 !text-red-700 hover:!bg-red-200 w-full sm:w-auto"> Cerrar Porra </button> </div> )}
                                     {isEditingDeadline && ( <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto"> <button onClick={handleUpdateDeadline} disabled={loading || !deadline} className="btn-primary w-full sm:w-auto"> Guardar Plazo </button> <button onClick={() => { setIsEditingDeadline(false); setDeadline(porraData?.deadline?.toDate().toISOString().slice(0, 16) || '');}} disabled={loading} className="btn-secondary w-full sm:w-auto"> Cancelar </button> </div> )}
                               </div>
                               {porraData?.isOpen && porraData.deadline && <p className="text-sm text-blue-600 dark:text-blue-400">La porra está <span className="font-bold">ABIERTA</span>. Cierra el {format(porraData.deadline.toDate(), 'dd/MM/yyyy HH:mm', { locale: es })}.</p>}
                               {!porraData?.isOpen && porraData?.deadline && <p className="text-sm text-red-600 dark:text-red-400">La porra está <span className="font-bold">CERRADA</span>.</p>}
                               {!porraData?.isOpen && !porraData?.deadline && <p className="text-sm text-gray-500 dark:text-gray-400">La porra no ha sido abierta aún.</p>}
                               <hr className="dark:border-gray-600"/>
                               <div className="flex-grow">
                                   <label htmlFor="admin-user-selector" className="label text-blue-700 dark:text-blue-300 flex items-center gap-2"> <UserPlus size={16} /> Editando porra de: </label>
                                   <select id="admin-user-selector" value={userToSubmitFor} onChange={handleAdminSelectUser} className="input w-full dark:bg-gray-700 dark:border-gray-600" disabled={predictionLoading || loading}>
                                       <option value={userId}>(Yo) {season.members[userId]?.teamName}</option>
                                       {Object.keys(season.members).filter(uid => uid !== userId).sort((a,b) => season.members[a].teamName.localeCompare(season.members[b].teamName)).map(uid => ( <option key={uid} value={uid}> {season.members[uid].teamName} {season.members[uid].isPlaceholder && " (Fantasma)"} </option> ))}
                                   </select>
                               </div>
                           </div>
                        )}

                        <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6 space-y-6">
                             <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">Porra Jornada {selectedRoundNumber}</h3>
                                {porraData?.isOpen && porraData.deadline && !isDeadlinePassedLocally && ( <div className="flex items-center gap-2 text-sm font-semibold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-3 py-1 rounded-full"> <Clock size={16}/> Plazo abierto hasta {format(porraData.deadline.toDate(), 'dd/MM HH:mm', { locale: es })} </div> )}
                                {(porraData?.isOpen && isDeadlinePassedLocally) && ( <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-3 py-1 rounded-full"> <Clock size={16}/> Plazo Finalizado </div> )}
                                {!porraData?.isOpen && ( <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full"> <Clock size={16}/> Porra cerrada </div> )}
                            </div>

                            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                                <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2"><Info size={16} /> Reglas de la Porra</h4>
                                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1"> <li>Arrastra los equipos para ordenar tu predicción.</li> <li>Mínimo 2 aciertos para ganar.</li> <li>Desempate 1: Posición más alta acertada.</li> <li>Desempate 2: Envío más temprano.</li> </ul>
                            </div>

                            {roundResults && porraWinner && ( <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-4 border border-emerald-200 dark:border-emerald-700 text-center"> <h4 className="font-bold text-emerald-800 dark:text-emerald-200 flex items-center justify-center gap-2"> <Crown size={20} /> Ganador de la Porra - Jornada {selectedRoundNumber} </h4> <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{porraWinner.username}</p> <p className="text-sm text-emerald-700 dark:text-emerald-300"> ({porraWinner.score} aciertos, mejor acierto: {porraWinner.highestPositionMatched}º) </p> </div> )}
                            {roundResults && !porraWinner && Object.keys(roundResults).length > 0 && ( <div className="bg-yellow-50 dark:bg-yellow-900/30 rounded-lg p-4 border border-yellow-200 dark:border-yellow-700 text-center"> <h4 className="font-semibold text-yellow-800 dark:text-yellow-200"> Porra Desierta - Jornada {selectedRoundNumber} </h4> <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">Nadie ha conseguido los 2 aciertos mínimos.</p> </div> )}
                            {!roundResults && porraData?.isOpen && isDeadlinePassedLocally && ( <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 border border-blue-200 dark:border-blue-700 text-center"> <h4 className="font-semibold text-blue-800 dark:text-blue-200"> Esperando resultados de la jornada {selectedRoundNumber}... </h4> </div> )}

                            {porraData?.isOpen && (
                                <div className="space-y-4">
                                     <h4 className="font-semibold text-gray-700 dark:text-gray-300"> {userToSubmitFor === userId ? "Tu Predicción (Ordena arrastrando)" : `Predicción para ${season.members[userToSubmitFor]?.teamName} (Ordena arrastrando)`} </h4>
                                     {predictionLoading ? ( <LoadingSpinner text="Cargando predicción..." /> ) : (
                                         <SortableContext items={rankedItems} strategy={verticalListSortingStrategy} id={`porra-list-${userToSubmitFor}-${selectedRoundNumber}`}>
                                            <div className="space-y-2 border dark:border-gray-700 rounded-lg p-3">
                                                {rankedItems.length > 0 ? ( rankedItems.map((uid, index) => ( <SortableItem key={uid} id={uid} member={season.members[uid]} index={index} /> )) ) : ( <p className="text-center text-gray-500 dark:text-gray-400 py-4">No hay equipos para ordenar o la predicción está cargando.</p> )}
                                            </div>
                                         </SortableContext>
                                     )}
                                </div>
                            )}

                            {canSubmit && ( <button onClick={handleSubmitPrediction} disabled={loading || predictionLoading || rankedItems.length === 0 || isDeadlinePassedLocally} className={`w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${hasExistingPrediction ? 'btn-secondary' : 'btn-primary'}`} title={isDeadlinePassedLocally ? "El plazo ha finalizado" : ""}> <Send size={16}/> {hasExistingPrediction ? 'Actualizar Porra' : 'Enviar Porra'} {userToSubmitFor !== userId && ` para ${season.members[userToSubmitFor]?.teamName}`} </button> )}
                            {!canSubmit && porraData?.isOpen === true && isDeadlinePassedLocally && <p className="text-center text-sm text-red-600 dark:text-red-400 font-semibold">El plazo para enviar la porra ha cerrado.</p>}
                            {porraData?.isOpen === false && ( <p className="text-center text-gray-500 dark:text-gray-400">La porra para la jornada {selectedRoundNumber} no está abierta.</p> )}
                        </div>
                    </>
                )}
            </div>

            {createPortal( <DragOverlay> {activeId && member ? ( <SortableItem id={activeId} member={member} index={rankedItems.indexOf(activeId)} /> ) : null} </DragOverlay>, document.body )}
        </DndContext>
    );
}