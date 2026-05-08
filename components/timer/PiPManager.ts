'use client';

/**
 * Shared state for the Document PiP window.
 * This allows both the Sidebar MiniPlayer and the GlobalTimerUI
 * to know if a PiP window is active and to trigger opening it.
 */

type PiPState = {
  window: Window | null;
  isOpen: boolean;
};

let pipState: PiPState = {
  window: null,
  isOpen: false,
};

const listeners = new Set<(state: PiPState) => void>();

export const pipManager = {
  getState: () => ({ ...pipState }),
  
  setWindow: (win: Window | null) => {
    pipState.window = win;
    pipState.isOpen = !!win;
    listeners.forEach(l => l({ ...pipState }));
    
    if (win) {
      win.addEventListener('pagehide', () => {
        pipState.window = null;
        pipState.isOpen = false;
        listeners.forEach(l => l({ ...pipState }));
      });
    }
  },
  
  subscribe: (listener: (state: PiPState) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  
  close: () => {
    if (pipState.window) {
      pipState.window.close();
      pipState.window = null;
      pipState.isOpen = false;
      listeners.forEach(l => l({ ...pipState }));
    }
  }
};
