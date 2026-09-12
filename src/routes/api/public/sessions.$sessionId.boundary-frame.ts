import { createFileRoute } from "@tanstack/react-router";
import { toBoundaryFrame, type BoundaryFrameRow } from "@/lib/trackshift/mappers";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Nearest boundary frame to ?t=<timestampSec>, for scrubbing. */
export const Route = createFileRoute("/api/public/sessions/$sessionId/boundary-frame")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const t = Number(new URL(request.url).searchParams.get("t") ?? "0");
        if (!Number.isFinite(t) || t < 0) return json({ error: "Invalid t" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const columns = "timestamp_sec,left_boundary,right_boundary,tire_left,tire_right,breached";

        const [before, after] = await Promise.all([
          supabaseAdmin
            .from("boundary_frames")
            .select(columns)
            .eq("session_id", params.sessionId)
            .lte("timestamp_sec", t)
            .order("timestamp_sec", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabaseAdmin
            .from("boundary_frames")
            .select(columns)
            .eq("session_id", params.sessionId)
            .gt("timestamp_sec", t)
            .order("timestamp_sec", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);

        const candidates = [before.data, after.data].filter(Boolean) as BoundaryFrameRow[];
        if (candidates.length === 0) return json(null);

        const nearest = candidates.reduce((best, row) =>
          Math.abs(Number(row.timestamp_sec) - t) < Math.abs(Number(best.timestamp_sec) - t) ? row : best,
        );
        return json(toBoundaryFrame(nearest));
      },
    },
  },
});
