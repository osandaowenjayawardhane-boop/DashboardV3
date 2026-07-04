import confetti from 'canvas-confetti';

export let isSoundEnabled = localStorage.getItem('dashboard_sound_enabled') !== 'false';

// Mixkit register cash register chime SFX
const kachingSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2017/2017-84.wav");

let pendingCelebrations = [];
let isCelebrating = false;

// Check visibility change — fire any queued celebrations when user returns to tab
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && pendingCelebrations.length > 0) {
    const queued = pendingCelebrations;
    pendingCelebrations = [];
    // fire the most recent queued one (collapse multiples into one)
    triggerCelebrationAction(queued[queued.length - 1]);
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
    pendingCelebrations.push(amount);
    return;
  }
  triggerCelebrationAction(amount);
}

function triggerCelebrationAction(amount) {
  if (isCelebrating) return;
  isCelebrating = true;

  // 1. Play sound
  if (isSoundEnabled) {
    kachingSound.currentTime = 0;
    kachingSound.play().catch(() => {});
  }

  // 2. Build the toast card
  const isRevenue = amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0;
  const formattedAmount = isRevenue
    ? `+$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : null;

  const toast = document.createElement('div');
  toast.className = 'cel-toast';

  toast.innerHTML = `
    <div class="cel-glow"></div>
    <div class="cel-inner">
      <div class="cel-left">
        <div class="cel-icon-wrap">
          <svg class="cel-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="10" fill="rgba(69,53,204,0.12)"/>
            <path d="M6 10.5L8.8 13.5L14 7.5" stroke="#4535cc" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <div class="cel-body">
        <div class="cel-label">${isRevenue ? 'Revenue Secured' : 'Deal Closed'}</div>
        ${formattedAmount ? `<div class="cel-amount">${formattedAmount}</div>` : ''}
        <div class="cel-sublabel">${isRevenue ? 'Stripe payment confirmed' : 'Lead moved to Closed Won'}</div>
      </div>
      <button class="cel-dismiss" aria-label="Dismiss">✕</button>
    </div>
    <div class="cel-progress-bar"></div>
  `;

  document.body.appendChild(toast);

  // Dismiss button
  toast.querySelector('.cel-dismiss').addEventListener('click', () => dismiss(toast));

  // 3. Light confetti burst — subtle, from top corners only
  const colours = ['#4535cc', '#9b8ae7', '#ef6b51', '#ffffff'];
  confetti({
    particleCount: 60,
    angle: 120,
    spread: 55,
    origin: { x: 1, y: 0 },
    colors: colours,
    startVelocity: 28,
    ticks: 80,
    zIndex: 999999,
  });
  confetti({
    particleCount: 60,
    angle: 60,
    spread: 55,
    origin: { x: 0, y: 0 },
    colors: colours,
    startVelocity: 28,
    ticks: 80,
    zIndex: 999999,
  });

  // 4. Auto-dismiss after 5s
  const autoDismiss = setTimeout(() => dismiss(toast), 5000);
  toast._autoDismiss = autoDismiss;
}

function dismiss(toast) {
  clearTimeout(toast._autoDismiss);
  toast.classList.add('cel-toast--out');
  setTimeout(() => {
    toast.remove();
    isCelebrating = false;

    // Fire next queued celebration if any
    if (pendingCelebrations.length > 0) {
      const next = pendingCelebrations.shift();
      setTimeout(() => triggerCelebrationAction(next), 200);
    }
  }, 380);
}
