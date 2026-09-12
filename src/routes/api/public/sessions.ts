import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const createSchema = z.object({
  durationSec: z.number().positive(),
  videoUrl: z.string().url().optional(),
  trackSlug: z.string().min(1).max(64).optional(),
  calibration: z
    .array(
      z.object({
        turnNumber: z.number().int(),
        timestampSec: z.number().nonnegative(),
        xPct: z.number(),
        yPct: z.number(),
      }),
    )
    .max(200)
    .optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/sessions")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("sessions")
          .select("id,track_slug,video_url,duration_sec,status,created_at")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      },
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = createSchema.safeParse(payload);
        if (!parsed.success) return json({ error: "Invalid payload", issues: parsed.error.issues }, 422);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("sessions")
          .insert({
            duration_sec: parsed.data.durationSec,
            video_url: parsed.data.videoUrl ?? null,
            track_slug: parsed.data.trackSlug ?? "tt-assen",
            status: "processing",
          })
          .select("id,status")
          .single();
        if (error || !data) return json({ error: error?.message ?? "Insert failed" }, 500);

        // A session must never end up with zero calibration rows: fall back to a
        // duration-scaled circuit calibration when the caller sends none.
        const { buildCalibration } = await import("@/lib/trackshift/calibration");
        const calibration = parsed.data.calibration?.length
          ? parsed.data.calibration
          : buildCalibration(parsed.data.durationSec);

        const { error: calibrationError } = await supabaseAdmin.from("calibration_points").upsert(
          calibration.map((c) => ({
            session_id: data.id,
            turn_number: c.turnNumber,
            timestamp_sec: c.timestampSec,
            x_pct: c.xPct,
            y_pct: c.yPct,
          })),
          { onConflict: "session_id,turn_number" },
        );
        if (calibrationError) console.error("[sessions] calibration seed failed", calibrationError.message);

        // Kick the external CV service off automatically once footage exists.
        const cvUrl = process.env["CV_SERVICE_URL"];
        if (cvUrl && parsed.data.videoUrl) {
          const origin = new URL(request.url).origin;
          void fetch(cvUrl, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(process.env["CV_INGEST_SECRET"]
                ? { "x-ingest-secret": process.env["CV_INGEST_SECRET"] }
                : {}),
            },
            body: JSON.stringify({
              sessionId: data.id,
              videoUrl: parsed.data.videoUrl,
              durationSec: parsed.data.durationSec,
              ingestUrl: `${origin}/api/public/ingest/${data.id}/frames`,
            }),
          }).catch((e) => console.error("[sessions] CV dispatch failed", e));
        }

        return json({ id: data.id, status: data.status }, 201);

      },
    },
  },
});
