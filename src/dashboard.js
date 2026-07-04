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
      .select('name, source, pipeline_stage, created_at')
      .eq('challenge_id', chalId)
      .order('created_at', { ascending: false });

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

    // Dynamic Waypoint Dots Positioning
    const progressDot = document.getElementById('progressDot');
    const goalDot = document.getElementById('goalDot');
    if (progressDot) progressDot.style.left = Math.min(progressPct, 100) + '%';
    if (goalDot) goalDot.style.left = Math.min(progressPct, 100) + '%';

    // Checkpoint Milestone Highlights
    const floatPct = parseFloat(progressPct) || 0;
    const p25 = document.getElementById('progressMilestone25');
    const p50 = document.getElementById('progressMilestone50');
    const p75 = document.getElementById('progressMilestone75');
    if (p25) p25.classList.toggle('active', floatPct >= 25);
    if (p50) p50.classList.toggle('active', floatPct >= 50);
    if (p75) p75.classList.toggle('active', floatPct >= 75);

    const g25 = document.getElementById('goalMilestone25');
    const g50 = document.getElementById('goalMilestone50');
    const g75 = document.getElementById('goalMilestone75');
    if (g25) g25.classList.toggle('active', floatPct >= 25);
    if (g50) g50.classList.toggle('active', floatPct >= 50);
    if (g75) g75.classList.toggle('active', floatPct >= 75);

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

    // ─── 5. Grind Metrics & Reward Visualizer updates ───
    const rewardName = localStorage.getItem('dashboard_reward_name') || "Tokyo Vacation";
    const dealPriceSetting = parseFloat(localStorage.getItem('dashboard_deal_price')) || 1500;
    const rewardImage = localStorage.getItem('dashboard_reward_image') || "";

    // Set reward name display
    const rewardNameDisplay = document.getElementById('rewardNameDisplay');
    if (rewardNameDisplay) rewardNameDisplay.textContent = rewardName;

    // Set reward image URL and blur filter based on progress ratio
    const rewardImageDisplay = document.getElementById('rewardImageDisplay');
    if (rewardImageDisplay) {
      // Use fallback default watch picture if they didn't set a URL
      const fallbackUrl = "https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=cover&q=80&w=600";
      rewardImageDisplay.src = rewardImage || fallbackUrl;
      
      const ratio = Math.min(totalRevenue / goal, 1);
      // Blur goes from 10px down to 0px, Grayscale from 100% (1) down to 0%, Brightness from 40% (0.4) up to 100% (1)
      const blurVal = (1 - ratio) * 10;
      const grayVal = (1 - ratio);
      const brightVal = 0.4 + (ratio * 0.6);
      rewardImageDisplay.style.filter = `grayscale(${grayVal}) blur(${blurVal}px) brightness(${brightVal})`;
    }

    // Set average deal price subheader
    const grindDealPrice = document.getElementById('grindDealPrice');
    if (grindDealPrice) grindDealPrice.textContent = `Item: $${dealPriceSetting.toLocaleString()}`;

    // Calculate close rate from manual settings
    const closeRateSetting = parseFloat(localStorage.getItem('dashboard_close_rate')) || 20;
    const closeRate = closeRateSetting / 100;
    const closeRatePct = closeRateSetting.toFixed(0);

    // Calculate remaining deals needed
    const remainingRev = Math.max(goal - totalRevenue, 0);
    const grindDealsText = document.getElementById('grindDealsText');

    if (grindDealsText) {
      if (remainingRev <= 0) {
        grindDealsText.innerHTML = `🎉 <span style="color: #10b981; font-weight: 700;">Goal Unlocked!</span> Enjoy your <strong style="color: var(--accent); font-family: 'Inter', sans-serif; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em;">${rewardName}</strong>! You've successfully conquered the challenge.`;
      } else {
        const dealsNeeded = Math.ceil(remainingRev / dealPriceSetting);
        const bookedNeeded = Math.ceil(dealsNeeded / closeRate);
        const dealPriceFormatted = dealPriceSetting.toLocaleString();
        
        grindDealsText.innerHTML = `You are <strong style="color: var(--accent); font-weight: 700;">${dealsNeeded} Closed Won deals</strong> (at $${dealPriceFormatted} each) away from unlocking your <strong style="color: var(--accent); font-family: 'Inter', sans-serif; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em;">${rewardName}</strong>. Based on your <strong style="color: var(--accent); font-weight: 700;">${closeRatePct}% closing rate</strong>, you need to book <strong style="color: var(--accent); font-weight: 700;">${bookedNeeded} meetings</strong> to secure them.`;
      }
    }

    // ─── Render Recent Activity Console Tab ───
    const consoleActivityBody = document.getElementById('consoleActivityBody');
    if (consoleActivityBody) {
      consoleActivityBody.innerHTML = '';
      if (leadErr || !leads || leads.length === 0) {
        consoleActivityBody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 16px; color: var(--text-dim); font-style: italic;">No leads in pipeline yet. Add your first call or DM!</td>
          </tr>
        `;
      } else {
        // Take only the 5 most recent leads
        const recentLeads = leads.slice(0, 5);
        recentLeads.forEach(l => {
          const dateObj = new Date(l.created_at);
          const dateFormatted = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
          
          const sourceText = l.source === 'cold_call' ? '📞 Call' : '💬 DM';
          const sourceColor = l.source === 'cold_call' ? 'var(--line-1)' : 'var(--accent)';
          
          const stageText = l.pipeline_stage;
          let stageClass = '';
          if (stageText === 'Closed Won') {
            stageClass = 'style="color: #10b981; font-weight: 700;"';
          } else if (stageText === 'Booked') {
            stageClass = 'style="color: var(--accent); font-weight: 700;"';
          } else if (stageText === 'Showed') {
            stageClass = 'style="color: var(--steelblue); font-weight: 700;"';
          }

          const nameText = l.name || 'Unnamed Lead';

          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
          tr.innerHTML = `
            <td style="padding: 6px; font-weight: 600; color: var(--text-primary); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${nameText}</td>
            <td style="padding: 6px; color: ${sourceColor}; font-weight: 600;">${sourceText}</td>
            <td style="padding: 6px;" ${stageClass}>${stageText}</td>
            <td style="padding: 6px; text-align: right; color: var(--text-dim); font-size: 10px;">${dateFormatted}</td>
          `;
          consoleActivityBody.appendChild(tr);
        });
      }
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

// Bind live update function globally
window.updateDashboardData = fetchAndRenderDashboard;
