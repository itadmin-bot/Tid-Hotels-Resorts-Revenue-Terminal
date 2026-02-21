
class SoundService {
  private sounds: Record<string, HTMLAudioElement> = {};

  constructor() {
    // Preload sounds
    this.sounds = {
      success: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'),
      alert: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'),
      error: new Audio('https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3'),
      action: new Audio('https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3'),
    };

    // Set volumes
    Object.values(this.sounds).forEach(s => {
      s.volume = 0.4;
    });
  }

  play(type: 'success' | 'alert' | 'error' | 'action') {
    const sound = this.sounds[type];
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(e => console.warn("Audio playback blocked by browser policy until user interaction:", e));
    }
  }
}

export const soundService = new SoundService();
