// src/main.js
import { loadDatabaseConfig, saveDatabaseConfig, initSupabase, supabaseClient } from './supabase.js';
import { handleAuth, handleLogout, toggleAuthMode, showError } from './auth.js';
import { loadUserChallenge, unsubscribeFromRealtime } from './dashboard.js';
import { setupDevPanelTrigger, closeDevPanel } from './dev-panel.js';

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
  setupDevPanelTrigger();
});

function setupAuthListeners(client) {
  client.auth.onAuthStateChange((event, session) => {
    if (session) {
      document.getElementById('authContainer').style.display = 'none';
      document.getElementById('dashboard').style.display = 'grid';
      loadUserChallenge(session.user.id);
    } else {
      document.getElementById('authContainer').style.display = 'flex';
      document.getElementById('dashboard').style.display = 'none';
      unsubscribeFromRealtime();
      closeDevPanel();
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

// Bind HTML events to module handlers
window.toggleSetupPanel = toggleSetupPanel;
window.saveDatabaseConfig = handleDatabaseSetupSave;
window.toggleAuthMode = toggleAuthMode;
window.handleLogout = handleLogout;
window.handleAuth = (event) => handleAuth(event, () => {});
