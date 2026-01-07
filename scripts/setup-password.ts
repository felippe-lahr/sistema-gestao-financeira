import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { users, userPasswords } from "../drizzle/schema";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function setupPassword() {
  const client = postgres(DATABASE_URL!);
  const db = drizzle(client);

  const email = "felippe.lahr@gmail.com";
  const password = "Zero2026_!";
  const name = "Felippe Lahr";

  console.log(`Setting up password for ${email}...`);

  // Find user
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  
  if (!user) {
    console.error(`User with email ${email} not found`);
    await client.end();
    process.exit(1);
  }

  console.log(`Found user: ${user.id} - ${user.name}`);

  // Update user name
  await db.update(users).set({ name }).where(eq(users.id, user.id));
  console.log(`Updated user name to: ${name}`);

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Check if password exists
  const [existingPassword] = await db.select().from(userPasswords).where(eq(userPasswords.userId, user.id)).limit(1);

  if (existingPassword) {
    await db.update(userPasswords).set({ passwordHash, updatedAt: new Date() }).where(eq(userPasswords.userId, user.id));
    console.log("Password updated");
  } else {
    await db.insert(userPasswords).values({ userId: user.id, passwordHash });
    console.log("Password created");
  }

  console.log("Done!");
  await client.end();
}

setupPassword().catch(console.error);
