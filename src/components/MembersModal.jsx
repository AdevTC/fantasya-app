import React, { useMemo } from 'react';
import { X, User, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MembersModal({ isOpen, onClose, members }) {
    if (!isOpen || !members) return null;

    const sortedMembers = useMemo(() => {
        const membersArray = Object.entries(members).map(([uid, data]) => ({
            uid,
            ...data
        }));

        const claimed = membersArray.filter(m => !m.isPlaceholder && m.username);
        const unclaimed = membersArray.filter(m => m.isPlaceholder || !m.username);

        claimed.sort((a, b) => a.username.localeCompare(b.username));
        unclaimed.sort((a, b) => (a.teamName || '').localeCompare(b.teamName || ''));

        return [...claimed, ...unclaimed];
    }, [members]);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md flex flex-col max-h-[80vh] shadow-2xl">
                <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Participantes</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {sortedMembers.map((member) => {
                        const isGhost = !member.username || member.isPlaceholder;
                        const Component = isGhost ? 'div' : Link;
                        const linkProps = isGhost ? {} : { to: `/profile/${member.username}`, onClick: onClose };

                        // Avatar Logic: Real Photo > Initials (Username for claimed, TeamName for ghost)
                        const avatarSrc = member.photoURL
                            ? member.photoURL
                            : `https://ui-avatars.com/api/?name=${isGhost ? (member.teamName || '?') : member.username}&background=random`;

                        return (
                            <Component
                                key={member.uid}
                                className={`flex items-center gap-4 p-3 rounded-xl transition-colors group ${isGhost ? 'opacity-70 bg-gray-50 dark:bg-gray-700/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
                                {...linkProps}
                            >
                                <img
                                    src={avatarSrc}
                                    alt={member.username || 'Ghost'}
                                    className="w-12 h-12 rounded-full border-2 border-emerald-500/50 group-hover:border-emerald-500 transition-colors object-cover"
                                />
                                <div className="flex-1">
                                    <p className="font-bold text-gray-800 dark:text-gray-200">{member.teamName || '(Sin Equipo)'}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                        {isGhost ? '(Sin reclamar)' : `@${member.username}`}
                                        {member.role === 'admin' && <Shield size={12} className="text-yellow-500" fill="currentColor" />}
                                    </p>
                                </div>
                            </Component>
                        );
                    })}
                </div>

                <div className="p-4 border-t dark:border-gray-700 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {sortedMembers.length} mánager{sortedMembers.length !== 1 ? 's' : ''} compitiendo
                    </p>
                </div>
            </div>
        </div>
    );
}
