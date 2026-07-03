// supabase/functions/kixie-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ActivityService, getSupabaseClient } from "../activity-service/index.ts";

serve(async (req) => {
  const url = new URL(req.url);
  let userId = url.searchParams.get("userId");
  let challengeId = url.searchParams.get("challengeId");

  try {
    const payload = await req.json();
    console.log(`Kixie Webhook received payload:`, payload);

    // Kixie outbound call filters
    const direction = payload.direction || ""; // outbound/inbound
    const disposition = payload.disposition || ""; // Answered, No Answer, etc.
    const toPhone = payload.to_number || payload.to || "";

    // Skip if inbound call
    if (direction.toLowerCase() === "inbound") {
      return new Response("Ignored inbound call.", { status: 200 });
    }

    // Find default user/challenge if not supplied in query parameters
    if (!userId) {
      const supabase = getSupabaseClient();
      const { data: chalData } = await supabase
        .from("challenge")
        .select("user_id, id")
        .limit(1);

      if (chalData && chalData.length > 0) {
        userId = chalData[0].user_id;
        challengeId = chalData[0].id;
      }
    }

    if (!userId) {
      return new Response("No user configuration context found.", { status: 400 });
    }

    const service = new ActivityService();
    if (!challengeId) {
      const chal = await service.getActiveChallenge(userId);
      challengeId = chal.id;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Every outbound call dials, increment Cold Calls today
    await service.incrementActivity(userId, challengeId, todayStr, "cold_calls");

    // Upsert lead at Dialed stage
    await service.upsertLeadStage(userId, challengeId, "cold_call", "Dialed", toPhone);

    // If outbound call is Picked Up / Answered
    if (
      disposition.toLowerCase() === "answered" ||
      disposition.toLowerCase() === "connected" ||
      payload.duration > 0
    ) {
      // Progress lead stage to 'Picked Up'
      await service.upsertLeadStage(userId, challengeId, "cold_call", "Picked Up", toPhone);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`Kixie Webhook processing error: ${err.message}`);
    return new Response(`Error: ${err.message}`, { status: 400 });
  }
});
