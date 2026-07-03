// supabase/functions/ghl-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ActivityService, getSupabaseClient } from "../activity-service/index.ts";

serve(async (req) => {
  const url = new URL(req.url);
  let userId = url.searchParams.get("userId");
  let challengeId = url.searchParams.get("challengeId");

  try {
    const payload = await req.json();
    console.log(`GHL Webhook received payload:`, payload);

    // Standard GHL events payload structure has .type or .event
    const eventType = payload.type || payload.event || "";
    
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

    // Determine lead source: GHL is usually linked to Cold Calls or DMs depending on tags/custom fields
    // Let's inspect tags or default to "cold_call"
    let source: "cold_call" | "cold_dm" = "cold_call";
    const tags = payload.tags || payload.contact?.tags || [];
    if (tags.includes("cold_dm") || tags.includes("DM")) {
      source = "cold_dm";
    }

    // Handle standard GHL Webhook Events
    // Event types: ContactCreated, OpportunityCreated, AppointmentBooked, AppointmentStatusChanged
    if (eventType === "ContactCreated" || eventType === "contact_created") {
      // 1. Increment departure counters
      if (source === "cold_call") {
        await service.incrementActivity(userId, challengeId, todayStr, "cold_calls");
        await service.upsertLeadStage(userId, challengeId, "cold_call", "Dialed", payload.contact_id);
      } else {
        await service.incrementActivity(userId, challengeId, todayStr, "cold_dms");
        await service.upsertLeadStage(userId, challengeId, "cold_dm", "Sent", payload.contact_id);
      }
    } 
    else if (
      eventType === "OpportunityCreated" || 
      eventType === "opportunity_created" ||
      eventType === "OpportunityStatusChanged" ||
      eventType === "opportunity_status_changed"
    ) {
      const stageName = payload.stageName || payload.stage_name || "";
      const status = payload.status || payload.opportunityStatus || "";
      let pipelineStage = source === "cold_call" ? "Picked Up" : "Replied";

      if (
        status.toLowerCase() === "won" || 
        status.toLowerCase() === "closed won" || 
        stageName.toLowerCase().includes("won") || 
        stageName.toLowerCase().includes("closed won")
      ) {
        pipelineStage = "Closed Won";
      } else if (stageName.toLowerCase().includes("show") || stageName.toLowerCase().includes("attended")) {
        pipelineStage = "Showed";
      } else if (stageName.toLowerCase().includes("book") || stageName.toLowerCase().includes("schedule")) {
        pipelineStage = "Booked";
      } else if (stageName.toLowerCase().includes("pick") || stageName.toLowerCase().includes("answer") || stageName.toLowerCase().includes("reply") || stageName.toLowerCase().includes("convers")) {
        pipelineStage = source === "cold_call" ? "Picked Up" : "Replied";
      } else if (stageName.toLowerCase().includes("dial") || stageName.toLowerCase().includes("sent") || stageName.toLowerCase().includes("outbound")) {
        pipelineStage = source === "cold_call" ? "Dialed" : "Sent";
      }

      await service.upsertLeadStage(userId, challengeId, source, pipelineStage, payload.contact_id);
    } 
    else if (eventType === "AppointmentBooked" || eventType === "appointment_booked") {
      // Appointment Booked matches 'Booked' stage
      await service.upsertLeadStage(userId, challengeId, source, "Booked", payload.contact_id);
    } 
    else if (eventType === "AppointmentStatusChanged" || eventType === "appointment_status_changed") {
      // Status could be: showed, completed, no-show, cancelled
      const status = payload.status || payload.appointmentStatus || "";
      if (status === "showed" || status === "completed" || status === "Showed") {
        await service.upsertLeadStage(userId, challengeId, source, "Showed", payload.contact_id);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`GHL Webhook processing error: ${err.message}`);
    return new Response(`Error: ${err.message}`, { status: 400 });
  }
});
