
import { emailQueue } from "./src/queues/email.queue";

async function testDuplicateProtection() {
  try {
    const job = await emailQueue.add(
      "send-email",
      {
        campaignId: 7,
        recipientId: 19,
        recipientEmail: "autotest@example.com",
        recipientName: "Auto Test",
        subject: "Duplicate Protection Test",
        emailBody: "This test should not send an email.",
        hourlyLimit: 1000,
      },
      {
        jobId: `duplicate-protection-test-19-${Date.now()}`,
      }
    );

    console.log("Test job added successfully.");
    console.log("Job ID:", job.id);
    console.log("Waiting for the worker to process it...");
  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await emailQueue.close();
  }
}

testDuplicateProtection();

