import mongoose from "mongoose";

const SaleSchema = new mongoose.Schema(
  {
    // Store as YYYY-MM-DD in America/Chicago (simple + avoids timezone drift)
    date: { type: String, required: true, unique: true },
    sale: { type: Number, required: true, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

SaleSchema.index({ date: 1 }, { unique: true });

export default mongoose.models.Sale || mongoose.model("Sale", SaleSchema);
