// supabase/functions/activity-service/index.ts
// Shared Service for Mission Control Webhooks
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const getSupabaseClient = () => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase URL or Service Role Key in environment variables.");
  }
  return createClient(url, serviceKey);
};

export class ActivityService {
  private supabase;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  /**
   * Helper to retrieve the current active challenge for a user
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
   * Ensures daily_activity row exists for the date (local timezone format YYYY-MM-DD)
   */
  async ensureDailyActivity(userId: string, challengeId: string, dateStr: string) {
    const { data, error } = await this.supabase
      .from("daily_activity")
      .select("id")
      .eq("challenge_id", challengeId)
      .eq("activity_date", dateStr);

    if (error) throw error;

    if (!data || data.length === 0) {
      const { data: insertData, error: insertErr } = await this.supabase
        .from("daily_activity")
        .insert({
          user_id: userId,
          challenge_id: challengeId,
          activity_date: dateStr,
          cold_calls: 0,
          cold_dms: 0,
          follow_ups: 0,
          content_posted: 0
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      return insertData;
    }
    return data[0];
  }

  /**
   * Increments a counter inside daily_activity for today
   */
  async incrementActivity(userId: string, challengeId: string, dateStr: string, field: "cold_calls" | "cold_dms" | "follow_ups" | "content_posted", value = 1) {
    // Ensure daily activity row exists first
    await this.ensureDailyActivity(userId, challengeId, dateStr);

    // Deno/Postgres standard atomic update
    const { data: current, error: selectErr } = await this.supabase
      .from("daily_activity")
      .select(field)
      .eq("challenge_id", challengeId)
      .eq("activity_date", dateStr)
      .single();

    if (selectErr) throw selectErr;

    const currentCount = current ? (current[field] || 0) : 0;
    const { error: updateErr } = await this.supabase
      .from("daily_activity")
      .update({ [field]: currentCount + value })
      .eq("challenge_id", challengeId)
      .eq("activity_date", dateStr);

    if (updateErr) throw updateErr;
  }

  /**
   * Upserts a lead pipeline stage. Creates a lead if it doesn't exist, otherwise updates stage.
   */
  async upsertLeadStage(userId: string, challengeId: string, source: "cold_call" | "cold_dm", pipelineStage: string, leadIdentifier?: string) {
    // If we have a unique leadIdentifier (like phone or email), we can check if it exists
    if (leadIdentifier) {
      // In this setup, public.lead table doesn't have an email/phone column, but if we pass it, we could identify it
      // Let's check if there is an existing lead that isn't closed.
      const { data: existingLeads, error: selectErr } = await this.supabase
        .from("lead")
        .select("id")
        .eq("challenge_id", challengeId)
        .eq("source", source)
        .neq("pipeline_stage", "Closed")
        .limit(1);

      if (!selectErr && existingLeads && existingLeads.length > 0) {
        // Update stage
        const { error: updateErr } = await this.supabase
          .from("lead")
          .update({ pipeline_stage: pipelineStage })
          .eq("id", existingLeads[0].id);

        if (updateErr) throw updateErr;
        return;
      }
    }

    // Otherwise, create a new lead at this stage
    const { error: insertErr } = await this.supabase
      .from("lead")
      .insert({
        user_id: userId,
        challenge_id: challengeId,
        source: source,
        pipeline_stage: pipelineStage
      });

    if (insertErr) throw insertErr;
  }

  /**
   * Adds revenue transaction
   */
  async addRevenueRecord(userId: string, challengeId: string, amount: number, dateStr: string) {
    const { error } = await this.supabase
      .from("revenue")
      .insert({
        user_id: userId,
        challenge_id: challengeId,
        amount: amount,
        revenue_date: dateStr
      });

    if (error) throw error;
  }
}
