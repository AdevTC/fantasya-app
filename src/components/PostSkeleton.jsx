import React from 'react';

export default function PostSkeleton() {
    return (
        <div className="bento-card animate-pulse flex flex-col gap-4">
            <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
                <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/4"></div>
                    <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-1/3"></div>
                </div>
            </div>
            <div className="pl-16 space-y-3">
                <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-full"></div>
                <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-5/6"></div>
            </div>
            <div className="pl-16 mt-2 pt-4 border-t border-gray-200 dark:border-gray-700/50 flex justify-between">
                <div className="flex gap-2">
                    <div className="h-10 w-16 bg-gray-300 dark:bg-gray-700 rounded-lg"></div>
                    <div className="h-10 w-16 bg-gray-300 dark:bg-gray-700 rounded-lg"></div>
                </div>
                <div className="h-10 w-12 bg-gray-300 dark:bg-gray-700 rounded-lg"></div>
            </div>
        </div>
    );
}