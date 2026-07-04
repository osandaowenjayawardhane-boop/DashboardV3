// src/timeline.js
// Challenge Calendar / Timeline view — with daily revenue overlaid on each cell
import { currentChallenge } from './dashboard.js';
import { supabaseClient } from './supabase.js';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function toDateKey(d) {
  // Returns "YYYY-MM-DD" from a local Date object
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function renderTimeline() {
  const panel = document.getElementById('timelinePanel');
  if (!panel) return;

  if (!currentChallenge) {
    panel.innerHTML = `<div class="tl-empty">No active challenge found.</div>`;
    return;
  }

  // Show loading state immediately
  panel.innerHTML = `<div class="tl-empty">Loading calendar…</div>`;

  const { name, start_date, total_days, goal_amount, id: challengeId } = currentChallenge;

  // ── Fetch revenue data ──
  const revenueMap = {}; // "YYYY-MM-DD" → total_amount (number)

  if (supabaseClient && challengeId) {
    const { data: revRows } = await supabaseClient
      .from('daily_revenue')
      .select('revenue_date, total_amount')
      .eq('challenge_id', challengeId);

    if (revRows) {
      revRows.forEach(row => {
        revenueMap[row.revenue_date] = parseFloat(row.total_amount) || 0;
      });
    }
  }

  // ── Dates ──
  const start = new Date(start_date + 'T00:00:00'); // local midnight
  const end   = new Date(start);
  end.setDate(end.getDate() + total_days - 1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rawDay     = Math.floor((today - start) / 86400000) + 1;
  const currentDay = Math.max(1, Math.min(rawDay, total_days));
  const isActive   = today >= start && today <= end;
  const isFinished = today > end;
  const isPending  = today < start;

  function fmt(d) {
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  // ── Build calendar grid ──
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // rewind to Sunday

  const gridEnd = new Date(end);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay())); // advance to Saturday

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

  // ── Status badge ──
  let statusBadge = '';
  if (isPending)       statusBadge = `<span class="tl-badge tl-badge-pending">Starts in ${Math.ceil((start - today) / 86400000)} days</span>`;
  else if (isFinished) statusBadge = `<span class="tl-badge tl-badge-done">Completed</span>`;
  else                 statusBadge = `<span class="tl-badge tl-badge-active">Day ${currentDay} of ${total_days}</span>`;

  // ── Revenue summary stats ──
  const totalEarned   = Object.values(revenueMap).reduce((s, v) => s + v, 0);
  const greenDays     = Object.values(revenueMap).filter(v => v > 0).length;
  const pastDaysCount = isActive ? currentDay - 1 : (isFinished ? total_days : 0);
  const redDays       = Math.max(0, pastDaysCount - greenDays);

  // ── Calendar cell renderer ──
  const renderCell = (d) => {
    const chalDay     = challengeDayFor(d);
    const dateKey     = toDateKey(d);
    const isToday     = d.getTime() === today.getTime();
    const inChallenge = chalDay !== null;
    const isPastDay   = inChallenge && d < today;
    const isFutureDay = inChallenge && d > today;
    const isOutside   = !inChallenge;

    const amount      = revenueMap[dateKey]; // undefined if no record
    const hasRevenue  = inChallenge && amount !== undefined && amount > 0;
    const isRedDay    = isPastDay && (amount === undefined || amount === 0);

    let cls = 'tl-cal-cell';
    if (isOutside)   cls += ' tl-outside';
    if (isToday)     cls += ' tl-today';
    if (isPastDay)   cls += ' tl-past';
    if (isFutureDay) cls += ' tl-future';
    if (inChallenge && !isToday) cls += ' tl-in-challenge';
    if (hasRevenue)  cls += ' tl-has-revenue';
    if (isRedDay)    cls += ' tl-zero-day';

    let revenueHTML = '';
    if (hasRevenue) {
      const formatted = amount >= 1000
        ? `$${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k`
        : `$${amount.toLocaleString()}`;
      revenueHTML = `<div class="tl-rev tl-rev-green">${formatted}</div>`;
    } else if (isRedDay) {
      revenueHTML = `<div class="tl-rev tl-rev-red">$0</div>`;
    }

    return `
      <div class="${cls}">
        <div class="tl-cal-date">${d.getDate()}</div>
        ${inChallenge ? `<div class="tl-cal-challenge-day">Day ${chalDay}</div>` : ''}
        ${revenueHTML}
        ${isToday ? `<div class="tl-today-pip"></div>` : ''}
      </div>
    `;
  };

  // ── Render ──
  panel.innerHTML = `
    <div class="tl-wrap">

      <!-- Hero header -->
      <div class="tl-hero">
        <div class="tl-hero-left">
          <div class="tl-title">${name || 'Challenge Timeline'}</div>
          <div class="tl-dates">${fmt(start)} → ${fmt(end)}</div>
        </div>
        <div class="tl-hero-right">
          ${statusBadge}
        </div>
      </div>

      <!-- Stat row -->
      <div class="tl-stats">
        <div class="tl-stat">
          <div class="tl-stat-val">${fmt(start)}</div>
          <div class="tl-stat-label">Start Date</div>
        </div>
        <div class="tl-stat-divider"></div>
        <div class="tl-stat">
          <div class="tl-stat-val">${fmt(today)}</div>
          <div class="tl-stat-label">Today · ${isActive ? `Day ${currentDay} of ${total_days}` : (isPending ? 'Not started' : 'Challenge over')}</div>
        </div>
        <div class="tl-stat-divider"></div>
        <div class="tl-stat">
          <div class="tl-stat-val">${fmt(end)}</div>
          <div class="tl-stat-label">End Date</div>
        </div>
        <div class="tl-stat-divider"></div>
        <div class="tl-stat">
          <div class="tl-stat-val tl-stat-green">$${totalEarned.toLocaleString()}</div>
          <div class="tl-stat-label">Total Earned · ${greenDays} green day${greenDays !== 1 ? 's' : ''}</div>
        </div>
        <div class="tl-stat-divider"></div>
        <div class="tl-stat">
          <div class="tl-stat-val ${redDays > 0 ? 'tl-stat-red' : ''}">${redDays}</div>
          <div class="tl-stat-label">Zero-revenue day${redDays !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <!-- Challenge timeline progress bar -->
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

      <!-- Calendar grid -->
      <div class="tl-calendar">
        <div class="tl-cal-header">
          ${DAY_NAMES.map(d => `<div class="tl-cal-day-name">${d}</div>`).join('')}
        </div>
        <div class="tl-cal-grid">
          ${cells.map(renderCell).join('')}
        </div>
      </div>

      <!-- Legend -->
      <div class="tl-legend">
        <div class="tl-legend-item">
          <div class="tl-legend-dot tl-legend-green"></div>
          <span>Revenue earned</span>
        </div>
        <div class="tl-legend-item">
          <div class="tl-legend-dot tl-legend-red"></div>
          <span>No revenue (past day)</span>
        </div>
        <div class="tl-legend-item">
          <div class="tl-legend-dot tl-legend-future"></div>
          <span>Future day</span>
        </div>
        <div class="tl-legend-item">
          <div class="tl-legend-dot tl-legend-today"></div>
          <span>Today</span>
        </div>
      </div>

      <div class="tl-month-label">
        ${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}
        ${start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()
          ? ` — ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}` : ''}
      </div>

    </div>
  `;
}
