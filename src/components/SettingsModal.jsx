import React, { useState, useEffect } from 'react';
import { doc, updateDoc, writeBatch, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function SettingsModal({ isOpen, onClose, league }) {
    const navigate = useNavigate();
    const [leagueName, setLeagueName] = useState(league.name);
    const [inviteCode, setInviteCode] = useState(league.inviteCode);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setLeagueName(league.name);
            setInviteCode(league.inviteCode);
        }
    }, [isOpen, league.name, league.inviteCode]);

    const handleSaveSettings = async (e) => {
        e.preventDefault();
        if (!leagueName.trim()) {
            toast.error("El nombre de la liga no puede estar vacío.");
            return;
        }
        setLoading(true);
        const loadingToast = toast.loading('Guardando cambios...');
        try {
            const leagueRef = doc(db, 'leagues', league.id);
            await updateDoc(leagueRef, {
                name: leagueName.trim()
            });
            toast.success('Nombre de la liga actualizado', { id: loadingToast });
            onClose();
        } catch (error) {
            console.error("Error al actualizar los ajustes:", error);
            toast.error('No se pudieron guardar los cambios.', { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };

    // --- NUEVA LÓGICA PARA GENERAR CÓDIGO ---
    const handleGenerateNewCode = async () => {
        if (!window.confirm("¿Seguro que quieres generar un nuevo código? El anterior dejará de ser válido.")) return;

        setLoading(true);
        const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const leagueRef = doc(db, 'leagues', league.id);
        try {
            await updateDoc(leagueRef, { inviteCode: newCode });
            setInviteCode(newCode);
            toast.success("¡Nuevo código de invitación generado!");
        } catch (error) {
            toast.error("No se pudo generar un nuevo código.");
        } finally {
            setLoading(false);
        }
    };
    
    // --- NUEVA LÓGICA PARA ELIMINAR LA LIGA ---
    const handleDeleteLeague = async () => {
        const confirmationText = prompt(`Esta acción es irreversible. Para confirmar, escribe el nombre de la liga: "${league.name}"`);
        if (confirmationText !== league.name) {
            toast.error("La confirmación no coincide. Eliminación cancelada.");
            return;
        }

        setLoading(true);
        const loadingToast = toast.loading('Eliminando liga y todos sus datos...');
        try {
            const batch = writeBatch(db);
            const subcollections = ['rounds', 'lineups', 'transfers'];

            // Borra documentos de cada subcolección
            for (const sub of subcollections) {
                const subcollectionRef = collection(db, 'leagues', league.id, sub);
                const snapshot = await getDocs(subcollectionRef);
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
            }

            // Añade el documento principal de la liga al batch de borrado
            const leagueRef = doc(db, 'leagues', league.id);
            batch.delete(leagueRef);
            
            await batch.commit();

            toast.success('Liga eliminada con éxito.', { id: loadingToast });
            navigate('/dashboard'); // Redirige al dashboard
        } catch (error) {
            console.error("Error al eliminar la liga:", error);
            toast.error("No se pudo eliminar la liga.", { id: loadingToast });
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-lg">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">Ajustes de la Liga</h3>
                <form onSubmit={handleSaveSettings} className="space-y-6">
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">Nombre de la Liga</label>
                        <input type="text" value={leagueName} onChange={(e) => setLeagueName(e.target.value)} className="input" />
                    </div>

                    {/* --- NUEVA SECCIÓN: CÓDIGO DE INVITACIÓN --- */}
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">Código de Invitación</label>
                        <div className="flex items-center gap-4">
                            <input type="text" value={inviteCode} readOnly className="input bg-gray-100 font-mono" />
                            <button type="button" onClick={handleGenerateNewCode} disabled={loading} className="btn-secondary whitespace-nowrap">Generar Nuevo</button>
                        </div>
                    </div>
                    
                    <div className="flex justify-end gap-4 pt-4 border-t">
                        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
                        <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">
                            {loading ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>

                 {/* --- NUEVA SECCIÓN: ZONA DE PELIGRO --- */}
                <div className="mt-8 border-t-2 border-red-200 pt-6">
                     <h4 className="text-lg font-bold text-red-600">Zona de Peligro</h4>
                     <p className="text-sm text-gray-500 mt-1">Estas acciones son irreversibles.</p>
                     <div className="mt-4">
                        <button
                            type="button"
                            onClick={handleDeleteLeague}
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg w-full disabled:opacity-50"
                        >
                            {loading ? 'Eliminando...' : 'Eliminar Liga Permanentemente'}
                        </button>
                     </div>
                </div>
            </div>
        </div>
    );
}