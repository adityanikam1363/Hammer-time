import { createFileRoute } from "@tanstack/react-router";
import { toViolation, type ViolationRow } from "@/lib/trackshift/mappers";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/sessions/$sessionId/violations")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("violations")
          .select("id,timestamp_sec,turn_number,side,offset_px,confidence,clip_url,status")
          .eq("session_id", params.sessionId)
          .order("timestamp_sec", { ascending: true });
        if (error) return json({ error: error.message }, 500);
        return json((data ?? []).map((row) => toViolation(row as ViolationRow)));
      },
    },
  },
});
