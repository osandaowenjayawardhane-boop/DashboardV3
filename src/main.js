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
  // Load background
  initBackground();
  applyConsoleToggle();

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

// ─── BACKGROUND WALLPAPER CONFIGURATION ───
export function applyBackground(urlStr) {
  document.body.style.background = `linear-gradient(rgba(5, 5, 18, 0.60), rgba(5, 5, 18, 0.60)), url('${urlStr}') center center / cover no-repeat fixed`;
}

export function initBackground() {
  const preset = localStorage.getItem('dashboard_bg_preset') || 'default';
  const custom = localStorage.getItem('dashboard_bg_custom');

  if (custom) {
    applyBackground(custom);
  } else if (preset === 'user') {
    applyBackground('/bg-user.jpg');
  } else {
    applyBackground('/bg-default.jpg');
  }
}

export function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'flex';
  initRewardSettings();
}

export function closeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'none';
}

export function setBackgroundPreset(preset) {
  localStorage.setItem('dashboard_bg_preset', preset);
  localStorage.removeItem('dashboard_bg_custom');
  initBackground();
  showError(`Background set to ${preset === 'user' ? 'Personal Selfie' : 'Abstract Hex'}.`, "success");
}

export function removeCustomBackground() {
  localStorage.setItem('dashboard_bg_preset', 'default');
  localStorage.removeItem('dashboard_bg_custom');
  initBackground();
  showError("Background reset to default.", "success");
}

export function handleBackgroundUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showError("Image file must be under 5MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Compress & resize image to ensure it fits LocalStorage safely
      const maxDim = 1280;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // 0.75 quality JPEG produces high quality but compact base64 (~80kb)
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
      
      try {
        localStorage.setItem('dashboard_bg_custom', compressedDataUrl);
        localStorage.setItem('dashboard_bg_preset', 'custom');
        initBackground();
        showError("Custom background updated successfully.", "success");
      } catch (err) {
        console.error(err);
        showError("Failed to save image locally. Try a smaller image.");
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

export function applyConsoleToggle() {
  const show = localStorage.getItem('dashboard_show_console') !== 'false';
  const consolePanel = document.getElementById('consolePanel');
  const transitSection = document.querySelector('.transit-section');
  
  if (consolePanel && transitSection) {
    if (show) {
      consolePanel.style.display = 'flex';
      transitSection.style.height = '320px';
      transitSection.style.flex = '0 0 auto';
    } else {
      consolePanel.style.display = 'none';
      transitSection.style.height = '100%';
      transitSection.style.flex = '1 1 auto';
    }
  }
  
  const toggleSwitch = document.getElementById('toggleConsoleSwitch');
  if (toggleSwitch) toggleSwitch.checked = show;
}

export function saveRewardSettings() {
  const name = document.getElementById('rewardNameInput')?.value || "Tokyo Vacation";
  const price = parseFloat(document.getElementById('dealPriceInput')?.value) || 1500;
  const closeRate = parseFloat(document.getElementById('closeRateInput')?.value) || 20;
  const image = document.getElementById('rewardImageInput')?.value || "";
  const showConsole = document.getElementById('toggleConsoleSwitch')?.checked;

  localStorage.setItem('dashboard_reward_name', name);
  localStorage.setItem('dashboard_deal_price', price.toString());
  localStorage.setItem('dashboard_close_rate', closeRate.toString());
  localStorage.setItem('dashboard_reward_image', image);
  localStorage.setItem('dashboard_show_console', showConsole ? 'true' : 'false');

  applyConsoleToggle();

  // Trigger update to refresh display
  if (window.updateDashboardData) {
    window.updateDashboardData();
  }

  // Only close Settings modal if the change event was NOT triggered by the live toggle
  if (document.activeElement?.id !== 'toggleConsoleSwitch') {
    closeSettingsModal();
    showError("Reward settings saved successfully.", "success");
  }
}

export function initRewardSettings() {
  const name = localStorage.getItem('dashboard_reward_name') || "Tokyo Vacation";
  const price = localStorage.getItem('dashboard_deal_price') || "1500";
  const closeRate = localStorage.getItem('dashboard_close_rate') || "20";
  const image = localStorage.getItem('dashboard_reward_image') || "";
  const showConsole = localStorage.getItem('dashboard_show_console') !== 'false';

  if (document.getElementById('rewardNameInput')) document.getElementById('rewardNameInput').value = name;
  if (document.getElementById('dealPriceInput')) document.getElementById('dealPriceInput').value = price;
  if (document.getElementById('closeRateInput')) document.getElementById('closeRateInput').value = closeRate;
  if (document.getElementById('rewardImageInput')) document.getElementById('rewardImageInput').value = image;
  if (document.getElementById('toggleConsoleSwitch')) document.getElementById('toggleConsoleSwitch').checked = showConsole;
}

export function switchConsoleTab(tab) {
  const tabVision = document.getElementById('consoleTabVision');
  const tabActivity = document.getElementById('consoleTabActivity');
  const contentVision = document.getElementById('consoleContentVision');
  const contentActivity = document.getElementById('consoleContentActivity');
  const statusText = document.getElementById('consoleStatusText');

  if (!tabVision || !tabActivity || !contentVision || !contentActivity) return;

  if (tab === 'vision') {
    tabVision.style.color = 'var(--text-primary)';
    tabVision.style.borderBottomColor = 'var(--accent)';
    tabActivity.style.color = 'var(--text-muted)';
    tabActivity.style.borderBottomColor = 'transparent';
    contentVision.style.display = 'flex';
    contentActivity.style.display = 'none';
    if (statusText) statusText.textContent = "Goal Progress Monitor";
  } else {
    tabVision.style.color = 'var(--text-muted)';
    tabVision.style.borderBottomColor = 'transparent';
    tabActivity.style.color = 'var(--text-primary)';
    tabActivity.style.borderBottomColor = 'var(--accent)';
    contentVision.style.display = 'none';
    contentActivity.style.display = 'flex';
    if (statusText) statusText.textContent = "Real-time Lead Activity";
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

// Bind background configuration handlers
window.initBackground = initBackground;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.setBackgroundPreset = setBackgroundPreset;
window.removeCustomBackground = removeCustomBackground;
window.handleBackgroundUpload = handleBackgroundUpload;

// Bind reward configuration handlers
window.saveRewardSettings = saveRewardSettings;
window.initRewardSettings = initRewardSettings;

// Bind console tab switching and view preferences
window.switchConsoleTab = switchConsoleTab;
window.applyConsoleToggle = applyConsoleToggle;
