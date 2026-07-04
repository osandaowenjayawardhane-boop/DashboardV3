// src/main.js
import { loadDatabaseConfig, saveDatabaseConfig, initSupabase, supabaseClient } from './supabase.js';
import { handleAuth, handleLogout, toggleAuthMode, showError } from './auth.js';
import { loadUserChallenge, unsubscribeFromRealtime } from './dashboard.js';
import { toggleDashboardSound, updateSoundButtonUI } from './dashboard-celebration.js';

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
  const scoreboardBtn = document.getElementById('btnScoreboardTab');
  const leadsBtn = document.getElementById('btnLeadsTab');
  const scoreboardMain = document.getElementById('mainScoreboard');
  const scoreboardFooter = document.getElementById('footerScoreboard');
  const leadsPanel = document.getElementById('leadsPanel');
  
  if (tabName === 'scoreboard') {
    if (scoreboardBtn) {
      scoreboardBtn.style.color = 'var(--text-primary)';
      scoreboardBtn.style.borderBottomColor = 'var(--accent)';
    }
    if (leadsBtn) {
      leadsBtn.style.color = 'var(--text-muted)';
      leadsBtn.style.borderBottomColor = 'transparent';
    }
    if (scoreboardMain) scoreboardMain.style.display = 'grid';
    if (scoreboardFooter) scoreboardFooter.style.display = 'block';
    if (leadsPanel) leadsPanel.style.display = 'none';
  } else {
    if (scoreboardBtn) {
      scoreboardBtn.style.color = 'var(--text-muted)';
      scoreboardBtn.style.borderBottomColor = 'transparent';
    }
    if (leadsBtn) {
      leadsBtn.style.color = 'var(--text-primary)';
      leadsBtn.style.borderBottomColor = 'var(--accent)';
    }
    if (scoreboardMain) scoreboardMain.style.display = 'none';
    if (scoreboardFooter) scoreboardFooter.style.display = 'none';
    if (leadsPanel) leadsPanel.style.display = 'block';
    
    // Import dynamically to avoid eager circular dependencies
    import('./leads.js').then(m => m.fetchAndRenderLeads());
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
