// supabase/functions/ghl-webhook/index.ts
//
// GoHighLevel Workflow Webhook → Supabase pipeline sync.
//
// GHL Workflow webhooks do NOT send an event/type field.
// Instead, we detect what happened by examining the payload structure.
// If an opportunity or contact object is present, we upsert the lead.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ActivityService, getSupabaseClient } from "../activity-service/index.ts";

// ─── STAGE NAME → Dashboard Stage ──────────────────────────────────────────
// Edit these to match your exact GHL pipeline stage names (case-insensitive substring match).
// First match wins — put more specific strings before general ones.
const STAGE_MAP: Array<{ match: string; stage: string }> = [
  { match: "closed won",  stage: "Closed Won" },
  { match: "won",         stage: "Closed Won" },
  { match: "show",        stage: "Showed"     },
  { match: "attended",    stage: "Showed"     },
  { match: "book",        stage: "Booked"     },
  { match: "schedul",     stage: "Booked"     },
  { match: "appoint",     stage: "Booked"     },
  { match: "pick",        stage: "Picked Up"  },
  { match: "answer",      stage: "Picked Up"  },
  { match: "connect",     stage: "Picked Up"  },
  { match: "reply",       stage: "Replied"    },
  { match: "respond",     stage: "Replied"    },
  { match: "convers",     stage: "Picked Up"  },
  { match: "dial",        stage: "Dialed"     },
  { match: "outbound",    stage: "Dialed"     },
  { match: "sent",        stage: "Sent"       },
  { match: "dm",          stage: "Sent"       },
];

function mapGhlStage(stageName: string, status: string, source: "cold_call" | "cold_dm"): string {
  // GHL marks closed opportunities via the status field
  const s = (status ?? "").toLowerCase();
  if (s === "won") return "Closed Won";

  const lower = (stageName ?? "").toLowerCase();
  for (const { match, stage } of STAGE_MAP) {
    if (lower.includes(match)) return stage;
  }

  // Default: first stage for the source channel
  return source === "cold_call" ? "Dialed" : "Sent";
}

// ─── Extract fields from GHL Workflow webhook payload ───────────────────────
// GHL Workflow webhooks flatten most fields to the top level.
// Event-based API webhooks nest them under contact/opportunity objects.
// We handle both layouts here.
type Rec = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function extractPayloadData(p: Rec) {
  // GHL can send data nested under "opportunity", "contact", or flat at root
  const opp     = (p.opportunity   ?? {}) as Rec;
  const contact  = (p.contact       ?? {}) as Rec;

  // ── Opportunity / stage info ────────────────────────────────────────────
  // Workflow webhooks put stageName at top-level; API webhooks nest it
  const stageName =
    str(p.stageName)           ||
    str(p.stage_name)          ||
    str(p.pipeline_stage)      ||
    str(p.pipeline_stage_name) ||
    str(opp.stageName)         ||
    str(opp.stage_name)        ||
    str(opp.name)              || 
    "";

  const status =
    str(p.status)            ||
    str(opp.status)          ||
    str(p.opportunityStatus) ||
    "";

  // ── External ID — use GHL opportunity ID as the stable key ──────────────
  const externalId =
    str(p.id)                ||
    str(opp.id)              ||
    str(p.opportunityId)     ||
    str(p.opportunity_id)    ||
    str(contact.id)          ||
    str(p.contactId)         ||
    str(p.contact_id)        ||
    null;

  // ── Contact info ─────────────────────────────────────────────────────────
  const firstName  = str(p.firstName)  || str(p.first_name)  || str(contact.firstName)  || "";
  const lastName   = str(p.lastName)   || str(p.last_name)   || str(contact.lastName)   || "";
  const fullName   = str(p.name)       || str(contact.name)  || str(p.full_name)        || str(opp.contactName) ||
                     [firstName, lastName].filter(Boolean).join(" ") || null;

  const phone    = str(p.phone)        || str(p.phone_number)     || str(contact.phone) || str(p.phoneRaw) || null;
  const email    = str(p.email)        || str(contact.email)      || null;
  const company  = str(p.companyName)  || str(p.company_name)     || str(contact.companyName) || str(p.company) || null;

  // ── Source: default to cold_call unless tagged otherwise ─────────────────
  // Normalize tags — GHL sends "" (empty string), a CSV string, or a real array
  const rawTags = p.tags ?? contact.tags;
  let tags: string[];
  if (Array.isArray(rawTags)) {
    tags = rawTags.map(String);
  } else if (typeof rawTags === "string" && rawTags.trim() !== "") {
    tags = rawTags.split(",").map(t => t.trim()).filter(Boolean);
  } else {
    tags = [];
  }
  const source: "cold_call" | "cold_dm" =
    tags.some(t => ["cold_dm", "dm", "DM"].includes(t)) ? "cold_dm" : "cold_call";

  return { stageName, status, externalId, name: fullName, phone, email, company, source };
}

