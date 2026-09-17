import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { verifyDatabaseConnection, closeDatabasePool } from "./db/index.js";

async function main() {
  // Verify database connectivity before accepting requests
  try {
    await verifyDatabaseConnection();
  } catch (error) {
    console.error("❌ Failed to connect to database:", error);
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`
🏥 MedSeek Backend
   Environment: ${env.NODE_ENV}
   Port:        ${env.PORT}
   Host:        0.0.0.0
   CORS origin: ${env.CORS_ORIGIN}
   Health:      http://localhost:${env.PORT}/health
    `);
  });

  // --------------- Graceful shutdown ---------------

  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal} — shutting down gracefully...`);

    server.close(async () => {
      await closeDatabasePool();
      console.log("👋 Server closed");
      process.exit(0);
    });

    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
      console.error("⚠️  Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
