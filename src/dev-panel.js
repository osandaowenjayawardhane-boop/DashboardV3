// src/dev-panel.js
import { supabaseClient } from './supabase.js';
import { currentChallenge, fetchAndRenderDashboard } from './dashboard.js';

// ─── DEV PANEL TRIGGER & TOGGLES ───
export function setupDevPanelTrigger() {
  const isDevMode = new URLSearchParams(window.location.search).get('dev') === '1';
  const trigger = document.getElementById('devPanelTrigger');
  if (trigger) {
    if (isDevMode) {
      trigger.style.display = 'flex';
    } else {
      trigger.style.display = 'none';
    }
  }
}

export function toggleDevPanel() {
  const panel = document.getElementById('devPanel');
  if (panel && currentChallenge) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }
}

export function closeDevPanel() {
  const panel = document.getElementById('devPanel');
  if (panel) panel.style.display = 'none';
}

// ─── DATA WRITE HELPER FUNCTIONS ───
export async function incrementActivityField(field) {
  if (!supabaseClient || !currentChallenge) return;
  const todayStr = new Date().toISOString().split('T')[0];
  try {
    const { data, error } = await supabaseClient
      .from('daily_activity')
      .select(`id, ${field}`)
      .eq('challenge_id', currentChallenge.id)
      .eq('activity_date', todayStr);

    if (error) throw error;

    if (data && data.length > 0) {
      const record = data[0];
      const newVal = (record[field] || 0) + 1;
      const { error: updateErr } = await supabaseClient
        .from('daily_activity')
        .update({ [field]: newVal })
        .eq('id', record.id);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabaseClient
        .from('daily_activity')
        .insert({
          user_id: currentChallenge.user_id,
          challenge_id: currentChallenge.id,
          activity_date: todayStr,
          [field]: 1
        });
      if (insertErr) throw insertErr;
    }
    await fetchAndRenderDashboard();
  } catch (err) {
    console.error(`Error incrementing ${field}:`, err.message);
  }
}

export async function incrementColdCalls() {
  await incrementActivityField('cold_calls');
}

export async function incrementColdDMs() {
  await incrementActivityField('cold_dms');
}

export async function incrementFollowUps() {
  await incrementActivityField('follow_ups');
}

export async function incrementContentPosted() {
  await incrementActivityField('content_posted');
}

export async function addSale(amount, units = 1) {
  if (!supabaseClient || !currentChallenge) return;
  const todayStr = new Date().toISOString().split('T')[0];
  try {
    const rows = [];
    const unitAmount = amount / units;
    for (let i = 0; i < units; i++) {
      rows.push({
        user_id: currentChallenge.user_id,
        challenge_id: currentChallenge.id,
        amount: unitAmount,
        revenue_date: todayStr
      });
    }

    const { error } = await supabaseClient
      .from('revenue')
      .insert(rows);

    if (error) throw error;
    await fetchAndRenderDashboard();
  } catch (err) {
    console.error("Error adding sale:", err.message);
  }
}

export async function createLead(source) {
  if (!supabaseClient || !currentChallenge) return;
  const initialStage = source === 'cold_call' ? 'Dialed' : 'Sent';
  try {
    const { data, error } = await supabaseClient
      .from('lead')
      .insert({
        user_id: currentChallenge.user_id,
        challenge_id: currentChallenge.id,
        source: source,
        pipeline_stage: initialStage
      })
      .select();

    if (error) throw error;
    await fetchAndRenderDashboard();
    return data;
  } catch (err) {
    console.error("Error creating lead:", err.message);
  }
}

export async function updateLeadStage(leadId, newStage) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient
      .from('lead')
      .update({ pipeline_stage: newStage })
      .eq('id', leadId);

    if (error) throw error;
    await fetchAndRenderDashboard();
  } catch (err) {
    console.error("Error updating lead stage:", err.message);
  }
}

// ─── DEVELOPER PANEL SIMULATORS ───
export async function devAddColdCall() {
  await incrementColdCalls();
  await createLead('cold_call');
}

