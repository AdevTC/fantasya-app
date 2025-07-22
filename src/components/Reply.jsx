import React from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Reply({ reply }) {
    const { authorUsername, authorPhotoURL, content, createdAt } = reply;

    return (
        <div className="flex items-start gap-3">
            <Link to={`/profile/${authorUsername}`}>
                <img 
                    src={authorPhotoURL || `https://ui-avatars.com/api/?name=${authorUsername}&background=random`}
                    alt={`Foto de ${authorUsername}`}
                    className="w-8 h-8 rounded-full object-cover"
                />
            </Link>
            <div className="flex-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-4 py-2">
                <div className="flex items-baseline gap-2">
                    <Link to={`/profile/${authorUsername}`} className="font-bold text-sm text-gray-800 dark:text-gray-200 hover:underline">
                        {authorUsername}
                    </Link>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {createdAt ? formatDistanceToNow(createdAt.toDate(), { addSuffix: true, locale: es }) : ''}
                    </span>
                </div>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{content}</p>
            </div>
        </div>
    );
}