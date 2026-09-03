import React, { useEffect, useRef } from 'react';
import { resolveAdSenseRuntime } from '../config/ads-runtime';
import { isUsingEmulators } from '../config/firebase';

const ADSENSE_SCRIPT_ID = 'fantasya-adsense-script';

const AdBanner = ({ slot, format = 'auto', responsive = 'true' }) => {
  const initialized = useRef(false);
  const adsRuntime = resolveAdSenseRuntime(
    import.meta.env,
    isUsingEmulators,
  );

  useEffect(() => {
    if (!adsRuntime.enabled || initialized.current) return;

    initialized.current = true;

    if (!document.getElementById(ADSENSE_SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = ADSENSE_SCRIPT_ID;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src =
        'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
        encodeURIComponent(adsRuntime.publisherId);
      document.head.appendChild(script);
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('Error al cargar el anuncio de AdSense:', e);
    }
  }, [adsRuntime.enabled, adsRuntime.publisherId]);

  if (!adsRuntime.enabled) {
    return null;
  }

  return (
    <div className="my-6 flex justify-center">
      <ins 
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', minHeight: '90px', textAlign: 'center' }}
        data-ad-client={adsRuntime.publisherId}
        data-ad-slot={slot} // Cada bloque de anuncio tendrá su propio ID de "slot"
        data-ad-format={format}
        data-full-width-responsive={responsive}
      ></ins>
    </div>
  );
};

export default AdBanner;
