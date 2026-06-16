import { beforeEach } from "vitest";
import { prisma } from "@/lib/db";

// Set test database
process.env.DATABASE_URL = "file:./test.db";

// Clear database tables before each test to ensure isolation
beforeEach(async () => {
  await prisma.artifactVersion.deleteMany().catch(() => {});
  await prisma.artifact.deleteMany().catch(() => {});
  await prisma.event.deleteMany().catch(() => {});
  await prisma.tokenUsage.deleteMany().catch(() => {});
  await prisma.sessionSnapshot.deleteMany().catch(() => {});
  await prisma.session.deleteMany().catch(() => {});
});
