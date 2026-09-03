import React from 'react';
import { isUsingEmulators } from '../config/firebase';

export default function EnvironmentBanner() {
  if (!isUsingEmulators) return null;

  return (
    <div
      role="status"
      className="fixed bottom-3 right-3 z-[100] rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950 shadow-lg"
    >
      Firebase local · demo-fantasya
    </div>
  );
}
