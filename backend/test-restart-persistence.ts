import { emailQueue } from "./src/queues/email.queue";

async function createTestJob() {
  const job = await emailQueue.add(
    "restart-persistence-test",
    {
      campaignId: 7,
      recipientId: 19,
      recipientEmail: "autotest@example.com",
      recipientName: "Auto Test",
      subject: "Restart Persistence Test",
      emailBody: "This is only a persistence test.",
      hourlyLimit: 1000,
    },
    {
      jobId: `restart-persistence-test-${Date.now()}`,
      delay: 120000,
    }
  );

  console.log("Test job created.");
  console.log("Job ID:", job.id);
  console.log("Delay: 120 seconds");

  await emailQueue.close();
}

createTestJob().catch((error) => {
  console.error("Failed to create test job:", error);
  process.exit(1);
});