import { Router, Request, Response } from "express";
import {
  searchEmails,
  checkElasticsearchConnection,
  syncExistingEmails,
} from "../services/elasticsearch";

const router = Router();

/**
 * GET /api/emails/search
 * Search indexed emails by keyword, status, recipient, or subject.
 */
router.get("/search", async (req: Request, res: Response) => {
  try {
    const { q, status, recipient, subject, page, limit } = req.query;

    const results = await searchEmails({
      q: typeof q === "string" ? q : undefined,
      status: typeof status === "string" ? status : undefined,
      recipient: typeof recipient === "string" ? recipient : undefined,
      subject: typeof subject === "string" ? subject : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

    return res.status(200).json(results);
  } catch (error) {
    console.error("Search API error:", error);

    // If Elasticsearch is not reachable or index not ready, return 503 with helpful message
    return res.status(503).json({
      success: false,
      message: "Elasticsearch search service is currently unavailable",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/emails/health
 * Elasticsearch health check endpoint.
 */
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const isConnected = await checkElasticsearchConnection();

    return res.status(isConnected ? 200 : 503).json({
      success: isConnected,
      service: "Elasticsearch",
      status: isConnected ? "connected" : "disconnected",
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      service: "Elasticsearch",
      status: "disconnected",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/emails/sync
 * Sync existing database records (email_logs and recipients) into Elasticsearch.
 */
router.post("/sync", async (_req: Request, res: Response) => {
  try {
    const result = await syncExistingEmails();

    return res.status(200).json({
      success: true,
      message: "Existing email logs successfully indexed into Elasticsearch",
      ...result,
    });
  } catch (error) {
    console.error("Elasticsearch sync error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to sync existing email logs to Elasticsearch",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
