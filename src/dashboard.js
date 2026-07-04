// src/dashboard.js
import { supabaseClient } from './supabase.js';
import { triggerCelebration } from './dashboard-celebration.js';

export let currentChallenge = null;
let realtimeSubscription = null;

export async function loadUserChallenge(userId) {
  try {
    const { data, error } = await supabaseClient
      .from('challenge')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return false;
    }

    currentChallenge = data[0];
    
    // Render base parameters
    document.getElementById('progressGoal').textContent = '$' + currentChallenge.goal_amount.toLocaleString();
    document.getElementById('goalProgressLimit').textContent = '$' + currentChallenge.goal_amount.toLocaleString();
    
    // Run full layout update
    await fetchAndRenderDashboard();

    // Subscribe to changes in database to keep dashboard in perfect realtime sync
    subscribeToRealtime(userId, currentChallenge.id);
    return true;
  } catch (err) {
    console.error("Failed to load user challenge parameters:", err.message);
    return false;
  }
}

export async function fetchAndRenderDashboard() {
  if (!supabaseClient || !currentChallenge) return;

  const chalId = currentChallenge.id;
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    // 1. Departures - Today Activity (Calculated directly from lead records created/updated today)
    const startOfToday = todayStr + 'T00:00:00.000Z';
    const { data: todayLeads, error: todayLeadsErr } = await supabaseClient
      .from('lead')
      .select('source, created_at, updated_at')
      .eq('challenge_id', chalId)
      .or(`created_at.gte.${startOfToday},updated_at.gte.${startOfToday}`);

    let calls = 0;
    let dms = 0;
    let followUps = 0;
    let content = 0; // Hardcoded to 0 since content is not a lead record

    if (!todayLeadsErr && todayLeads) {
      todayLeads.forEach(l => {
        const createdDateStr = l.created_at ? l.created_at.split('T')[0] : '';
        const updatedDateStr = l.updated_at ? l.updated_at.split('T')[0] : '';

        // If created today, count as Call or DM action
        if (createdDateStr === todayStr) {
          if (l.source === 'cold_call') {
            calls++;
          } else if (l.source === 'cold_dm') {
            dms++;
          }
        }
        
        // If updated today but created before today, count as follow-up action
        if (updatedDateStr === todayStr && createdDateStr !== todayStr) {
          followUps++;
        }
      });
    }

    const totalActions = calls + dms + followUps + content;

    // Render Departures Today UI
    updateMetric('depCallsCount', 'depCallsBar', calls, 50);
    updateMetric('depDmsCount', 'depDmsBar', dms, 100);
    updateMetric('depFollowupsCount', 'depFollowupsBar', followUps, 30);
    updateMetric('depContentCount', 'depContentBar', content, 5);
    animateValue(document.getElementById('depTotalCount'), 0, totalActions, 600);

    // 2. Pipeline Network SVG Nodes
    const { data: leads, error: leadErr } = await supabaseClient
      .from('lead')
      .select('source, pipeline_stage')
      .eq('challenge_id', chalId);

    let stageCounts = {
      cold_call: { Dialed: 0, "Picked Up": 0, Booked: 0, Showed: 0, "Closed Won": 0 },
      cold_dm: { Sent: 0, Replied: 0, Booked: 0, Showed: 0, "Closed Won": 0 }
    };

    if (!leadErr && leads) {
      leads.forEach(l => {
        if (stageCounts[l.source] && stageCounts[l.source][l.pipeline_stage] !== undefined) {
          stageCounts[l.source][l.pipeline_stage]++;
        }
      });
    }

    // Calculate cumulative funnel counts
    let pipelineCounts = {
      cold_call: { Dialed: 0, "Picked Up": 0, Booked: 0, Showed: 0, "Closed Won": 0 },
      cold_dm: { Sent: 0, Replied: 0, Booked: 0, Showed: 0, "Closed Won": 0 }
    };

    // Cold Call funnel order: Dialed -> Picked Up -> Booked -> Showed -> Closed Won
    pipelineCounts.cold_call["Closed Won"] = stageCounts.cold_call["Closed Won"];
    pipelineCounts.cold_call.Showed = stageCounts.cold_call.Showed + pipelineCounts.cold_call["Closed Won"];
    pipelineCounts.cold_call.Booked = stageCounts.cold_call.Booked + pipelineCounts.cold_call.Showed;
    pipelineCounts.cold_call["Picked Up"] = stageCounts.cold_call["Picked Up"] + pipelineCounts.cold_call.Booked;
    pipelineCounts.cold_call.Dialed = stageCounts.cold_call.Dialed + pipelineCounts.cold_call["Picked Up"];

    // Cold DM funnel order: Sent -> Replied -> Booked -> Showed -> Closed Won
    pipelineCounts.cold_dm["Closed Won"] = stageCounts.cold_dm["Closed Won"];
    pipelineCounts.cold_dm.Showed = stageCounts.cold_dm.Showed + pipelineCounts.cold_dm["Closed Won"];
    pipelineCounts.cold_dm.Booked = stageCounts.cold_dm.Booked + pipelineCounts.cold_dm.Showed;
    pipelineCounts.cold_dm.Replied = stageCounts.cold_dm.Replied + pipelineCounts.cold_dm.Booked;
    pipelineCounts.cold_dm.Sent = stageCounts.cold_dm.Sent + pipelineCounts.cold_dm.Replied;

    // Render station texts
    document.getElementById('stageCallsDialed').textContent = pipelineCounts.cold_call.Dialed;
    document.getElementById('stageCallsPickedUp').textContent = pipelineCounts.cold_call["Picked Up"];
    document.getElementById('stageCallsBooked').textContent = pipelineCounts.cold_call.Booked;
    document.getElementById('stageCallsShowed').textContent = pipelineCounts.cold_call.Showed;
    document.getElementById('stageCallsClosed').textContent = pipelineCounts.cold_call["Closed Won"];

    document.getElementById('stageDmsSent').textContent = pipelineCounts.cold_dm.Sent;
    document.getElementById('stageDmsReplied').textContent = pipelineCounts.cold_dm.Replied;
    document.getElementById('stageDmsBooked').textContent = pipelineCounts.cold_dm.Booked;
    document.getElementById('stageDmsShowed').textContent = pipelineCounts.cold_dm.Showed;
    document.getElementById('stageDmsClosed').textContent = pipelineCounts.cold_dm["Closed Won"];

    // 3. Revenue Terminal Metrics
    const { data: revList, error: revErr } = await supabaseClient
      .from('revenue')
      .select('amount, revenue_date')
      .eq('challenge_id', chalId);

    let totalRevenue = 0;
    let todayRevenue = 0;
    let totalUnits = 0;
    let todayUnits = 0;

    if (!revErr && revList) {
      totalUnits = revList.length;
      revList.forEach(r => {
        const amount = parseFloat(r.amount) || 0;
        totalRevenue += amount;
        if (r.revenue_date === todayStr) {
          todayRevenue += amount;
          todayUnits++;
        }
      });
    }

    // Render Revenue Terminal UI
    animateValue(document.getElementById('revTotal'), 0, totalRevenue, 800, '$');
    animateValue(document.getElementById('revToday'), 0, todayRevenue, 600, '$');
    animateValue(document.getElementById('unitsTotal'), 0, totalUnits, 600);
    animateValue(document.getElementById('unitsToday'), 0, todayUnits, 400);

    // Header Metrics & Progress bar updates
    animateValue(document.getElementById('progressCurrent'), 0, totalRevenue, 800, '$');
    const goal = currentChallenge.goal_amount || 8000;
    const progressPct = ((totalRevenue / goal) * 100).toFixed(1);

    const progressFill = document.getElementById('progressFill');
    const goalFill = document.getElementById('goalFill');

    if (progressFill) {
      progressFill.style.width = Math.min(progressPct, 100) + '%';
      progressFill.classList.remove('at-goal', 'over-goal');
      if (parseFloat(progressPct) > 100) {
        progressFill.classList.add('over-goal');
      } else if (parseFloat(progressPct) === 100) {
        progressFill.classList.add('at-goal');
      }
    }

    if (goalFill) {
      goalFill.style.width = Math.min(progressPct, 100) + '%';
      goalFill.classList.remove('at-goal', 'over-goal');
      if (parseFloat(progressPct) > 100) {
        goalFill.classList.add('over-goal');
      } else if (parseFloat(progressPct) === 100) {
        goalFill.classList.add('at-goal');
      }
    }

    document.getElementById('goalPct').textContent = progressPct + '%';
    document.getElementById('headerPct').textContent = progressPct + '%';

    // Day Counter calculation
    const startDate = new Date(currentChallenge.start_date);
    const todayDate = new Date(todayStr);
    const dayDiff = Math.floor((todayDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const currentChallengeDay = Math.min(Math.max(dayDiff, 1), currentChallenge.total_days);
    document.getElementById('dayCounter').innerHTML = `DAY <strong>${currentChallengeDay}</strong> / ${currentChallenge.total_days}`;
    document.getElementById('statChallengeDay').textContent = currentChallenge.total_days;

    // 4. 28-Day Revenue History Heatmap/Calendar
    const { data: dailyRevList, error: dailyRevErr } = await supabaseClient
      .from('daily_revenue')
      .select('revenue_date, total_amount')
      .eq('challenge_id', chalId)
      .order('revenue_date', { ascending: true });

    // Map daily revenue to correct day of the challenge
    let dailyAmounts = new Array(currentChallenge.total_days).fill(0);
    if (!dailyRevErr && dailyRevList) {
      dailyRevList.forEach(dr => {
        const drDate = new Date(dr.revenue_date);
        const offset = Math.floor((drDate - startDate) / (1000 * 60 * 60 * 24));
        if (offset >= 0 && offset < currentChallenge.total_days) {
          dailyAmounts[offset] = parseFloat(dr.total_amount) || 0;
        }
      });
    }

    renderHistoryGrid(dailyAmounts, currentChallengeDay);

  } catch (err) {
    console.error("Error refreshing dashboard stats:", err.message);
  }
}

function updateMetric(countId, barId, value, goal) {
  const countEl = document.getElementById(countId);
  const barEl = document.getElementById(barId);
  animateValue(countEl, 0, value, 600);
  const pct = Math.min((value / goal) * 100, 100);
  barEl.style.width = pct + '%';
}

function renderHistoryGrid(dailyAmounts, currentDay) {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = ''; // reset previous state

  const maxRev = Math.max(...dailyAmounts, 1);
  let bestDay = 0;
  let activeDaysCount = 0;
  let totalSum = 0;

  for (let i = 0; i < dailyAmounts.length; i++) {
    const rev = dailyAmounts[i];
    if (rev > bestDay) bestDay = rev;
    if (rev > 0) activeDaysCount++;
    totalSum += rev;

    const day = document.createElement('div');
    day.className = 'calendar-day' + (i === currentDay - 1 ? ' is-today' : '');

    const barWrapper = document.createElement('div');
    barWrapper.className = 'calendar-bar-wrapper';
    const bar = document.createElement('div');
    bar.className = 'calendar-bar';

    if (i < currentDay) {
      if (rev > 0) {
        bar.style.height = Math.max((rev / maxRev) * 100, 8) + '%';
        bar.classList.add('has-revenue');
        if (i === currentDay - 1) bar.classList.add('today-bar');
        
        const tooltip = document.createElement('div');
        tooltip.className = 'calendar-tooltip';
        tooltip.textContent = '$' + rev.toLocaleString();
        day.appendChild(tooltip);
      } else {
        bar.classList.add('zero');
      }
    } else {
      bar.classList.add('future');
    }

    barWrapper.appendChild(bar);
    day.appendChild(barWrapper);
    const label = document.createElement('div');
    label.className = 'calendar-day-label';
    label.textContent = i + 1;
    day.appendChild(label);
    grid.appendChild(day);
  }

  // Update calendar text labels
  document.getElementById('statBestDay').textContent = '$' + bestDay.toLocaleString();
  const avg = activeDaysCount > 0 ? Math.round(totalSum / activeDaysCount) : 0;
  document.getElementById('statAvgDay').textContent = '$' + avg.toLocaleString();
  document.getElementById('statActiveDays').textContent = activeDaysCount;
}

// ─── REALTIME DATABASE LISTENERS ───
export function subscribeToRealtime(userId, challengeId) {
  if (!supabaseClient) return;

  unsubscribeFromRealtime();

  realtimeSubscription = supabaseClient.channel('live-mission-control')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge' }, () => {
      loadUserChallenge(userId);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lead' }, (payload) => {
      fetchAndRenderDashboard();
      // If the Leads directory panel is currently visible, refresh it too
      const leadsPanel = document.getElementById('leadsPanel');
      if (leadsPanel && leadsPanel.style.display !== 'none') {
        import('./leads.js').then(m => m.fetchAndRenderLeads());
      }

      // Trigger celebration if a lead is moved to Closed Won
      if (
        payload.eventType === 'UPDATE' &&
        payload.new &&
        payload.new.pipeline_stage === 'Closed Won' &&
        (!payload.old || payload.old.pipeline_stage !== 'Closed Won')
      ) {
        triggerCelebration();
      }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'revenue' }, (payload) => {
      fetchAndRenderDashboard();

      // Trigger celebration — REPLICA IDENTITY FULL ensures payload.new is always complete
      const amount = payload.new ? parseFloat(payload.new.amount) : 0;
      triggerCelebration(amount > 0 ? amount : undefined);
    });

  realtimeSubscription.subscribe((status) => {
    console.log("Supabase Realtime subscription status:", status);
  });
}

export function unsubscribeFromRealtime() {
  if (supabaseClient && realtimeSubscription) {
    supabaseClient.removeChannel(realtimeSubscription);
    realtimeSubscription = null;
  }
}

// ─── COUNT-UP ANIMATION ───
export function animateValue(el, start, end, duration, prefix = '', suffix = '') {
  if (!el) return;
  const startTime = performance.now();
  const update = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * eased);
    el.textContent = prefix + current.toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}
