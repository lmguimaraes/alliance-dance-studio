import { drizzle } from "drizzle-orm/mysql2";
import { studios, timeSlots } from "./drizzle/schema";

const db = drizzle(process.env.DATABASE_URL!);

async function seed() {
  console.log("Seeding database...");

  // Create studios
  const studioData = [
    {
      name: "Studio 4",
      description: "Spacious dance studio perfect for group classes and rehearsals. Features mirrors, sound system, and professional flooring.",
      hourlyRate: 5000, // $50.00 in cents
      image: "/studios/studio4.jpg",
      isActive: 1,
    },
    {
      name: "Studio 5",
      description: "Medium-sized studio ideal for private lessons and small group sessions. Equipped with mirrors and sound system.",
      hourlyRate: 4000, // $40.00 in cents
      image: "/studios/studio5.jpg",
      isActive: 1,
    },
    {
      name: "Studio 6",
      description: "Intimate studio space perfect for one-on-one coaching and practice sessions. Professional equipment included.",
      hourlyRate: 3500, // $35.00 in cents
      image: "/studios/studio6.jpg",
      isActive: 1,
    },
  ];

  console.log("Creating studios...");
  await db.insert(studios).values(studioData);
  console.log("Studios created successfully!");

  // Create time slots for each studio (Monday-Sunday, 9 AM - 10 PM)
  const timeSlotData = [];
  const studioIds = [1, 2, 3]; // Assuming auto-increment starts at 1

  for (const studioId of studioIds) {
    for (let day = 0; day <= 6; day++) {
      // 0 = Sunday, 6 = Saturday
      for (let hour = 9; hour < 22; hour++) {
        timeSlotData.push({
          studioId,
          dayOfWeek: day,
          startTime: `${hour.toString().padStart(2, "0")}:00`,
          endTime: `${(hour + 1).toString().padStart(2, "0")}:00`,
          isAvailable: 1,
        });
      }
    }
  }

  console.log("Creating time slots...");
  await db.insert(timeSlots).values(timeSlotData);
  console.log("Time slots created successfully!");

  console.log("Database seeded successfully!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Error seeding database:", error);
  process.exit(1);
});
