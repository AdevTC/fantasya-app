import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

export default function ImageWithFallback({ src, alt, className, fallbackIconSize = 24 }) {
    const [status, setStatus] = useState('loading'); // loading, loaded, error

    const handleLoad = () => {
        setStatus('loaded');
    };

    const handleError = () => {
        setStatus('error');
    };

    return (
        <div className={`relative overflow-hidden ${className} bg-gray-200 dark:bg-gray-700`}>
            {status === 'error' ? (
                <div className="flex items-center justify-center w-full h-full text-gray-400">
                    <ImageOff size={fallbackIconSize} />
                </div>
            ) : (
                <img
                    src={src}
                    alt={alt}
                    onLoad={handleLoad}
                    onError={handleError}
                    className={`w-full h-full object-cover transition-opacity duration-500 ease-in-out ${status === 'loaded' ? 'opacity-100' : 'opacity-0'
                        }`}
                />
            )}

            {/* Shimmer effect while loading */}
            {status === 'loading' && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 animate-shimmer" />
            )}
        </div>
    );
}
