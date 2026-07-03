// src/leads.js
import { supabaseClient } from './supabase.js';
import { currentChallenge, fetchAndRenderDashboard } from './dashboard.js';

export async function fetchAndRenderLeads() {
  if (!supabaseClient || !currentChallenge) return;
  try {
    const { data: leads, error } = await supabaseClient
      .from('lead')
      .select('*')
      .eq('challenge_id', currentChallenge.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const tbody = document.getElementById('leadsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!leads || leads.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="padding: 24px; text-align: center; color: var(--text-muted); font-style: italic;">
            No leads found. Click "+ Add Lead" to record your first interaction.
          </td>
        </tr>
      `;
      return;
    }

    leads.forEach(l => {
      const createdDate = l.created_at ? new Date(l.created_at).toLocaleString() : 'N/A';
      const updatedDate = l.updated_at ? new Date(l.updated_at).toLocaleString() : 'N/A';
      
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--whitesmoke-100)';
      tr.innerHTML = `
        <td style="padding: 10px; font-weight: 600; color: var(--text-primary);">${escapeHtml(l.name || 'Unnamed')}</td>
        <td style="padding: 10px; font-family: monospace;">${escapeHtml(l.phone || 'N/A')}</td>
        <td style="padding: 10px;">
          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; 
            background: ${l.source === 'cold_call' ? 'var(--line-1-subtle)' : 'var(--line-2-subtle)'}; 
            color: ${l.source === 'cold_call' ? 'var(--line-1)' : 'var(--line-2)'};">
            ${l.source === 'cold_call' ? 'Cold Call' : 'Cold DM'}
          </span>
        </td>
        <td style="padding: 10px; font-weight: 600;">${escapeHtml(l.pipeline_stage)}</td>
        <td style="padding: 10px; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(l.notes || '')}">
          ${escapeHtml(l.notes || '—')}
        </td>
        <td style="padding: 10px; color: var(--text-muted); font-size: 11px;">${createdDate}</td>
        <td style="padding: 10px; color: var(--text-muted); font-size: 11px;">${updatedDate}</td>
        <td style="padding: 10px; text-align: right;">
          <button onclick="editLead('${l.id}')" style="background: none; border: none; color: var(--accent); font-weight: 600; cursor: pointer; margin-right: 12px; font-size: 11px;">Edit</button>
          <button onclick="deleteLead('${l.id}')" style="background: none; border: none; color: var(--coral-100); font-weight: 600; cursor: pointer; font-size: 11px;">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Error fetching leads list:", err.message);
  }
}

export function openLeadModal(leadId = '') {
  const modal = document.getElementById('leadModal');
  const title = document.getElementById('modalTitle');
  const form = document.getElementById('leadForm');
  
  if (!modal || !form) return;
  form.reset();
  
  document.getElementById('modalLeadId').value = leadId;
  updateStageDropdownOptions();

  if (leadId) {
    title.textContent = "Edit Sales Lead";
    loadLeadIntoForm(leadId);
  } else {
    title.textContent = "Add New Sales Lead";
    modal.style.display = 'flex';
  }
}

async function loadLeadIntoForm(leadId) {
  try {
    const { data: lead, error } = await supabaseClient
      .from('lead')
      .select('*')
      .eq('id', leadId)
      .single();

    if (error) throw error;

    document.getElementById('leadName').value = lead.name || '';
    document.getElementById('leadPhone').value = lead.phone || '';
    document.getElementById('leadSource').value = lead.source || 'cold_call';
    updateStageDropdownOptions();
    document.getElementById('leadStage').value = lead.pipeline_stage;
    document.getElementById('leadNotes').value = lead.notes || '';

    document.getElementById('leadModal').style.display = 'flex';
  } catch (err) {
    console.error("Error loading lead for editing:", err.message);
  }
}

export function closeLeadModal() {
  const modal = document.getElementById('leadModal');
  if (modal) modal.style.display = 'none';
}

export function updateStageDropdownOptions() {
  const source = document.getElementById('leadSource').value;
  const stageSelect = document.getElementById('leadStage');
  if (!stageSelect) return;

  stageSelect.innerHTML = '';
  
  const callStages = ['Dialed', 'Picked Up', 'Booked', 'Showed', 'Closed Won'];
  const dmStages = ['Sent', 'Replied', 'Booked', 'Showed', 'Closed Won'];
  const targetStages = source === 'cold_call' ? callStages : dmStages;

  targetStages.forEach(stage => {
    const opt = document.createElement('option');
    opt.value = stage;
    opt.textContent = stage;
    stageSelect.appendChild(opt);
  });
}

export async function saveLeadForm(event) {
  event.preventDefault();
  if (!supabaseClient || !currentChallenge) return;

  const leadId = document.getElementById('modalLeadId').value;
  const name = document.getElementById('leadName').value.trim();
  const phone = document.getElementById('leadPhone').value.trim();
  const source = document.getElementById('leadSource').value;
  const pipeline_stage = document.getElementById('leadStage').value;
  const notes = document.getElementById('leadNotes').value.trim();

  try {
    if (leadId) {
      // Update
      const { error } = await supabaseClient
        .from('lead')
        .update({
          name,
          phone,
          source,
          pipeline_stage,
          notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);

      if (error) throw error;
    } else {
      // Insert
      const { error } = await supabaseClient
        .from('lead')
        .insert({
          user_id: currentChallenge.user_id,
          challenge_id: currentChallenge.id,
          name,
          phone,
          source,
          pipeline_stage,
          notes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
    }

    closeLeadModal();
    // Refresh local lists
    await fetchAndRenderLeads();
    await fetchAndRenderDashboard();
  } catch (err) {
    console.error("Error saving lead item:", err.message);
  }
}

export async function deleteLead(leadId) {
  if (!confirm("Are you sure you want to delete this lead? This will also update your subway dashboard network counts.")) return;
  try {
    const { error } = await supabaseClient
      .from('lead')
      .delete()
      .eq('id', leadId);

    if (error) throw error;
    await fetchAndRenderLeads();
    await fetchAndRenderDashboard();
  } catch (err) {
    console.error("Error deleting lead item:", err.message);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Bind to window to allow direct HTML event bindings
window.openLeadModal = () => openLeadModal('');
window.editLead = (id) => openLeadModal(id);
window.closeLeadModal = closeLeadModal;
window.updateStageDropdownOptions = updateStageDropdownOptions;
window.saveLeadForm = saveLeadForm;
window.deleteLead = deleteLead;
