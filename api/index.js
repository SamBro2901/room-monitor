import express from "express";
import { z } from "zod";
import { connectDB } from "../lib/db.js";
import { Reading } from "../lib/models/Reading.js";

const app = express();
app.use(express.json({ limit: "64kb" }));

const Payload = z.object({
  deviceId: z.string().min(1),
  temperature: z.number(),
  humidity: z.number(),
  aqi: z.number(),
  ts: z.string().datetime().optional()
});

// health check
app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/ingest", async (req, res) => {
  try {
    // Simple header auth for ESP32
    const key = req.header("x-api-key");
    if (!key || key !== process.env.INGEST_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parsed = Payload.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        error: "Validation failed",
        details: parsed.error.flatten()
      });
    }

    await connectDB();

    const { deviceId, temperature, humidity, aqi, ts } = parsed.data;

    const doc = await Reading.create({
      ts: ts ? new Date(ts) : new Date(),
      meta: { deviceId },
      temperature,
      humidity,
      aqi
    });

    return res.json({ ok: true, id: doc._id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// IMPORTANT: export the app as the serverless handler
export default app;
