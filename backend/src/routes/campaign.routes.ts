import { Router, Request, Response } from "express";
import { pool } from "../db";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { emailQueue } from "../queues/email.queue";


const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

// CREATE A NEW CAMPAIGN
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      campaignName,
      subject,
      emailBody,
      scheduledAt,
      delaySeconds,
      hourlyLimit,
    } = req.body;

    // Validate required fields
    if (!campaignName || !subject || !emailBody) {
      return res.status(400).json({
        success: false,
        message: "Campaign name, subject and email body are required",
      });
    }

    // Validate optional numeric settings
    const delay = Number(delaySeconds ?? 0);
    const limit = Number(hourlyLimit ?? 100);

    if (!Number.isInteger(delay) || delay < 0 ||
        !Number.isInteger(limit) || limit < 1) {
      return res.status(400).json({
        success: false,
        message: "Delay must be non-negative and hourly limit must be positive",
      });
    }

    // Validate scheduled date if provided
    let scheduleDate: Date | null = null;

    if (scheduledAt) {
      scheduleDate = new Date(scheduledAt);

      if (Number.isNaN(scheduleDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid scheduled date",
        });
      }
    }

    const status = scheduleDate ? "scheduled" : "draft";

    // Save campaign in PostgreSQL
    const result = await pool.query(
      `INSERT INTO campaigns
       (campaign_name, subject, email_body, scheduled_at,
        delay_seconds, hourly_limit, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        campaignName,
        subject,
        emailBody,
        scheduleDate,
        delay,
        limit,
        status,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Campaign created successfully",
      campaign: result.rows[0],
    });

  } catch (error) {
    console.error("Create campaign error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create campaign",
    });
  }
});

// GET ALL CAMPAIGNS
router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM campaigns ORDER BY created_at DESC`
    );

    return res.status(200).json({
      success: true,
      total: result.rows.length,
      campaigns: result.rows,
    });

  } catch (error) {
    console.error("Get campaigns error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch campaigns",
    });
  }
});



// UPLOAD CSV AND SAVE RECIPIENTS
router.post(
  "/:id/recipients/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const campaignId = Number(req.params.id);

    if (!Number.isInteger(campaignId) || campaignId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid campaign ID",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a CSV file",
      });
    }

    const client = await pool.connect();

    try {
      const records = parse(req.file.buffer.toString("utf-8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      }) as Array<Record<string, string>>;

      if (
        records.length === 0 ||
        !Object.keys(records[0]).includes("email")
      ) {
        return res.status(400).json({
          success: false,
          message: "CSV must contain an email column",
        });
      }

      await client.query("BEGIN");

      const campaign = await client.query(
        "SELECT id FROM campaigns WHERE id = $1",
        [campaignId]
      );

      if (campaign.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      let inserted = 0;
      let skipped = 0;
      const seenEmails = new Set<string>();

      for (const record of records) {
        const name = record.name?.trim() || null;
        const email = record.email?.trim().toLowerCase();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          skipped++;
          continue;
        }

        if (seenEmails.has(email)) {
          skipped++;
          continue;
        }

        seenEmails.add(email);

        const result = await client.query(
          `INSERT INTO recipients (campaign_id, name, email)
           VALUES ($1, $2, $3)
           ON CONFLICT (campaign_id, email) DO NOTHING
           RETURNING id`,
          [campaignId, name, email]
        );

        if (result.rowCount && result.rowCount > 0) {
          inserted++;
        } else {
          skipped++;
        }
      }

      const total = await client.query(
        "SELECT COUNT(*) FROM recipients WHERE campaign_id = $1",
        [campaignId]
      );

      await client.query(
        `UPDATE campaigns
         SET total_recipients = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [Number(total.rows[0].count), campaignId]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "CSV uploaded successfully",
        inserted,
        skipped,
        totalRecipients: Number(total.rows[0].count),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("CSV upload error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to upload CSV",
      });
    } finally {
      client.release();
    }
  }
);

// GET RECIPIENTS OF A CAMPAIGN
router.get("/:id/recipients", async (req: Request, res: Response) => {
  try {
    const campaignId = Number(req.params.id);

    if (!Number.isInteger(campaignId) || campaignId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid campaign ID",
      });
    }

    const result = await pool.query(
      `SELECT * FROM recipients
       WHERE campaign_id = $1
       ORDER BY id`,
      [campaignId]
    );

    return res.status(200).json({
      success: true,
      total: result.rows.length,
      recipients: result.rows,
    });
  } catch (error) {
    console.error("Get recipients error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch recipients",
    });
  }
});



// SCHEDULE EMAILS USING BULLMQ
router.post("/:id/schedule", async (req: Request, res: Response) => {
  try {
    const campaignId = Number(req.params.id);

    if (!Number.isInteger(campaignId) || campaignId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid campaign ID",
      });
    }

    // Find the campaign
    const campaignResult = await pool.query(
      "SELECT * FROM campaigns WHERE id = $1",
      [campaignId]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    const campaign = campaignResult.rows[0];

    // Find pending recipients
    const recipientsResult = await pool.query(
      `SELECT * FROM recipients
       WHERE campaign_id = $1 AND status = 'pending'
       ORDER BY id`,
      [campaignId]
    );

    const recipients = recipientsResult.rows;

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No pending recipients found for this campaign",
      });
    }

    const startTime = campaign.scheduled_at
      ? new Date(campaign.scheduled_at).getTime()
      : Date.now();

    const delaySeconds = Number(campaign.delay_seconds || 0);

    let queuedCount = 0;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];

      const jobId = `email-${campaignId}-${recipient.id}`;

      // Avoid adding the same job twice
      const existingJob = await emailQueue.getJob(jobId);

      if (!existingJob) {
        const delay =
          Math.max(0, startTime - Date.now()) +
          i * delaySeconds * 1000;

        await emailQueue.add(
          "send-email",
          {
            campaignId,
            recipientId: recipient.id,
            recipientEmail: recipient.email,
            recipientName: recipient.name || "there",
            subject: campaign.subject,
            emailBody: campaign.email_body,
            hourlyLimit: Number(campaign.hourly_limit || 100),
          },
          {
            jobId,
            delay,
          }
        );
      }

      await pool.query(
        `UPDATE recipients
         SET status = 'scheduled', scheduled_at = $1
         WHERE id = $2`,
        [
          new Date(
            Math.max(0, startTime) + i * delaySeconds * 1000
          ),
          recipient.id,
        ]
      );

      queuedCount++;
    }

    await pool.query(
      `UPDATE campaigns
       SET status = 'scheduled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [campaignId]
    );

    return res.status(200).json({
      success: true,
      message: "Campaign emails added to the queue successfully",
      campaignId,
      queuedCount,
    });
  } catch (error) {
    console.error("Schedule campaign error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to schedule campaign emails",
    });
  }
});


export default router;
