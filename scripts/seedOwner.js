import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("Missing MONGODB_URI");

  await mongoose.connect(process.env.MONGODB_URI);

  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.log("Usage: node scripts/seedOwner.js <username> <password>");
    process.exit(1);
  }

  const existing = await User.findOne({ username: username.toLowerCase() });
  if (existing) {
    console.log("User already exists:", existing.username);
    process.exit(0);
  }

  const hashed = await bcrypt.hash(password, 12);

  const owner = await User.create({
    name: "Om",
    username: username.toLowerCase(),
    password: hashed,
    isOwner: false,
  });

  console.log("Created owner:", owner.username);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
