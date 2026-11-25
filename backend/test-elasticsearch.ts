import "dotenv/config";
import {
  checkElasticsearchConnection,
  initElasticsearch,
  syncExistingEmails,
  searchEmails,
  EMAIL_INDEX,
} from "./src/services/elasticsearch";

async function runTest() {
  console.log("=== Testing Elasticsearch Integration ===");

  // 1. Connection check
  const isConnected = await checkElasticsearchConnection();
  console.log("Elasticsearch connected:", isConnected);

  if (!isConnected) {
    console.error("Elasticsearch is not reachable. Exiting test.");
    process.exit(1);
  }

  // 2. Initialize index
  console.log(`Initializing index "${EMAIL_INDEX}"...`);
  await initElasticsearch();

  // 3. Sync existing sent emails from PostgreSQL
  console.log("Syncing existing database emails to Elasticsearch...");
  const syncResult = await syncExistingEmails();
  console.log("Sync result:", syncResult);

  // 4. Test search by keyword "autotest"
  console.log("Searching for query: 'autotest'...");
  const searchResultAutotest = await searchEmails({ q: "autotest" });
  console.log(`Found ${searchResultAutotest.total} results for 'autotest':`);
  console.log(
    searchResultAutotest.emails.map((e) => ({
      id: e.id,
      recipientEmail: e.recipientEmail,
      recipientName: e.recipientName,
      status: e.status,
      messageId: e.messageId,
    }))
  );

  // 5. Test search by status "sent"
  console.log("Searching for status: 'sent'...");
  const searchResultSent = await searchEmails({ status: "sent", limit: 5 });
  console.log(`Found ${searchResultSent.total} sent emails (showing up to 5):`);
  console.log(
    searchResultSent.emails.map((e) => ({
      id: e.id,
      recipientEmail: e.recipientEmail,
      status: e.status,
      sentAt: e.sentAt,
    }))
  );

  console.log("=== All Elasticsearch Tests Completed Successfully ===");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
