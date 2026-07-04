import confetti from 'canvas-confetti';

export let isSoundEnabled = localStorage.getItem('dashboard_sound_enabled') !== 'false';

// Mixkit register cash register chime SFX
const kachingSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2017/2017-84.wav");

let pendingCelebrationsCount = 0;
let isCelebrating = false;

// Check visibility change to catch up on missed celebrations
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && pendingCelebrationsCount > 0) {
    console.log(`User returned to tab. Triggering ${pendingCelebrationsCount} queued celebrations!`);
    pendingCelebrationsCount = 0;
    triggerCelebrationAction();
  }
});

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

export function triggerCelebration(amount) {
  if (document.hidden) {
    pendingCelebrationsCount++;
    console.log("Tab is hidden. Queuing celebration. Total pending:", pendingCelebrationsCount);
    return;
  }
  triggerCelebrationAction(amount);
}

function triggerCelebrationAction(amount) {
  if (isCelebrating) return; // Prevent overlapping popups
  isCelebrating = true;

  // 1. Play sound
  if (isSoundEnabled) {
    kachingSound.currentTime = 0; // Rewind
    kachingSound.play().catch(e => console.log("Audio play blocked by browser autoplay policy:", e));
  }

  // 2. Create popup card DOM elements
  const overlay = document.createElement('div');
  overlay.className = 'celebration-overlay';
  
  const card = document.createElement('div');
  card.className = 'celebration-card';
  
  const icon = document.createElement('div');
  icon.className = 'celebration-icon';
  icon.textContent = '🚀';
  
  const title = document.createElement('div');
  title.className = 'celebration-title';
  title.textContent = 'MISSION ACCOMPLISHED';
  
  const subtitle = document.createElement('div');
  subtitle.className = 'celebration-subtitle';
  subtitle.textContent = amount ? 'Revenue Secured!' : 'Deal Closed Won!';
  
  card.appendChild(icon);
  card.appendChild(title);
  card.appendChild(subtitle);
  
  if (amount) {
    const value = document.createElement('div');
    value.className = 'celebration-value';
    value.textContent = `+$${parseFloat(amount).toLocaleString()}`;
    card.appendChild(value);
  }
  
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // 3. Fire Confetti
  const duration = 2.5 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 999999 };

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

  // 4. Fade out and remove after 4 seconds
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.remove();
      isCelebrating = false;
      
      // If any events got queued while celebrating, trigger the next one
      if (pendingCelebrationsCount > 0) {
        pendingCelebrationsCount--;
        triggerCelebrationAction();
      }
    }, 500);
  }, 4000);
}
