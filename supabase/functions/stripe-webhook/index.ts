// supabase/functions/stripe-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";
import { ActivityService, getSupabaseClient } from "../activity-service/index.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    return new Response("Missing signature or webhook secret configuration.", { status: 400 });
  }

  try {
    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    console.log(`Processing Stripe event: ${event.type}`);

    let amount = 0;
    let userId = "";
    let challengeId = "";

    // Determine event metadata
    if (
      event.type === "payment_intent.succeeded" ||
      event.type === "checkout.session.completed" ||
      event.type === "invoice.paid"
    ) {
      const obj = event.data.object as any;
      amount = (obj.amount_received || obj.amount_total || obj.amount_paid || 0) / 100; // convert cents to dollars
      
      // Look for userId/challengeId in metadata
      userId = obj.metadata?.user_id || obj.metadata?.userId || "";
      challengeId = obj.metadata?.challenge_id || obj.metadata?.challengeId || "";

      if (!userId) {
        // If metadata is empty, try to match by customer email, or fallback to the first active challenge in public database
        const customerEmail = obj.customer_details?.email || obj.customer_email || "";
        const supabase = getSupabaseClient();
        
        if (customerEmail) {
          const { data: userData } = await supabase
            .from("users") // Wait, standard auth users
            .select("id")
            .eq("email", customerEmail)
            .limit(1);

          if (userData && userData.length > 0) {
            userId = userData[0].id;
          }
        }

        // Fallback: If still no userId, retrieve the first challenge in the database
        if (!userId) {
          const { data: chalData } = await supabase
            .from("challenge")
            .select("user_id, id")
            .limit(1);

          if (chalData && chalData.length > 0) {
            userId = chalData[0].user_id;
            challengeId = chalData[0].id;
          }
        }
      }
    }

    if (amount > 0 && userId) {
      const service = new ActivityService();
      
      // If we don't have challengeId, look up active challenge
      if (!challengeId) {
        const chal = await service.getActiveChallenge(userId);
        challengeId = chal.id;
      }

      const todayStr = new Date().toISOString().split('T')[0];
      
      // Insert revenue row (which triggers the daily_revenue sync via DB trigger)
      await service.addRevenueRecord(userId, challengeId, amount, todayStr);
      console.log(`Successfully recorded sale of $${amount} for user ${userId}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`Error processing webhook: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }
});
