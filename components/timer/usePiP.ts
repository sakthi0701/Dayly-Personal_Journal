'use client';

import { useState, useEffect } from 'react';
import { pipManager } from './PiPManager';

export function usePiP() {
  const [state, setState] = useState(pipManager.getState());
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(typeof window !== 'undefined' && 'documentPictureInPicture' in window && !!(window as any).documentPictureInPicture);
    const unsubscribe = pipManager.subscribe(setState);
    return () => {
      unsubscribe();
    };
  }, []);

  return {
    pipWindow: state.window,
    isPiPOpen: state.isOpen,
    closePiP: pipManager.close,
    setPiPWindow: pipManager.setWindow,
    isSupported,
  };
}
