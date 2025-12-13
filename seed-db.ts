import "dotenv/config";  // <-- Add this FIRST
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { studios, timeSlots } from "./drizzle/schema";

// Check if DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in .env file");
}

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

async function seed() {
  console.log("Seeding database...");
  console.log("Connecting to:", process.env.DATABASE_URL?.substring(0, 50) + "..."); // Log partial URL for debugging

  // Create studios
  const studioData = [
    {
      name: "Studio 4",
      description: "Spacious dance studio perfect for group classes and rehearsals. Features mirrors, sound system, and professional flooring.",
      hourlyRate: 5000,
      image: "/studios/studio4.jpg",
      isActive: true,
    },
    {
      name: "Studio 5",
      description: "Medium-sized studio ideal for private lessons and small group sessions. Equipped with mirrors and sound system.",
      hourlyRate: 4000,
      image: "/studios/studio5.jpg",
      isActive: true,
    },
    {
      name: "Studio 6",
      description: "Intimate studio space perfect for one-on-one coaching and practice sessions. Professional equipment included.",
      hourlyRate: 3500,
      image: "/studios/studio6.jpg",
      isActive: true,
    },
  ];

  console.log("Creating studios...");
  await db.insert(studios).values(studioData);
  console.log("Studios created successfully!");

  // Create time slots for each studio (Monday-Sunday, 9 AM - 10 PM)
  const timeSlotData = [];
  const studioIds = [1, 2, 3];

  for (const studioId of studioIds) {
    for (let day = 0; day <= 6; day++) {
      for (let hour = 9; hour < 22; hour++) {
        timeSlotData.push({
          studioId,
          dayOfWeek: day,
          startTime: `${hour.toString().padStart(2, "0")}:00`,
          endTime: `${(hour + 1).toString().padStart(2, "0")}:00`,
          isAvailable: true,
        });
      }
    }
  }

  console.log("Creating time slots...");
  await db.insert(timeSlots).values(timeSlotData);
  console.log("Time slots created successfully!");

  console.log("Database seeded successfully!");
  
  await client.end();
  process.exit(0);
}

seed().catch(async (error) => {
  console.error("Error seeding database:", error);
  await client.end();
  process.exit(1);
});