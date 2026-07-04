import confetti from 'canvas-confetti';

export let isSoundEnabled = localStorage.getItem('dashboard_sound_enabled') !== 'false';

const kachingSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2017/2017-84.wav");

let pendingCelebrations = [];
let isCelebrating = false;

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && pendingCelebrations.length > 0) {
    const queued = pendingCelebrations;
    pendingCelebrations = [];
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

  // 1. Sound
  if (isSoundEnabled) {
    kachingSound.currentTime = 0;
    kachingSound.play().catch(() => {});
  }

  const isRevenue = amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0;
  const formattedAmount = isRevenue
    ? `+$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : null;

  // 2. Blur backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'cel-backdrop';
  document.body.appendChild(backdrop);

  // 3. Build toast
  const toast = document.createElement('div');
  toast.className = 'cel-toast';

  // CSS sparkle stars (12 of them, random directions)
  const sparkleHTML = Array.from({ length: 12 }, (_, i) =>
    `<div class="cel-sparkle cel-sparkle-${i + 1}"></div>`
  ).join('');

  toast.innerHTML = `
    ${sparkleHTML}
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
  toast.querySelector('.cel-dismiss').addEventListener('click', () => dismiss(toast, backdrop));

  // 4. Confetti — fires from bottom-right (where toast lives)
  const colours = ['#4535cc', '#9b8ae7', '#ef6b51', '#ffffff', '#ffd700', '#a78bfa'];

  // First burst — immediate
  confetti({
    particleCount: 80,
    angle: 125,
    spread: 70,
    origin: { x: 0.97, y: 0.97 },
    colors: colours,
    startVelocity: 45,
    ticks: 120,
    scalar: 0.9,
    zIndex: 999997,
  });

  // Second burst — slight delay for layered effect
  setTimeout(() => {
    confetti({
      particleCount: 60,
      angle: 110,
      spread: 55,
      origin: { x: 0.97, y: 0.97 },
      colors: colours,
      startVelocity: 38,
      ticks: 100,
      scalar: 0.75,
      shapes: ['circle'],
      zIndex: 999997,
    });
  }, 180);

  // Third burst — trailing sparkle shower
  setTimeout(() => {
    confetti({
      particleCount: 40,
      angle: 140,
      spread: 90,
      origin: { x: 0.97, y: 0.97 },
      colors: colours,
      startVelocity: 28,
      ticks: 90,
      scalar: 0.6,
      zIndex: 999997,
    });
  }, 400);

  // 5. Auto-dismiss after 5s
  const autoDismiss = setTimeout(() => dismiss(toast, backdrop), 5000);
  toast._autoDismiss = autoDismiss;
}

function dismiss(toast, backdrop) {
  clearTimeout(toast._autoDismiss);
  toast.classList.add('cel-toast--out');
  backdrop.classList.add('cel-backdrop--out');
  setTimeout(() => {
    toast.remove();
    backdrop.remove();
    isCelebrating = false;
    if (pendingCelebrations.length > 0) {
      const next = pendingCelebrations.shift();
      setTimeout(() => triggerCelebrationAction(next), 200);
    }
  }, 400);
}