export async function devAddColdDm() {
  await incrementColdDMs();
  await createLead('cold_dm');
}

export async function devMoveCallStage(fromStage, toStage) {
  if (!supabaseClient || !currentChallenge) return;
  try {
    const { data, error } = await supabaseClient
      .from('lead')
      .select('id')
      .eq('challenge_id', currentChallenge.id)
      .eq('source', 'cold_call')
      .eq('pipeline_stage', fromStage)
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) throw error;
    if (data && data.length > 0) {
      await updateLeadStage(data[0].id, toStage);
    } else {
      console.log(`No active calls leads found in stage: ${fromStage}`);
    }
  } catch (err) {
    console.error("Error advancing call lead stage:", err.message);
  }
}

export async function devMoveDmStage(fromStage, toStage) {
  if (!supabaseClient || !currentChallenge) return;
  try {
    const { data, error } = await supabaseClient
      .from('lead')
      .select('id')
      .eq('challenge_id', currentChallenge.id)
      .eq('source', 'cold_dm')
      .eq('pipeline_stage', fromStage)
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) throw error;
    if (data && data.length > 0) {
      await updateLeadStage(data[0].id, toStage);
    } else {
      console.log(`No active DMs leads found in stage: ${fromStage}`);
    }
  } catch (err) {
    console.error("Error advancing DM lead stage:", err.message);
  }
}

export async function devAddFollowUp() {
  await incrementFollowUps();
}

export async function devAddContent() {
  await incrementContentPosted();
}

export async function devAddSale() {
  await addSale(100, 1);
  try {
    // Find a lead to close
    const { data, error } = await supabaseClient
      .from('lead')
      .select('id, source')
      .eq('challenge_id', currentChallenge.id)
      .neq('pipeline_stage', 'Closed')
      .limit(1);
    
    if (!error && data && data.length > 0) {
      await updateLeadStage(data[0].id, 'Closed');
    } else {
      const randomSource = Math.random() > 0.5 ? 'cold_call' : 'cold_dm';
      await supabaseClient
        .from('lead')
        .insert({
          user_id: currentChallenge.user_id,
          challenge_id: currentChallenge.id,
          source: randomSource,
          pipeline_stage: 'Closed'
        });
    }
  } catch (e) {
    console.error(e);
  }
}

export async function devResetToday() {
  if (!supabaseClient || !currentChallenge) return;
  const todayStr = new Date().toISOString().split('T')[0];
  const startOfToday = todayStr + 'T00:00:00.000Z';
  try {
    // 1. Reset daily activity counts
    const { error: actErr } = await supabaseClient
      .from('daily_activity')
      .update({
        cold_calls: 0,
        cold_dms: 0,
        follow_ups: 0,
        content_posted: 0
      })
      .eq('challenge_id', currentChallenge.id)
      .eq('activity_date', todayStr);

    if (actErr) throw actErr;

    // 2. Delete today's revenue entries
    const { error: revErr } = await supabaseClient
      .from('revenue')
      .delete()
      .eq('challenge_id', currentChallenge.id)
      .eq('revenue_date', todayStr);

    if (revErr) throw revErr;

    // 3. Delete today's leads
    const { error: leadErr } = await supabaseClient
      .from('lead')
      .delete()
      .eq('challenge_id', currentChallenge.id)
      .gte('created_at', startOfToday);

    if (leadErr) throw leadErr;

    // Refresh calculations and tables immediately
    await fetchAndRenderDashboard();
  } catch (err) {
    console.error("Error resetting today's data:", err.message);
  }
}

// Bind to window to allow HTML onclick bindings
window.devAddColdCall = devAddColdCall;
window.devAddColdDm = devAddColdDm;
window.devMoveCallStage = devMoveCallStage;
window.devMoveDmStage = devMoveDmStage;
window.devAddFollowUp = devAddFollowUp;
window.devAddContent = devAddContent;
window.devAddSale = devAddSale;
window.devResetToday = devResetToday;
window.closeDevPanel = closeDevPanel;
window.toggleDevPanel = toggleDevPanel;
