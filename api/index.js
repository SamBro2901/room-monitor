import express from "express";
import { z } from "zod";
import { connectDB } from "../lib/db.js";
import { Reading } from "../lib/models/Reading.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

// --- Dashboard / Read API auth (protects /api/*) ---
function getDashboardKey(req) {
  // Prefer Authorization: Bearer <key>
  const auth = req.header("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];

  // Also accept x-dashboard-key: <key>
  return req.header("x-dashboard-key") || "";
}

function requireDashboardKey(req, res, next) {
  const required = process.env.DASHBOARD_API_KEY;
  if (!required) {
    // Fail closed: don't expose data if key is not configured
    return res.status(500).json({ ok: false, error: "DASHBOARD_API_KEY not configured" });
  }

  const provided = getDashboardKey(req);
  if (!provided || provided !== required) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
}

// Apply to all read API endpoints
app.use("/api", requireDashboardKey);


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

// --- helper: parse bucket like "1m", "5m", "15m", "30m", "1h" ---
function parseBucket(bucketStr) {
  if (!bucketStr) return null;
  const m = String(bucketStr).trim().match(/^(\d+)\s*([smhd])$/i);
  if (!m) return null;

  const n = Number(m[1]);
  const unit = m[2].toLowerCase();

  if (!Number.isFinite(n) || n <= 0) return null;

  // Only allow what we need (minutes/hours); keep it strict
  if (unit === "m") return { unit: "minute", binSize: n };
  if (unit === "h") return { unit: "hour", binSize: n };

  return null;
}

// Query readings by device + time window (raw OR aggregated)
app.get("/api/readings", async (req, res) => {
  try {
    const deviceId = String(req.query.deviceId || "");
    if (!deviceId) return res.status(400).json({ ok: false, error: "deviceId is required" });

    const limit = Math.min(parseInt(String(req.query.limit || "5000"), 10) || 5000, 20000);
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 6 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ ok: false, error: "Invalid from/to datetime" });
    }

    await connectDB();

    // If bucket is provided -> aggregated response
    const bucket = parseBucket(req.query.bucket);
    const tz = "Europe/Berlin"; // you can make this env-configurable if you want

    if (bucket) {
      const pipeline = [
        {
          $match: {
            "meta.deviceId": deviceId,
            ts: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: {
              $dateTrunc: {
                date: "$ts",
                unit: bucket.unit,
                binSize: bucket.binSize,
                timezone: tz,
              },
            },

            // temperature
            temperatureAvg: { $avg: "$temperature" },
            temperatureMin: { $min: "$temperature" },
            temperatureMax: { $max: "$temperature" },

            // humidity
            humidityAvg: { $avg: "$humidity" },
            humidityMin: { $min: "$humidity" },
            humidityMax: { $max: "$humidity" },

            // aqi
            aqiAvg: { $avg: "$aqi" },
            aqiMin: { $min: "$aqi" },
            aqiMax: { $max: "$aqi" },
          },
        },
        {
          $project: {
            _id: 0,
            ts: "$_id",

            temperatureAvg: 1,
            temperatureMin: 1,
            temperatureMax: 1,
            temperatureRange: { $subtract: ["$temperatureMax", "$temperatureMin"] },

            humidityAvg: 1,
            humidityMin: 1,
            humidityMax: 1,
            humidityRange: { $subtract: ["$humidityMax", "$humidityMin"] },

            aqiAvg: 1,
            aqiMin: 1,
            aqiMax: 1,
            aqiRange: { $subtract: ["$aqiMax", "$aqiMin"] },
          },
        },
        { $sort: { ts: 1 } },
        { $limit: limit },
      ];

      const docs = await Reading.aggregate(pipeline);
      return res.json({
        ok: true,
        mode: "aggregated",
        bucket: `${bucket.binSize}${bucket.unit === "minute" ? "m" : "h"}`,
        deviceId,
        from,
        to,
        count: docs.length,
        readings: docs,
      });
    }

    // Otherwise -> raw response (backwards compatible)
    const docs = await Reading.find(
      { "meta.deviceId": deviceId, ts: { $gte: from, $lte: to } },
      { _id: 0, ts: 1, temperature: 1, humidity: 1, aqi: 1, "meta.deviceId": 1 }
    )
      .sort({ ts: 1 })
      .limit(limit)
      .lean();

    return res.json({ ok: true, mode: "raw", deviceId, from, to, count: docs.length, readings: docs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
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