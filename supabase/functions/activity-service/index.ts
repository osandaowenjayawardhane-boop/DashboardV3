// supabase/functions/activity-service/index.ts
// Shared database service used by all webhook functions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const getSupabaseClient = () => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SERVICE_ROLE_KEY in Edge Function secrets.");
  }
  return createClient(url, serviceKey);
};

export interface LeadData {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  pipeline_stage: string;
  source: "cold_call" | "cold_dm";
  external_id?: string;
}

export class ActivityService {
  private supabase;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  /**
   * Retrieve the current active challenge for a user.
   */
  async getActiveChallenge(userId: string) {
    const { data, error } = await this.supabase
      .from("challenge")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(`No active challenge found for user: ${userId}`);
    }
    return data[0];
  }

  /**
   * Upserts a lead using its GoHighLevel external_id as the unique key.
   * - If a lead with that external_id exists: updates stage + contact fields.
   * - If not: creates a new lead with all provided data.
   * This is the single write path for all GHL pipeline events.
   */
  async upsertLead(userId: string, challengeId: string, lead: LeadData) {
    const now = new Date().toISOString();
    let existingId: string | null = null;

    // 1. Try to search by external_id (matched to GHL Opportunity ID or Contact ID)
    if (lead.external_id) {
      console.log(`Searching for lead by external_id = "${lead.external_id}"`);
      const { data: existingByExt, error: errExt } = await this.supabase
        .from("lead")
        .select("id")
        .eq("challenge_id", challengeId)
        .eq("external_id", lead.external_id)
        .limit(1);

      if (!errExt && existingByExt && existingByExt.length > 0) {
        existingId = existingByExt[0].id;
        console.log(`Found existing lead by external_id: ${existingId}`);
      }
    }

    // 2. Fallback: Search by phone (if provided)
    if (!existingId && lead.phone) {
      console.log(`Searching for lead by phone = "${lead.phone}"`);
      const { data: existingByPhone, error: errPhone } = await this.supabase
        .from("lead")
        .select("id, external_id")
        .eq("challenge_id", challengeId)
        .eq("phone", lead.phone)
        .limit(1);

      if (!errPhone && existingByPhone && existingByPhone.length > 0) {
        existingId = existingByPhone[0].id;
        console.log(`Found existing lead by phone: ${existingId}`);
      }
    }

    // 3. Fallback: Search by email (if provided)
    if (!existingId && lead.email) {
      console.log(`Searching for lead by email = "${lead.email}"`);
      const { data: existingByEmail, error: errEmail } = await this.supabase
        .from("lead")
        .select("id, external_id")
        .eq("challenge_id", challengeId)
        .eq("email", lead.email)
        .limit(1);

      if (!errEmail && existingByEmail && existingByEmail.length > 0) {
        existingId = existingByEmail[0].id;
        console.log(`Found existing lead by email: ${existingId}`);
      }
    }

    if (existingId) {
      // Execute UPDATE
      console.log(`Performing UPDATE on lead id: ${existingId}`);
      const updates: Record<string, unknown> = {
        pipeline_stage: lead.pipeline_stage,
        updated_at: now,
      };
      if (lead.name)    updates.name    = lead.name;
      if (lead.phone)   updates.phone   = lead.phone;
      if (lead.email)   updates.email   = lead.email;
      if (lead.company) updates.company = lead.company;
      if (lead.external_id) updates.external_id = lead.external_id;

      const { data: updateData, error: updateErr } = await this.supabase
        .from("lead")
        .update(updates)
        .eq("id", existingId)
        .select();

      console.log("Supabase update result:", { data: updateData, error: updateErr });
      if (updateErr) throw updateErr;
      return;
    }

    // Execute INSERT
    console.log(`Performing INSERT for new lead`);
    const { data: insertData, error: insertErr } = await this.supabase
      .from("lead")
      .insert({
        user_id: userId,
        challenge_id: challengeId,
        source: lead.source,
        pipeline_stage: lead.pipeline_stage,
        name: lead.name || null,
        phone: lead.phone || null,
        email: lead.email || null,
        company: lead.company || null,
        external_id: lead.external_id || null,
        created_at: now,
        updated_at: now,
      })
      .select();

    console.log("Supabase insert result:", { data: insertData, error: insertErr });
    if (insertErr) throw insertErr;
  }

  /**
   * Legacy wrapper — kept for backward compatibility with kixie webhook.
   */
  async upsertLeadStage(
    userId: string,
    challengeId: string,
    source: "cold_call" | "cold_dm",
    pipelineStage: string,
    externalId?: string
  ) {
    await this.upsertLead(userId, challengeId, {
      source,
      pipeline_stage: pipelineStage,
      external_id: externalId,
    });
  }

  /**
   * Adds a revenue transaction.
   */
  async addRevenueRecord(
    userId: string,
    challengeId: string,
    amount: number,
    dateStr: string
  ) {
    const { error } = await this.supabase
      .from("revenue")
      .insert({ user_id: userId, challenge_id: challengeId, amount, revenue_date: dateStr });

    if (error) throw error;
  }
}
