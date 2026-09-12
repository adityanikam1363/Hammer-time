import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const patchSchema = z.object({ status: z.enum(["processing", "ready", "failed"]) });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });


export const Route = createFileRoute("/api/public/sessions/$sessionId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("sessions")
          .select("id,track_slug,video_url,duration_sec,status,created_at")
          .eq("id", params.sessionId)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Session not found" }, 404);
        return json({
          id: data.id,
          trackSlug: data.track_slug,
          videoUrl: data.video_url,
          durationSec: Number(data.duration_sec),
          status: data.status,
          createdAt: data.created_at,
        });
      },
      PATCH: async ({ request, params }) => {
        const secret = process.env["CV_INGEST_SECRET"];
        if (!secret || (request.headers.get("x-ingest-secret") ?? "") !== secret) {
          return json({ error: "Unauthorized" }, 401);
        }
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
          .from("sessions")
          .update({ status: parsed.data.status })
          .eq("id", params.sessionId)
          .select("id,status")
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Session not found" }, 404);
        return json({ id: data.id, status: data.status });
      },
    },

  },
});
