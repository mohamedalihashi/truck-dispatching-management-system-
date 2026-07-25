import "dotenv/config";
import http from "node:http";
import { Server } from "socket.io";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { db } from "./services/dbService.js";
import { createApp } from "./createApp.js";
import { retryDueSms } from "./services/smsService.js";

const port = Number(process.env.PORT || 4000);
const uniqueOrigins = [
  ...(process.env.CLIENT_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean),
  "https://truck-dispatche.netlify.app",
  "https://truck-dispa.vercel.app",
  "http://127.0.0.1:5173",
  "http://localhost:5173"
];

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [...new Set(uniqueOrigins)],
    credentials: true
  }
});

app.set("io", io);

io.on("connection", (socket) => {
  socket.emit("system.ready", { message: "TruckDispatch realtime connected" });
  socket.on("location.updated", (payload) => {
    socket.broadcast.emit("location.updated", payload);
  });
  socket.on("join", (room) => {
    if (room) socket.join(String(room));
  });
});

server.listen(port, () => {
  console.log(`TruckDispatch API running on http://127.0.0.1:${port}`);
  console.log(`Health + integrations: http://127.0.0.1:${port}/api/health`);
});

const smsRetryTimer = !process.env.VERCEL
  ? setInterval(() => void retryDueSms().catch((error) => console.warn("SMS retry failed:", error.message)), 60_000)
  : null;
smsRetryTimer?.unref();

void (async () => {
  try {
    await connectDatabase();
    if (process.env.NODE_ENV !== "production") {
      const seedResult = await db.seedIfEmpty();
      if (seedResult.seeded) console.log("Development demo data seeded.");
      await db.ensureAdmin();
      console.log("Development admin account is ready.");
    }
  } catch (error) {
    console.warn("Database startup connection pending; requests will retry automatically:", error.message);
  }
})();

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the other backend process first.`);
    process.exit(1);
  }
  throw error;
});

async function shutdown(signal) {
  console.log(`${signal} received — closing database connections`);
  await disconnectDatabase();
  if (smsRetryTimer) clearInterval(smsRetryTimer);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
