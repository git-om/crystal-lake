import "dotenv/config";
import mongoose from "mongoose";
import Sale from "../models/Sale.js";

/** Return YYYY-MM-DD for a day offset from today (America/Chicago) */
function chicagoISO(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Realistic daily sales: occasional slow days, occasional big days */
function randomSale() {
  const roll = Math.random();
  if (roll < 0.1) {
    // slow day: $300 – $800
    return +(300 + Math.random() * 500).toFixed(2);
  } else if (roll < 0.85) {
    // normal day: $1,200 – $7,500
    return +(1200 + Math.random() * 6300).toFixed(2);
  } else {
    // big day: $8,000 – $16,000
    return +(8000 + Math.random() * 8000).toFixed(2);
  }
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("Missing MONGODB_URI in .env.local");

  const userId = process.argv[2];
  const count  = process.argv[3];

  if (!userId) {
    console.log("Usage: node scripts/seedSales.js <createdBy_id> [count]");
    console.log("  createdBy_id  MongoDB ObjectId of the user (paste from DB)");
    console.log("  count         Number of entries to insert (default: random 50-100)");
    process.exit(1);
  }

  if (!mongoose.isValidObjectId(userId)) {
    console.error(`Invalid ObjectId: "${userId}"`);
    process.exit(1);
  }

  const createdBy = new mongoose.Types.ObjectId(userId);

  const requested = Number(count);
  const target =
    requested >= 1 && requested <= 365
      ? requested
      : Math.floor(Math.random() * 51) + 50; // random 50-100

  await mongoose.connect(process.env.MONGODB_URI);

  // Fetch existing dates to avoid duplicates
  const existingDocs = await Sale.find({}, "date").lean();
  const existingDates = new Set(existingDocs.map((s) => s.date));

  // Walk backwards from yesterday, collecting available dates.
  // Randomly skip ~20% of days to simulate realistic gaps (closed days, etc.)
  const dates = [];
  let offset = 1;
  while (dates.length < target && offset <= 600) {
    const iso = chicagoISO(offset);
    if (!existingDates.has(iso) && Math.random() < 0.8) {
      dates.push(iso);
    }
    offset++;
  }

  if (dates.length === 0) {
    console.log("No available dates to insert (all past dates already have data).");
    process.exit(0);
  }

  if (dates.length < target) {
    console.log(`⚠ Only ${dates.length} available dates found (${target} requested).`);
  }

  const docs = dates.map((date) => ({
    date,
    sale: randomSale(),
    createdBy,
  }));

  let inserted = 0;
  try {
    const result = await Sale.insertMany(docs, { ordered: false });
    inserted = result.length;
  } catch (e) {
    // BulkWriteError: some docs inserted before hitting a duplicate
    inserted = e?.insertedDocs?.length ?? e?.result?.insertedCount ?? 0;
    if (inserted === 0) throw e;
  }

  console.log(`✅ Inserted ${inserted} sales entries`);
  console.log(`   createdBy : ${userId}`);
  console.log(`   Date range: ${dates[dates.length - 1]} → ${dates[0]}`);
  console.log(`   Amounts   : $300 – $16,000`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
