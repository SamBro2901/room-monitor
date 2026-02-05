import mongoose from "mongoose";

const ReadingSchema = new mongoose.Schema(
  {
    ts: { type: Date, required: true },
    meta: {
      deviceId: { type: String, required: true }
    },
    temperature: { type: Number, required: true },
    humidity: { type: Number, required: true },
    aqi: { type: Number, required: true }
  },
  {
    collection: "readings",
    autoCreate: false
  }
);

export const Reading =
  mongoose.models.Reading || mongoose.model("Reading", ReadingSchema);
