import express from "express";
import { z } from "zod";
import { connectDB } from "../lib/db.js";
import { Reading } from "../lib/models/Reading.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

// Nice error if someone/esp32 sends invalid JSON
app.use((err, req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }
  return next(err);
});

const Payload = z.object({
  deviceId: z.string().min(1),
  temperature: z.number(),
  humidity: z.number(),
  aqi: z.number(),
  ts: z.string().datetime().optional(),
});

// health check
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

// Optional convenience redirect (your React app will live at /dashboard/)
app.get("/", (req, res) => res.redirect(302, "/dashboard/"));

// Ingest endpoint for ESP32 devices
app.post("/ingest", async (req, res) => {
  try {
    const key = req.header("x-api-key");
    if (!key || key !== process.env.INGEST_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parsed = Payload.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    await connectDB();

    const { deviceId, temperature, humidity, aqi, ts } = parsed.data;

    const doc = await Reading.create({
      ts: ts ? new Date(ts) : new Date(),
      meta: { deviceId },
      temperature,
      humidity,
      aqi,
    });

    return res.status(201).json({ ok: true, id: doc._id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// List known devices
app.get("/api/devices", async (req, res) => {
  try {
    await connectDB();
    const devices = await Reading.distinct("meta.deviceId");
    res.json({ ok: true, devices: devices.sort() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// Query readings by device + time window
app.get("/api/readings", async (req, res) => {
  try {
    const deviceId = String(req.query.deviceId || "");
    if (!deviceId) return res.status(400).json({ ok: false, error: "deviceId is required" });

    const limit = Math.min(parseInt(String(req.query.limit || "2000"), 10) || 2000, 5000);
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 6 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ ok: false, error: "Invalid from/to datetime" });
    }

    await connectDB();

    const docs = await Reading.find(
      { "meta.deviceId": deviceId, ts: { $gte: from, $lte: to } },
      { _id: 0, ts: 1, temperature: 1, humidity: 1, aqi: 1, "meta.deviceId": 1 }
    )
      .sort({ ts: 1 })
      .limit(limit)
      .lean();

    res.json({ ok: true, deviceId, from, to, count: docs.length, readings: docs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// Latest reading per device
app.get("/api/latest", async (req, res) => {
  try {
    await connectDB();
    const latest = await Reading.aggregate([
      { $sort: { ts: -1 } },
      {
        $group: {
          _id: "$meta.deviceId",
          ts: { $first: "$ts" },
          temperature: { $first: "$temperature" },
          humidity: { $first: "$humidity" },
          aqi: { $first: "$aqi" },
        },
      },
      { $project: { _id: 0, deviceId: "$_id", ts: 1, temperature: 1, humidity: 1, aqi: 1 } },
      { $sort: { deviceId: 1 } },
    ]);

    res.json({ ok: true, latest });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default app;