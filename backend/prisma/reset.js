import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Clearing all database records (schema kept)…");

  // Child / dependent tables first (FK-safe order)
  await prisma.sharedTripBooking.deleteMany();
  await prisma.sharedTrip.deleteMany();
  await prisma.deliveryFeedbackToken.deleteMany();
  await prisma.tripFeedback.deleteMany();
  await prisma.earning.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.supportComplaint.deleteMany();
  await prisma.smsNotification.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.cargoRequest.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.verificationCode.deleteMany();
  await prisma.truck.deleteMany();
  await prisma.customerProfile.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();

  console.log("Database records cleared successfully. Tables and schema unchanged.");
}

main()
  .catch((error) => {
    console.error("Reset failed:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
