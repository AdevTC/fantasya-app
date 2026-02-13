import React from 'react';
import { User, Clock, Check, X, MessageCircle } from 'lucide-react';

export default function JoinRequestCard({ request, onApprove, onReject, userProfile, processing }) {
    const formatDate = (timestamp) => {
        if (!timestamp) return 'Fecha desconocida';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start gap-4">
                {/* Avatar */}
                <img
                    src={userProfile?.photoURL || `https://ui-avatars.com/api/?name=${request.username}&background=random`}
                    alt={request.username}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                />

                {/* Content */}
                <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-gray-800 dark:text-gray-200 truncate">
                            {request.username}
                        </h4>
                        <span className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                            <Clock size={12} className="mr-1" />
                            {formatDate(request.createdAt)}
                        </span>
                    </div>

                    {/* Team Name */}
                    <div className="flex items-center gap-2 mb-2">
                        <User size={14} className="text-emerald-500" />
                        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {request.teamName}
                        </span>
                    </div>

                    {/* Message (if any) */}
                    {request.message && (
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-3">
                            <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                                "{request.message}"
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onApprove(request)}
                            disabled={processing}
                            className="flex items-center gap-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Check size={16} />
                            Aprobar
                        </button>
                        <button
                            onClick={() => onReject(request)}
                            disabled={processing}
                            className="flex items-center gap-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <X size={16} />
                            Rechazar
                        </button>
                        {request.chatId && (
                            <a
                                href={`/chat/${request.chatId}`}
                                className="flex items-center gap-1 px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
                                title="Ver chat"
                            >
                                <MessageCircle size={16} />
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
