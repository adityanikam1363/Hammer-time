import { createFileRoute } from "@tanstack/react-router";
import { toCalibrationPoint, type CalibrationRow } from "@/lib/trackshift/mappers";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/sessions/$sessionId/calibration")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("calibration_points")
          .select("turn_number,timestamp_sec,x_pct,y_pct")
          .eq("session_id", params.sessionId)
          .order("timestamp_sec", { ascending: true });
        if (error) return json({ error: error.message }, 500);
        return json((data ?? []).map((row) => toCalibrationPoint(row as CalibrationRow)));
      },
    },
  },
});
