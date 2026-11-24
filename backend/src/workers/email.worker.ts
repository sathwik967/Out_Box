
import { Worker, Job, DelayedError } from "bullmq";
import nodemailer from "nodemailer";
import { redisConnection } from "../redis";
import { pool } from "../db";
import { EmailJobData } from "../queues/email.queue";
import { checkRateLimit } from "../services/rateLimiter";
import { checkMinimumDelay } from "../services/minimumDelay";

// A definite SMTP response means the server explicitly rejected the email.
// Network errors without an SMTP response are treated as uncertain.
function hasDefiniteSmtpResponse(error: unknown): boolean {
  const responseCode = (error as { responseCode?: unknown })
    ?.responseCode;

  return typeof responseCode === "number";
}

// Save a confirmed successful delivery using one database transaction.
async function recordSuccessfulDelivery(
  campaignId: number,
  recipientId: number,
  recipientEmail: string,
  messageId: string
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const recipientResult = await client.query(
      `UPDATE recipients
       SET status = 'sent',
           sent_at = CURRENT_TIMESTAMP,
           error_message = NULL
       WHERE id = $1
         AND status = 'sending'
       RETURNING id`,
      [recipientId]
    );

    if (recipientResult.rowCount !== 1) {
      throw new Error(
        `Could not mark recipient ${recipientId} as sent. ` +
        "The recipient is no longer in sending status."
      );
    }

    const logResult = await client.query(
      `INSERT INTO email_logs
       (campaign_id, recipient_id, recipient_email, status, message_id)
       VALUES ($1, $2, $3, 'sent', $4)
       ON CONFLICT (recipient_id)
       WHERE status = 'sent'
         AND recipient_id IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [campaignId, recipientId, recipientEmail, messageId]
    );

    // Increment the campaign count only when a new success log was inserted.
    if (logResult.rowCount === 1) {
      await client.query(
        `UPDATE campaigns
         SET sent_count = sent_count + 1,
             status = CASE
               WHEN sent_count + 1 + failed_count >= total_recipients
                    AND total_recipients > 0
               THEN 'completed'
               ELSE status
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [campaignId]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Handle an explicit SMTP rejection.
// Retryable rejections restore the original recipient status.
// The final rejection marks the recipient failed.
async function recordDefinitiveSmtpFailure(
  campaignId: number,
  recipientId: number,
  recipientEmail: string,
  originalStatus: string,
  errorMessage: string,
  isLastAttempt: boolean
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const newStatus = isLastAttempt
      ? "failed"
      : originalStatus;

    const result = await client.query(
      `UPDATE recipients
       SET status = $1,
           error_message = $2
       WHERE id = $3
         AND status = 'sending'
       RETURNING id`,
      [newStatus, errorMessage, recipientId]
    );

    if (result.rowCount === 1 && isLastAttempt) {
      await client.query(
        `INSERT INTO email_logs
         (campaign_id, recipient_id, recipient_email, status, error_message)
         VALUES ($1, $2, $3, 'failed', $4)`,
        [campaignId, recipientId, recipientEmail, errorMessage]
      );

      await client.query(
        `UPDATE campaigns
         SET failed_count = failed_count + 1,
             status = CASE
               WHEN sent_count + failed_count + 1 >= total_recipients
                    AND total_recipients > 0
               THEN 'completed'
               ELSE status
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [campaignId]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function startEmailWorker() {
  // Create a free Ethereal testing account.
  const testAccount = await nodemailer.createTestAccount();

  const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  const senderHourlyLimit = Number(
    process.env.SENDER_HOURLY_LIMIT || 1000
  );

  if (
    !Number.isInteger(senderHourlyLimit) ||
    senderHourlyLimit < 1
  ) {
    throw new Error(
      "SENDER_HOURLY_LIMIT must be a positive integer"
    );
  }

  const concurrency = Number(
    process.env.WORKER_CONCURRENCY || 5
  );

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(
      "WORKER_CONCURRENCY must be a positive integer"
    );
  }

  console.log("Ethereal test account created");
  console.log("Ethereal username:", testAccount.user);
  console.log("Sender hourly limit:", senderHourlyLimit);

  const worker = new Worker<EmailJobData>(
    "email-queue",
    async (job: Job<EmailJobData>, token?: string) => {
      const {
        campaignId,
        recipientId,
        recipientEmail,
        recipientName,
        subject,
        emailBody,
        hourlyLimit,
      } = job.data;

      // STEP 1: Check the current recipient status.
      const recipientResult = await pool.query(
        `SELECT status
         FROM recipients
         WHERE id = $1
           AND campaign_id = $2`,
        [recipientId, campaignId]
      );

      if (recipientResult.rowCount === 0) {
        throw new Error(
          `Recipient ${recipientId} was not found`
        );
      }

      const originalStatus: string =
        recipientResult.rows[0].status;

      if (originalStatus === "sent") {
        console.log(
          `Skipping ${recipientEmail}: already marked as sent`
        );

        return {
          success: true,
          skipped: true,
          reason: "Already sent",
        };
      }

      if (originalStatus === "sending") {
        throw new Error(
          `Delivery outcome for ${recipientEmail} is uncertain. ` +
          "The recipient is already marked as sending. " +
          "Automatic resend prevented; manual reconciliation required."
        );
      }

      if (
        originalStatus !== "pending" &&
        originalStatus !== "scheduled"
      ) {
        console.log(
          `Skipping ${recipientEmail}: recipient status is ${originalStatus}`
        );

        return {
          success: true,
          skipped: true,
          reason: `Recipient status is ${originalStatus}`,
        };
      }

      const campaignHourlyLimit = Number(hourlyLimit);

      if (
        !Number.isInteger(campaignHourlyLimit) ||
        campaignHourlyLimit < 1
      ) {
        throw new Error(
          `Invalid hourly limit for campaign ${campaignId}`
        );
      }

      // STEP 2: Check campaign and sender hourly limits.
      const rateLimit = await checkRateLimit(
        campaignId,
        testAccount.user,
        campaignHourlyLimit,
        senderHourlyLimit,
        String(job.id)
      );

      if (!rateLimit.allowed) {
        console.log(
          `Hourly limit reached. Rescheduling ${recipientEmail}. ` +
          `Retry in ${rateLimit.retryAfterSeconds} seconds.`
        );

        if (!token) {
          throw new Error("Missing BullMQ job lock token");
        }

        await job.moveToDelayed(
          Date.now() + rateLimit.retryAfterSeconds * 1000,
          token
        );

        throw new DelayedError();
      }

      // STEP 3: Check minimum delay between emails.
      const delayCheck = await checkMinimumDelay(String(job.id));

      if (!delayCheck.allowed) {
        console.log(
          `Minimum delay active. Rescheduling ${recipientEmail}. ` +
          `Retry in ${delayCheck.retryAfterMs} milliseconds.`
        );

        if (!token) {
          throw new Error("Missing BullMQ job lock token");
        }

        await job.moveToDelayed(
          Date.now() + delayCheck.retryAfterMs,
          token
        );

        throw new DelayedError();
      }

      // STEP 4: Atomically claim this recipient.
      // Only one worker can change pending/scheduled to sending.
      const claimResult = await pool.query(
        `UPDATE recipients
         SET status = 'sending',
             error_message = NULL
         WHERE id = $1
           AND campaign_id = $2
           AND status = $3
         RETURNING id`,
        [recipientId, campaignId, originalStatus]
      );

      if (claimResult.rowCount !== 1) {
        const latestResult = await pool.query(
          `SELECT status
           FROM recipients
           WHERE id = $1`,
          [recipientId]
        );

        const latestStatus = latestResult.rows[0]?.status;

        if (latestStatus === "sent") {
          return {
            success: true,
            skipped: true,
            reason: "Already sent by another worker",
          };
        }

        throw new Error(
          `Could not claim recipient ${recipientId}. ` +
          `Current status: ${latestStatus || "unknown"}`
        );
      }

      console.log(`Sending email to ${recipientEmail}`);

      // STEP 5: Send the email.
      let info;

      try {
        info = await transporter.sendMail({
          from: `"Outbox Scheduler" <${testAccount.user}>`,
          to: recipientEmail,
          subject,
          text: emailBody.replace(
            /\{\{\s*name\s*\}\}/gi,
            recipientName || "there"
          ),
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Unknown SMTP error";

        const isLastAttempt =
          job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

        if (hasDefiniteSmtpResponse(error)) {
          // The SMTP server explicitly rejected the email.
          // It is safe to retry according to BullMQ's attempt policy.
          await recordDefinitiveSmtpFailure(
            campaignId,
            recipientId,
            recipientEmail,
            originalStatus,
            errorMessage,
            isLastAttempt
          );

          console.error(
            `SMTP rejected email to ${recipientEmail}:`,
            errorMessage
          );
        } else {
          // No definitive SMTP response: the server may have accepted
          // the email before the connection failed.
          // Keep status as sending to prevent an automatic duplicate.
          console.error(
            `Uncertain SMTP outcome for ${recipientEmail}:`,
            errorMessage
          );
        }

        throw error;
      }

      // STEP 6: SMTP accepted the email.
      // Persist success using a single PostgreSQL transaction.
      // If this transaction fails, the recipient remains sending.
      // A BullMQ retry will therefore not blindly resend it.
      await recordSuccessfulDelivery(
        campaignId,
        recipientId,
        recipientEmail,
        info.messageId
      );

      const previewUrl = nodemailer.getTestMessageUrl(info);

      console.log(`Email sent to ${recipientEmail}`);
      console.log("Ethereal preview:", previewUrl);

      return {
        success: true,
        messageId: info.messageId,
      };
    },
    {
      connection: redisConnection,
      concurrency,
    }
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, error) => {
    console.error(
      `Job ${job?.id} failed:`,
      error.message
    );
  });

  console.log("Email worker started successfully");
}

startEmailWorker().catch((error) => {
  console.error("Failed to start email worker:", error);
});
