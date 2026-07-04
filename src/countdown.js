// src/countdown.js
// Live daily mission countdown — ticks every second, turns amber < 3h, red < 1h

function tick() {
  const display = document.getElementById('missionTimerDisplay');
  const container = document.getElementById('missionTimer');
  if (!display || !container) return;

  const now = new Date();

  // Time remaining until midnight (local time)
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0); // next midnight

  const secsLeft = Math.floor((midnight - now) / 1000);

  if (secsLeft <= 0) {
    display.textContent = '00:00:00';
    return;
  }

  const h = Math.floor(secsLeft / 3600);
  const m = Math.floor((secsLeft % 3600) / 60);
  const s = secsLeft % 60;

  display.textContent =
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0');

  // Urgency styling
  container.classList.remove('timer-warn', 'timer-urgent');
  if (secsLeft < 3600) {
    container.classList.add('timer-urgent');         // < 1 hour — red
  } else if (secsLeft < 10800) {
    container.classList.add('timer-warn');           // < 3 hours — amber
  }
}

// Start immediately and repeat every second
tick();
setInterval(tick, 1000);
