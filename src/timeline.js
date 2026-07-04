// src/timeline.js
// Challenge Calendar / Timeline view
import { currentChallenge } from './dashboard.js';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function renderTimeline() {
  const panel = document.getElementById('timelinePanel');
  if (!panel) return;

  if (!currentChallenge) {
    panel.innerHTML = `<div class="tl-empty">No active challenge found.</div>`;
    return;
  }

  const { name, start_date, total_days, goal_amount } = currentChallenge;

  // Dates
  const start   = new Date(start_date + 'T00:00:00'); // local midnight
  const end     = new Date(start);
  end.setDate(end.getDate() + total_days - 1);

  const today   = new Date();
  today.setHours(0, 0, 0, 0);

  const rawDay  = Math.floor((today - start) / 86400000) + 1;
  const currentDay = Math.max(1, Math.min(rawDay, total_days));
  const isActive   = today >= start && today <= end;
  const isFinished = today > end;
  const isPending  = today < start;

  // Format helper
  function fmt(d) {
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  // Build the 42-cell calendar grid (weeks × 7)
  // We show enough weeks to span the full challenge
  // Align start to the Sunday of its week
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // rewind to Sunday

  const gridEnd = new Date(end);
  // advance to Saturday of end's week
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const cells = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    cells.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const challengeDayFor = (d) => {
    const diff = Math.floor((d - start) / 86400000) + 1;
    return (diff >= 1 && diff <= total_days) ? diff : null;
  };

  // Status badge
  let statusBadge = '';
  if (isPending)  statusBadge = `<span class="tl-badge tl-badge-pending">Starts in ${Math.ceil((start - today) / 86400000)} days</span>`;
  else if (isFinished) statusBadge = `<span class="tl-badge tl-badge-done">Completed</span>`;
  else statusBadge = `<span class="tl-badge tl-badge-active">Day ${currentDay} of ${total_days}</span>`;

  panel.innerHTML = `
    <div class="tl-wrap">

      <!-- ── Hero header ── -->
      <div class="tl-hero">
        <div class="tl-hero-left">
          <div class="tl-title">${name || 'Challenge Timeline'}</div>
          <div class="tl-dates">${fmt(start)} → ${fmt(end)}</div>
        </div>
        <div class="tl-hero-right">
          ${statusBadge}
        </div>
      </div>

      <!-- ── At-a-glance stat row ── -->
      <div class="tl-stats">
        <div class="tl-stat">
          <div class="tl-stat-val">${fmt(start)}</div>
          <div class="tl-stat-label">Start Date</div>
        </div>
        <div class="tl-stat-divider"></div>
        <div class="tl-stat">
          <div class="tl-stat-val" id="tlToday">${fmt(today)}</div>
          <div class="tl-stat-label">Today · ${isActive ? `Day ${currentDay} of ${total_days}` : (isPending ? 'Not started' : 'Challenge over')}</div>
        </div>
        <div class="tl-stat-divider"></div>
        <div class="tl-stat">
          <div class="tl-stat-val">${fmt(end)}</div>
          <div class="tl-stat-label">End Date</div>
        </div>
        <div class="tl-stat-divider"></div>
        <div class="tl-stat">
          <div class="tl-stat-val">${total_days}</div>
          <div class="tl-stat-label">Total Days</div>
        </div>
        <div class="tl-stat-divider"></div>
        <div class="tl-stat">
          <div class="tl-stat-val">$${Number(goal_amount).toLocaleString()}</div>
          <div class="tl-stat-label">Goal</div>
        </div>
      </div>

      <!-- ── Challenge progress bar ── -->
      ${isActive || isFinished ? `
      <div class="tl-progress-wrap">
        <div class="tl-progress-labels">
          <span>Day 1</span>
          <span class="tl-progress-pct">${Math.round((currentDay / total_days) * 100)}% through</span>
          <span>Day ${total_days}</span>
        </div>
        <div class="tl-progress-track">
          <div class="tl-progress-fill" style="width: ${Math.min((currentDay / total_days) * 100, 100)}%">
            <div class="tl-progress-thumb"></div>
          </div>
        </div>
      </div>` : ''}

      <!-- ── Calendar grid ── -->
      <div class="tl-calendar">
        <div class="tl-cal-header">
          ${DAY_NAMES.map(d => `<div class="tl-cal-day-name">${d}</div>`).join('')}
        </div>
        <div class="tl-cal-grid">
          ${cells.map(d => {
            const chalDay = challengeDayFor(d);
            const isToday = d.getTime() === today.getTime();
            const inChallenge = chalDay !== null;
            const isPast = inChallenge && d < today;
            const isFuture = inChallenge && d > today;
            const isOutside = !inChallenge;

            let cls = 'tl-cal-cell';
            if (isOutside)    cls += ' tl-outside';
            if (isToday)      cls += ' tl-today';
            if (isPast)       cls += ' tl-past';
            if (isFuture)     cls += ' tl-future';
            if (inChallenge && !isToday) cls += ' tl-in-challenge';

            return `
              <div class="${cls}">
                <div class="tl-cal-date">${d.getDate()}</div>
                ${inChallenge ? `<div class="tl-cal-challenge-day">Day ${chalDay}</div>` : ''}
                ${isToday ? `<div class="tl-today-pip"></div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- ── Month legend ── -->
      <div class="tl-month-label">
        ${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}
        ${start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()
          ? ` — ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}` : ''}
      </div>

    </div>
  `;
}
