import confetti from 'canvas-confetti';

export let isSoundEnabled = localStorage.getItem('dashboard_sound_enabled') !== 'false';

// Mixkit register cash register chime SFX
const kachingSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2017/2017-84.wav");

export function toggleDashboardSound() {
  isSoundEnabled = !isSoundEnabled;
  localStorage.setItem('dashboard_sound_enabled', isSoundEnabled ? 'true' : 'false');
  updateSoundButtonUI();
}

export function updateSoundButtonUI() {
  const btn = document.getElementById('soundToggleBtn');
  if (btn) {
    btn.textContent = isSoundEnabled ? '🔊' : '🔇';
    btn.title = isSoundEnabled ? 'Mute sound' : 'Unmute sound';
  }
}

export function triggerCelebration() {
  // 1. Play sound
  if (isSoundEnabled) {
    kachingSound.currentTime = 0; // Rewind
    kachingSound.play().catch(e => console.log("Audio play blocked by browser autoplay policy:", e));
  }

  // 2. Fire Confetti
  const duration = 2 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 99999 };

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(function() {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);
    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
  }, 250);
}
