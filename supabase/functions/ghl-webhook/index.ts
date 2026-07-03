// supabase/functions/ghl-webhook/index.ts
//
// GoHighLevel → Supabase pipeline sync.
//
// GHL sends one webhook per opportunity event. This function maps
// the incoming payload to a lead record and upserts it by external_id
// (the GHL opportunity ID), so stage moves update the same row.
//
// CORS: GHL sends requests from their servers, not a browser, so no
// CORS headers are needed. We just need to return 200 fast.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ActivityService, getSupabaseClient } from "../activity-service/index.ts";

// ─── GHL STAGE NAME → Dashboard Stage ──────────────────────────────────────
// Edit this map to match your exact GHL pipeline stage names.
// Keys are lowercase substrings of your GHL stage name.
// First match wins (order matters).
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
  // GHL marks closed as won/lost in the "status" field
  const s = status.toLowerCase();
  if (s === "won") return "Closed Won";
  if (s === "lost" || s === "abandoned") return source === "cold_call" ? "Dialed" : "Sent"; // back to start on lost

  const lower = stageName.toLowerCase();
  for (const { match, stage } of STAGE_MAP) {
    if (lower.includes(match)) return stage;
  }

  // Default: if we can't map it, keep at first stage
  return source === "cold_call" ? "Dialed" : "Sent";
}

// ─── Extract contact info from GHL payload ──────────────────────────────────
// GHL's opportunity webhook nests contact data differently depending on
// whether it came from the opportunity or the contact object.
function extractContact(payload: Record<string, unknown>) {
  // GHL v2 opportunity webhook structure
  const contact = (payload.contact ?? {}) as Record<string, unknown>;
  const opportunity = (payload.opportunity ?? payload) as Record<string, unknown>;

  const name =
    (contact.name as string) ||
    (opportunity.name as string) ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    [payload.firstName, payload.lastName].filter(Boolean).join(" ") ||
    null;

  const phone =
    (contact.phone as string) ||
    (contact.phoneRaw as string) ||
    (payload.phone as string) ||
    null;

  const email =
    (contact.email as string) ||
    (payload.email as string) ||
    null;

  const company =
    (contact.companyName as string) ||
    (contact.company as string) ||
    (payload.companyName as string) ||
    null;

  // The GHL opportunity ID — this is our stable external_id
  const externalId =
    (opportunity.id as string) ||
    (payload.id as string) ||
    (payload.opportunityId as string) ||
    (payload.opportunity_id as string) ||
    (contact.id as string) ||
    (payload.contact_id as string) ||
    null;

  // Source: check tags or custom fields; default to cold_call
  const tags = (contact.tags as string[]) || (payload.tags as string[]) || [];
  const source: "cold_call" | "cold_dm" =
    tags.some(t => ["cold_dm", "dm", "DM"].includes(t)) ? "cold_dm" : "cold_call";

  return { name, phone, email, company, externalId, source };
}

// ─── Main handler ───────────────────────────────────────────────────────────
serve(async (req) => {
  // GHL may send HEAD/OPTIONS first
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  const url = new URL(req.url);
  let userId = url.searchParams.get("userId");
  let challengeId = url.searchParams.get("challengeId");

  try {
    const payload = await req.json() as Record<string, unknown>;
    const eventType = ((payload.type ?? payload.event ?? "") as string).toLowerCase();

    console.log(`GHL Webhook | event="${eventType}"`, JSON.stringify(payload).slice(0, 400));

    // ── Resolve user + challenge ──────────────────────────────────────────
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
      return new Response(
        JSON.stringify({ error: "No user context found. Pass ?userId=... in the webhook URL." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const service = new ActivityService();
    if (!challengeId) {
      const chal = await service.getActiveChallenge(userId);
      challengeId = chal.id;
    }

    // ── Route by event type ───────────────────────────────────────────────
    const { name, phone, email, company, externalId, source } = extractContact(payload);

    if (
      eventType === "opportunitycreated" ||
      eventType === "opportunity_created"
    ) {
      // New opportunity → create lead at first stage
      const stageName = (
        (payload.stageName ?? payload.stage_name ?? (payload.opportunity as Record<string,unknown>)?.stageName ?? "") as string
      );
      const status = ((payload.status ?? "") as string);
      const pipelineStage = mapGhlStage(stageName, status, source);

      await service.upsertLead(userId, challengeId, {
        name, phone, email, company, source, pipeline_stage: pipelineStage, external_id: externalId ?? undefined,
      });
    }
    else if (
      eventType === "opportunitystatusupdated"  ||
      eventType === "opportunity_status_updated" ||
      eventType === "opportunitystatuschanged"   ||
      eventType === "opportunity_status_changed"
    ) {
      // Stage moved OR won/lost
      const stageName = (
        (payload.stageName ?? payload.stage_name ?? (payload.opportunity as Record<string,unknown>)?.stageName ?? "") as string
      );
      const status = ((payload.status ?? (payload.opportunity as Record<string,unknown>)?.status ?? "") as string);
      const pipelineStage = mapGhlStage(stageName, status, source);

      await service.upsertLead(userId, challengeId, {
        name, phone, email, company, source, pipeline_stage: pipelineStage, external_id: externalId ?? undefined,
      });
    }
    else if (
      eventType === "opportunitystagechanged" ||
      eventType === "opportunity_stage_changed"
    ) {
      const stageName = (
        (payload.stageName ?? payload.stage_name ?? "") as string
      );
      const status = ((payload.status ?? "") as string);
      const pipelineStage = mapGhlStage(stageName, status, source);

      await service.upsertLead(userId, challengeId, {
        name, phone, email, company, source, pipeline_stage: pipelineStage, external_id: externalId ?? undefined,
      });
    }
    else {
      // Unrecognised event — log it and return 200 so GHL doesn't retry
      console.log(`GHL Webhook: unhandled event type "${eventType}" — ignoring.`);
    }

    return new Response(JSON.stringify({ success: true, event: eventType }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`GHL Webhook error: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