// ─── Detect whether this payload contains an opportunity / contact ───────────
function hasOpportunityData(p: Rec): boolean {
  return !!(
    p.id ||
    p.opportunityId ||
    p.opportunity_id ||
    p.stageName ||
    p.stage_name ||
    p.opportunity ||
    p.contactId ||
    p.contact_id ||
    p.contact
  );
}

// ─── Main handler ────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  const url = new URL(req.url);
  let userId      = url.searchParams.get("userId");
  let challengeId = url.searchParams.get("challengeId");

  let rawBody = "";
  try {
    rawBody = await req.text();
    console.log("GHL Webhook | raw body:", rawBody.slice(0, 1000));

    const payload = JSON.parse(rawBody) as Rec;

    // ── Event type (may be empty for Workflow webhooks) ───────────────────
    const eventType = str(payload.type || payload.event).toLowerCase();
    console.log(`GHL Webhook | eventType="${eventType}"`);

    // ── Resolve user + challenge ──────────────────────────────────────────
    if (!userId) {
      const supabase = getSupabaseClient();
      const { data: chalData } = await supabase
        .from("challenge")
        .select("user_id, id")
        .limit(1);

      if (chalData && chalData.length > 0) {
        userId      = chalData[0].user_id;
        challengeId = chalData[0].id;
      }
    }

    if (!userId) {
      console.error("GHL Webhook: no userId found in URL params or challenge table.");
      return new Response(
        JSON.stringify({ error: "No user context. Pass ?userId=<uuid> in the webhook URL." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const service = new ActivityService();

    // Validate if the provided challengeId exists in the database
    let challengeExists = false;
    if (challengeId) {
      const supabase = getSupabaseClient();
      const { data: chalCheck } = await supabase
        .from("challenge")
        .select("id")
        .eq("id", challengeId)
        .limit(1);
      if (chalCheck && chalCheck.length > 0) {
        challengeExists = true;
      }
    }

    if (!challengeId || !challengeExists) {
      console.log(`Provided challenge ID "${challengeId}" is missing or invalid. Fetching active challenge...`);
      try {
        const chal = await service.getActiveChallenge(userId);
        challengeId = chal.id;
        console.log(`Resolved active challenge ID: "${challengeId}"`);
      } catch (chalErr) {
        console.error("Could not fetch active challenge:", chalErr);
      }
    }

    // ── Decide whether to process ─────────────────────────────────────────
    // Process if: known event type OR payload contains opportunity/contact data
    const isKnownEvent = [
      "opportunitycreated", "opportunity_created",
      "opportunitystatusupdated", "opportunity_status_updated",
      "opportunitystatuschanged", "opportunity_status_changed",
      "opportunitystagechanged", "opportunity_stage_changed",
    ].includes(eventType);

    const isWorkflowPayload = !eventType && hasOpportunityData(payload);
    const hasData = hasOpportunityData(payload);

    if (!isKnownEvent && !isWorkflowPayload && !hasData) {
      console.log(`GHL Webhook: no recognisable data in payload — skipping.`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no opportunity data found" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Extract and upsert ────────────────────────────────────────────────
    const { stageName, status, externalId, name, phone, email, company, source } =
      extractPayloadData(payload);

    // Map the stage name, checking first if it was passed explicitly in the URL query parameters
    let pipelineStage = url.searchParams.get("stage") || mapGhlStage(stageName, status, source);

    console.log(`GHL Webhook | upserting lead: externalId="${externalId}" stage="${pipelineStage}" (source: ${url.searchParams.get("stage") ? "URL param" : "Payload mapping"}) name="${name}" source="${source}"`);

    await service.upsertLead(userId, challengeId, {
      name:           name ?? undefined,
      phone:          phone ?? undefined,
      email:          email ?? undefined,
      company:        company ?? undefined,
      source,
      pipeline_stage: pipelineStage,
      external_id:    externalId ?? undefined,
    });

    return new Response(JSON.stringify({ success: true, event: eventType || "workflow", stage: pipelineStage }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("GHL Webhook error:", err);
    let msg = "";
    if (err instanceof Error) {
      msg = err.message;
      console.error(err.stack);
    } else if (err && typeof err === "object") {
      msg = (err as any).message || (err as any).error_description || JSON.stringify(err);
      console.error(JSON.stringify(err, null, 2));
    } else {
      msg = String(err);
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
