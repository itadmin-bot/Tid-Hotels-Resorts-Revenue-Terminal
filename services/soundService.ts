/**
 * Minimal Sound Service for Tidé Revenue Terminal
 * Ensures build compatibility and provides safe audio playback.
 */

const playSound = (type: 'success' | 'error' | 'click') => {
  if (typeof window === 'undefined') return;

  try {
    // Placeholder for future sound implementation
    // console.log(`Playing ${type} sound`);
  } catch (error) {
    console.error('Sound playback failed:', error);
  }
};

const soundService = {
  playSuccess: () => playSound('success'),
  playError: () => playSound('error'),
  playClick: () => playSound('click'),
};

export default soundService;
