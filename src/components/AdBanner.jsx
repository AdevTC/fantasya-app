import React, { useEffect } from 'react';

const AdBanner = ({ slot, format = 'auto', responsive = 'true' }) => {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error("Error al cargar el anuncio de AdSense:", e);
    }
  }, []);

  // No renderizar el anuncio si el ID de publicador no está configurado
  if (!import.meta.env.VITE_ADSENSE_PUBLISHER_ID) {
    return null;
  }

  return (
    <div className="my-6 flex justify-center">
      <ins 
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', minHeight: '90px', textAlign: 'center' }}
        data-ad-client={import.meta.env.VITE_ADSENSE_PUBLISHER_ID}
        data-ad-slot={slot} // Cada bloque de anuncio tendrá su propio ID de "slot"
        data-ad-format={format}
        data-full-width-responsive={responsive}
      ></ins>
    </div>
  );
};

export default AdBanner;