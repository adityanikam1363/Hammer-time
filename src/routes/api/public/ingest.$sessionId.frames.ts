import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

const frameSchema = z.object({
  frameIndex: z.number().int().nonnegative(),
  timestampSec: z.number().finite().nonnegative(),
  leftBoundaryPx: z.array(pointSchema).max(2000),
  rightBoundaryPx: z.array(pointSchema).max(2000),
  tireLeftPx: pointSchema,
  tireRightPx: pointSchema,
  segConfidence: z.number().min(0).max(1),
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
});

const bodySchema = z.object({ frames: z.array(frameSchema).min(1).max(600) });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * Internal ingestion endpoint for the external CV service. Treats the caller as
 * untrusted: shared-secret auth plus full schema validation before any math runs.
 */
export const Route = createFileRoute("/api/public/ingest/$sessionId/frames")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const secret = process.env["CV_INGEST_SECRET"];
        if (!secret) return json({ error: "Ingest not configured" }, 500);

        const provided = request.headers.get("x-ingest-secret") ?? "";
        const { createHash, timingSafeEqual } = await import("node:crypto");
        const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
        if (!timingSafeEqual(digest(provided), digest(secret))) {
          return json({ error: "Unauthorized" }, 401);
        }

        const sessionId = params.sessionId;
        if (!z.string().uuid().safeParse(sessionId).success) {
          return json({ error: "Invalid session id" }, 400);
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const parsed = bodySchema.safeParse(payload);
        if (!parsed.success) {
          return json({ error: "Invalid payload", issues: parsed.error.issues }, 422);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: session } = await supabaseAdmin
          .from("sessions")
          .select("id")
          .eq("id", sessionId)
          .maybeSingle();
        if (!session) return json({ error: "Session not found" }, 404);

        try {
          const { ingestFrames } = await import("@/lib/trackshift/pipeline.server");
          const result = await ingestFrames(sessionId, parsed.data.frames);
          return json({ ok: true, ...result });
        } catch (error) {
          console.error("[ingest] failed", error);
          return json({ error: "Ingest failed" }, 500);
        }
      },
    },
  },
});
