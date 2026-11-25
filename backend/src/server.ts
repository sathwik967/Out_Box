import express from "express";
import cors from "cors";
import "dotenv/config";
import { testDatabaseConnection } from "./db";
import { redisConnection } from "./redis";
import campaignRoutes from "./routes/campaign.routes";
import "./workers/email.worker";

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { emailQueue } from "./queues/email.queue";
import queueRoutes from "./routes/queue.routes";
import emailRoutes from "./routes/email.routes";
import { checkElasticsearchConnection, initElasticsearch } from "./services/elasticsearch";



const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/campaigns", campaignRoutes);
app.use("/api/queue", queueRoutes);
app.use("/api/emails", emailRoutes);

/*
 * ----------------------------------------------------
 * Bull Board - Queue Monitoring Dashboard
 * ----------------------------------------------------
 */

const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
  ],
  serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

/*
 * ----------------------------------------------------
 * Health Check
 * ----------------------------------------------------
 */

app.get("/health", async (_req, res) => {
  try {
    const dbResult = await testDatabaseConnection();
    const redisResult = await redisConnection.ping();
    const esConnected = await checkElasticsearchConnection();

    res.json({
      success: true,
      message: "Outbox Email Scheduler API is running",
      database: "Connected",
      databaseTime: dbResult,
      redis: redisResult,
      elasticsearch: esConnected ? "Connected" : "Disconnected",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Connection test failed",
    });
  }
});

/*
 * ----------------------------------------------------
 * Start Server
 * ----------------------------------------------------
 */

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Bull Board available at http://localhost:${PORT}/admin/queues`);

  await initElasticsearch().catch((err) => {
    console.warn("[Elasticsearch] Initialization warning:", err);
  });
});