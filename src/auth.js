// src/auth.js
import { supabaseClient } from './supabase.js';

export let authMode = "signin"; // signin or signup

export function toggleAuthMode() {
  authMode = authMode === "signin" ? "signup" : "signin";
  document.getElementById('authTitle').textContent = authMode === "signin" ? "Sign In to Mission Control" : "Create Mission Account";
  document.getElementById('submitAuthBtn').textContent = authMode === "signin" ? "Sign In" : "Register Challenge Account";
  document.getElementById('switchAuthModeText').textContent = authMode === "signin" ? "Create New Account" : "Sign In with Existing Account";
}

export function showError(msg, type = "error") {
  const el = document.getElementById('authError');
  if (el) {
    el.textContent = msg;
    el.style.color = type === "error" ? "var(--coral-100)" : "var(--accent)";
  }
}

export async function handleAuth(event, onAuthSuccess) {
  event.preventDefault();
  showError("");

  if (!supabaseClient) {
    showError("Configure your Supabase database first using the gear icon.");
    return;
  }

  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;

  try {
    if (authMode === "signin") {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      
      if (data && data.user) {
        showError("Sign up successful. Setting up default challenge context...", "success");
        await initUserChallenge(data.user.id);
      }
    }
  } catch (err) {
    showError(err.message);
  }
}

export async function handleLogout() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
}

export async function initUserChallenge(userId) {
  try {
    const { data: chal, error: chalErr } = await supabaseClient
      .from('challenge')
      .insert({
        user_id: userId,
        name: "The $8K Challenge",
        goal_amount: 8000,
        total_days: 28,
        start_date: new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (chalErr) throw chalErr;
    await ensureTodayActivity(userId, chal.id);
  } catch (err) {
    showError("Setup error: " + err.message);
  }
}

export async function ensureTodayActivity(userId, challengeId) {
  const todayStr = new Date().toISOString().split('T')[0];
  try {
    const { data, error } = await supabaseClient
      .from('daily_activity')
      .select('id')
      .eq('challenge_id', challengeId)
      .eq('activity_date', todayStr);

    if (error) throw error;

    if (!data || data.length === 0) {
      const { error: insertErr } = await supabaseClient
        .from('daily_activity')
        .insert({
          user_id: userId,
          challenge_id: challengeId,
          activity_date: todayStr,
          cold_calls: 0,
          cold_dms: 0,
          follow_ups: 0,
          content_posted: 0
        });
      if (insertErr) throw insertErr;
    }
  } catch (err) {
    console.error("Error ensuring today's daily activity:", err.message);
  }
}
