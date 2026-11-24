
import { Queue } from "bullmq";
import { redisConnection } from "../redis";

export interface EmailJobData {
  campaignId: number;
  recipientId: number;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  emailBody: string;
  hourlyLimit: number;
}

export const emailQueue = new Queue<EmailJobData>(
  "email-queue",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    },
  }
);

console.log("Email queue initialized successfully");
