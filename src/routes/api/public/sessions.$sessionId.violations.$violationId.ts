import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { toViolation, type ViolationRow } from "@/lib/trackshift/mappers";

const patchSchema = z.object({ status: z.enum(["confirmed", "dismissed", "pending"]) });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/sessions/$sessionId/violations/$violationId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = patchSchema.safeParse(payload);
        if (!parsed.success) return json({ error: "Invalid payload", issues: parsed.error.issues }, 422);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("violations")
          .update({ status: parsed.data.status })
          .eq("session_id", params.sessionId)
          .eq("id", params.violationId)
          .select("id,timestamp_sec,turn_number,side,offset_px,confidence,clip_url,status")
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Violation not found" }, 404);
        return json(toViolation(data as ViolationRow));
      },
    },
  },
});
