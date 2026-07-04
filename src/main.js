// src/main.js
import { loadDatabaseConfig, saveDatabaseConfig, initSupabase, supabaseClient } from './supabase.js';
import { handleAuth, handleLogout, toggleAuthMode, showError } from './auth.js';
import { loadUserChallenge, unsubscribeFromRealtime } from './dashboard.js';
import { toggleDashboardSound, updateSoundButtonUI } from './dashboard-celebration.js';
import './countdown.js'; // start the daily mission countdown timer

// ─── CLOCK UPDATE ───
function updateClock() {
  const now = new Date();
  const clockEl = document.getElementById('clock');
  if (clockEl) {
    clockEl.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  }
}

// ─── INITIALIZATION ───
document.addEventListener('DOMContentLoaded', () => {
  // Load configuration and bootstrap supabase
  const client = loadDatabaseConfig();
  if (client) {
    setupAuthListeners(client);
  } else {
    // Show credentials setup panel by default
    const setupPanel = document.getElementById('setupPanel');
    if (setupPanel) setupPanel.style.display = 'block';
  }

  updateClock();
  setInterval(updateClock, 1000);
});

function setupAuthListeners(client) {
  client.auth.onAuthStateChange((event, session) => {
    if (session) {
      document.getElementById('authContainer').style.display = 'none';
      document.getElementById('dashboard').style.display = 'grid';
      loadUserChallenge(session.user.id);
      updateSoundButtonUI();
    } else {
      document.getElementById('authContainer').style.display = 'flex';
      document.getElementById('dashboard').style.display = 'none';
      unsubscribeFromRealtime();
    }
  });
}

function handleDatabaseSetupSave() {
  const url = document.getElementById('supabaseUrl').value.trim();
  const key = document.getElementById('supabaseKey').value.trim();

  if (!url || !key) {
    showError("Please enter both the Supabase Project URL and Anon Key.");
    return;
  }

  const client = saveDatabaseConfig(url, key);
  if (client) {
    setupAuthListeners(client);
    document.getElementById('setupPanel').style.display = 'none';
    showError("Configuration saved successfully.", "success");
  } else {
    showError("Could not connect to Supabase. Check credentials.");
  }
}

function toggleSetupPanel() {
  const panel = document.getElementById('setupPanel');
  if (panel) {
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  }
}

export function switchViewTab(tabName) {
  const scoreboardBtn  = document.getElementById('btnScoreboardTab');
  const leadsBtn       = document.getElementById('btnLeadsTab');
  const timelineBtn    = document.getElementById('btnTimelineTab');
  const scoreboardMain = document.getElementById('mainScoreboard');
  const scoreboardFooter = document.getElementById('footerScoreboard');
  const leadsPanel     = document.getElementById('leadsPanel');
  const timelinePanel  = document.getElementById('timelinePanel');

  const TAB_STYLE_ACTIVE   = { color: 'var(--text-primary)', borderBottomColor: 'var(--accent)' };
  const TAB_STYLE_INACTIVE = { color: 'var(--text-muted)',   borderBottomColor: 'transparent' };

  const applyTabStyle = (btn, active) => {
    if (!btn) return;
    btn.style.color = active ? TAB_STYLE_ACTIVE.color : TAB_STYLE_INACTIVE.color;
    btn.style.borderBottomColor = active ? TAB_STYLE_ACTIVE.borderBottomColor : TAB_STYLE_INACTIVE.borderBottomColor;
  };

  // Reset all tabs first
  applyTabStyle(scoreboardBtn,  tabName === 'scoreboard');
  applyTabStyle(leadsBtn,       tabName === 'leads');
  applyTabStyle(timelineBtn,    tabName === 'timeline');

  // Show/hide panels
  if (scoreboardMain)   scoreboardMain.style.display   = tabName === 'scoreboard' ? 'grid'  : 'none';
  if (scoreboardFooter) scoreboardFooter.style.display  = tabName === 'scoreboard' ? 'block' : 'none';
  if (leadsPanel)       leadsPanel.style.display        = tabName === 'leads'      ? 'block' : 'none';
  if (timelinePanel)    timelinePanel.style.display     = tabName === 'timeline'   ? 'block' : 'none';

  // Lazy-load content
  if (tabName === 'leads') {
    import('./leads.js').then(m => m.fetchAndRenderLeads());
  }
  if (tabName === 'timeline') {
    import('./timeline.js').then(m => m.renderTimeline());
  }
}

// Bind HTML events to module handlers
window.toggleSetupPanel = toggleSetupPanel;
window.saveDatabaseConfig = handleDatabaseSetupSave;
window.toggleAuthMode = toggleAuthMode;
window.handleLogout = handleLogout;
window.handleAuth = (event) => handleAuth(event, () => {});
window.switchViewTab = switchViewTab;
window.toggleDashboardSound = toggleDashboardSound;
