import React, { useState, useEffect, useRef } from 'react';
import { db } from '../config/firebase';
import { collection, doc, updateDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import PlayerAutocomplete from './PlayerAutocomplete';
import { useAuth } from '../hooks/useAuth';
import { createTransfer } from '../services/content-api';
import {
    getTransferSessionIdentity,
    parseSpanishPrice,
} from '../services/content-client-helpers';

export default function RegisterTransferModal({ isOpen, onClose, league, season, onTransferRegistered, existingTransfer }) {
    const { user } = useAuth();
    const [player, setPlayer] = useState(null);
    const [price, setPrice] = useState('');
    const [buyerId, setBuyerId] = useState('');
    const [sellerId, setSellerId] = useState('market');
    const [transferType, setTransferType] = useState('puja');
    const [loading, setLoading] = useState(false);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const operationIdRef = useRef(null);
    const pendingAttemptRef = useRef(null);
    const submissionInFlightRef = useRef(false);
    const sessionIdentityRef = useRef(null);

    useEffect(() => {
        const nextIdentity = getTransferSessionIdentity({
            isOpen,
            league,
            season,
            existingTransfer,
            user,
        });
        if (nextIdentity === null) {
            sessionIdentityRef.current = null;
            operationIdRef.current = null;
            pendingAttemptRef.current = null;
            return;
        }
        if (!season?.members || !league?.id || !season?.id || !user?.uid) return;
        if (sessionIdentityRef.current === nextIdentity) return;

        sessionIdentityRef.current = nextIdentity;

        if (existingTransfer) {
            // MODO EDICIÓN: Cargar datos del fichaje existente
            setPlayer({ name: existingTransfer.playerName, id: existingTransfer.playerId });
            setPrice(String(existingTransfer.price).replace('.', ',')); // Usar coma para la UI
            setBuyerId(existingTransfer.buyerId);
            setSellerId(existingTransfer.sellerId);
            setTransferType(existingTransfer.type);
            if (existingTransfer.timestamp) {
                const existingDate = existingTransfer.timestamp.toDate();
                setDate(existingDate.toISOString().split('T')[0]);
                setTime(existingDate.toTimeString().slice(0, 5));
            }
        } else {
            // MODO CREACIÓN: Resetear a valores por defecto
            const now = new Date();
            setPlayer(null);
            setPrice('');
            // **CORRECCIÓN CLAVE**: El comprador por defecto es el usuario actual, no el primero de la lista.
            setBuyerId(user.uid);
            setSellerId('market');
            setTransferType('puja');
            setDate(now.toISOString().split('T')[0]);
            setTime(now.toTimeString().slice(0, 5));
        }
        operationIdRef.current = null;
        pendingAttemptRef.current = null;
    }, [isOpen, league, existingTransfer, season, user]);

    // Esta lógica de negocio se mantiene como la tenías
    useEffect(() => {
        if (transferType === 'puja') {
            setSellerId('market');
        }
        if (buyerId === 'market') {
            setTransferType('acuerdo');
        }
    }, [transferType, buyerId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submissionInFlightRef.current) return;
        if (!player || !price || !buyerId || !sellerId || !date || !time) {
            toast.error("Debes seleccionar un jugador de la lista y rellenar todos los campos.");
            return;
        }
        if (buyerId === sellerId && buyerId !== 'market') {
            toast.error("El comprador y el vendedor no pueden ser el mismo.");
            return;
        }
        const parsedPrice = parseSpanishPrice(price);
        if (parsedPrice === null) {
            toast.error("El precio debe ser un número válido y no negativo.");
            return;
        }

        const combinedDateTime = new Date(`${date}T${time}`);
        if (isNaN(combinedDateTime.getTime())) {
            toast.error("La fecha o la hora no son válidas.");
            return;
        }

        const transferData = {
            playerId: player.id,
            playerName: player.name,
            price: parsedPrice,
            buyerId,
            buyerName: buyerId === 'market' ? 'Mercado' : season.members[buyerId]?.teamName,
            sellerId,
            sellerName: sellerId === 'market' ? 'Mercado' : season.members[sellerId]?.teamName,
            type: transferType,
            timestamp: combinedDateTime,
        };
        let creationPayload = null;
        if (!existingTransfer) {
            creationPayload = {
                leagueId: league.id,
                seasonId: season.id,
                playerId: player.id,
                playerName: player.name,
                price: parsedPrice,
                buyerId,
                sellerId,
                type: transferType,
                timestamp: combinedDateTime.toISOString(),
            };
            const fingerprint = JSON.stringify(creationPayload);
            if (pendingAttemptRef.current?.fingerprint !== fingerprint) {
                operationIdRef.current = uuidv4();
                pendingAttemptRef.current = { fingerprint, payload: creationPayload };
            } else {
                creationPayload = pendingAttemptRef.current.payload;
            }
            operationIdRef.current ||= uuidv4();
        }

        submissionInFlightRef.current = true;
        setLoading(true);
        const loadingToast = toast.loading(existingTransfer ? 'Actualizando fichaje...' : 'Registrando fichaje...');

        try {
            const basePath = collection(db, 'leagues', league.id, 'seasons', season.id, 'transfers');
            if (existingTransfer) {
                const transferRef = doc(basePath, existingTransfer.id);
                await updateDoc(transferRef, transferData);
                toast.success('Fichaje actualizado correctamente', { id: loadingToast });
            } else {
                await createTransfer({
                    operationId: operationIdRef.current,
                    ...creationPayload,
                });
                operationIdRef.current = null;
                pendingAttemptRef.current = null;
                toast.success('Fichaje registrado correctamente', { id: loadingToast });
            }
            onTransferRegistered();
            onClose();
        } catch (error) {
            console.error("Error al registrar el fichaje:", error);
            toast.error("No se pudo completar la operación.", { id: loadingToast });
        } finally {
            submissionInFlightRef.current = false;
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (submissionInFlightRef.current) return;
        sessionIdentityRef.current = null;
        operationIdRef.current = null;
        pendingAttemptRef.current = null;
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-lg shadow-lg border dark:border-gray-700">
                <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-6">{existingTransfer ? 'Editar Fichaje' : 'Registrar Nuevo Fichaje'}</h3>
                {season ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div><label className="label dark:text-gray-300">Jugador</label><PlayerAutocomplete onPlayerSelect={setPlayer} initialValue={player?.name}/></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="label dark:text-gray-300">Fecha del Fichaje</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="input dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                            <div><label className="label dark:text-gray-300">Hora del Fichaje</label><input type="time" value={time} onChange={e => setTime(e.target.value)} className="input dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="label dark:text-gray-300">Comprador</label>
                                <select value={buyerId} onChange={e => setBuyerId(e.target.value)} className="input dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                    <option value="market">Mercado</option>
                                    {Object.entries(season.members).map(([uid, member]) => (<option key={uid} value={uid}>{member.teamName}</option>))}
                                </select>
                            </div>
                            <div>
                                <label className="label dark:text-gray-300">Vendedor</label>
                                <select value={sellerId} onChange={e => setSellerId(e.target.value)} className="input dark:bg-gray-700 dark:border-gray-600 dark:text-white" disabled={transferType === 'puja'}>
                                    <option value="market">Mercado</option>
                                    {Object.entries(season.members).map(([uid, member]) => (<option key={uid} value={uid}>{member.teamName}</option>))}
                                </select>
                            </div>
                        </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="label dark:text-gray-300">Precio (€)</label><input type="text" value={price} onChange={e => setPrice(e.target.value)} className="input dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ej: 12.500.000" /></div>
                            <div>
                                <label className="label dark:text-gray-300">Tipo de Movimiento</label>
                                <select value={transferType} onChange={e => setTransferType(e.target.value)} className="input capitalize dark:bg-gray-700 dark:border-gray-600 dark:text-white" disabled={buyerId === 'market'}>
                                    <option value="puja">Puja</option>
                                    <option value="clausulazo">Clausulazo</option>
                                    <option value="acuerdo">Acuerdo</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-4 pt-4"><button type="button" onClick={handleClose} disabled={loading} className="btn-secondary disabled:opacity-50">Cancelar</button><button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">{loading ? 'Guardando...' : (existingTransfer ? 'Guardar Cambios' : 'Registrar Fichaje')}</button></div>
                    </form>
                ) : (
                    <p className="text-gray-500 dark:text-gray-400">Cargando datos de la temporada...</p>
                )}
            </div>
        </div>
    );
}
