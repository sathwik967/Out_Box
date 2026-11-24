
import { Router, Request, Response } from "express";
import { emailQueue } from "../queues/email.queue";

const router = Router();

/*
 * ----------------------------------------------------
 * GET /api/queue
 * Read-only Email Queue Monitoring API
 * ----------------------------------------------------
 */

router.get("/", async (_req: Request, res: Response) => {
  try {
    const counts = await emailQueue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
      "paused"
    );

    const states = [
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
      "paused",
    ] as const;

    const jobsByState = await Promise.all(
      states.map(async (state) => {
        const jobs = await emailQueue.getJobs(
          [state],
          0,
          49,
          true
        );

        return jobs.map((job) => ({
          id: job.id,
          name: job.name,
          state,
          campaignId: job.data.campaignId,
          recipientId: job.data.recipientId,
          recipientName: job.data.recipientName,
          recipientEmail: job.data.recipientEmail,
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts ?? 1,
          delay: job.opts.delay ?? 0,
          timestamp: job.timestamp,
          processedOn: job.processedOn ?? null,
          finishedOn: job.finishedOn ?? null,
          failedReason: job.failedReason ?? null,
        }));
      })
    );

    const jobs = jobsByState
      .flat()
      .sort((a, b) => b.timestamp - a.timestamp);

    res.json({
      success: true,
      counts,
      totalJobs: Object.values(counts).reduce(
        (total, count) => total + count,
        0
      ),
      jobs,
    });
  } catch (error) {
    console.error("Error fetching email queue:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch email queue information",
    });
  }
});

/*
 * ----------------------------------------------------
 * GET /api/queue/:jobId
 * Read-only Individual Email Job Details API
 * ----------------------------------------------------
 */

router.get("/:jobId", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    // Find the job using its BullMQ job ID.
    const job = await emailQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Email job not found",
      });
    }

    // Get the job's current state from BullMQ.
    const state = await job.getState();

    res.json({
      success: true,
      job: {
        id: job.id,
        name: job.name,
        state,

        // Recipient information
        campaignId: job.data.campaignId,
        recipientId: job.data.recipientId,
        recipientName: job.data.recipientName,
        recipientEmail: job.data.recipientEmail,

        // Retry information
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? 1,

        // Scheduling information
        delay: job.opts.delay ?? 0,
        timestamp: job.timestamp,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,

        // Failure information
        failedReason: job.failedReason ?? null,
        stacktrace: job.stacktrace ?? [],
      },
    });
  } catch (error) {
    console.error("Error fetching email job details:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch email job details",
    });
  }
});

export default router;
