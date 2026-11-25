import { Client } from "@elastic/elasticsearch";
import { pool } from "../db";

const esNode = process.env.ELASTICSEARCH_URL || "http://localhost:9200";
export const EMAIL_INDEX = process.env.ELASTICSEARCH_INDEX || "emails";

export const esClient = new Client({
  node: esNode,
});

export interface EmailDocument {
  id: string; // e.g. "recipient-19"
  campaignId: number;
  recipientId: number;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  status: string; // "scheduled" | "sent" | "failed"
  messageId?: string | null;
  scheduledAt?: string | null;
  sentAt?: string | null;
  errorMessage?: string | null;
  createdAt?: string | null;
}

export interface SearchEmailParams {
  q?: string;
  status?: string;
  recipient?: string;
  subject?: string;
  page?: number;
  limit?: number;
}

const emailIndexMapping = {
  properties: {
    id: { type: "keyword" as const },
    campaignId: { type: "integer" as const },
    recipientId: { type: "integer" as const },
    recipientEmail: { type: "keyword" as const },
    recipientName: { type: "text" as const },
    subject: { type: "text" as const },
    status: { type: "keyword" as const },
    messageId: { type: "keyword" as const },
    scheduledAt: { type: "date" as const },
    sentAt: { type: "date" as const },
    errorMessage: { type: "text" as const },
    createdAt: { type: "date" as const },
  },
};

/**
 * Check if Elasticsearch is reachable.
 */
export async function checkElasticsearchConnection(): Promise<boolean> {
  try {
    const health = await esClient.cluster.health({});
    return !!health;
  } catch (error) {
    return false;
  }
}

/**
 * Ensure the email index exists with the desired mapping.
 * Non-blocking: will catch and log error if Elasticsearch is unavailable.
 */
export async function initElasticsearch(): Promise<void> {
  try {
    const indexExists = await esClient.indices.exists({ index: EMAIL_INDEX });

    if (!indexExists) {
      await esClient.indices.create({
        index: EMAIL_INDEX,
        mappings: emailIndexMapping,
      });
      console.log(`[Elasticsearch] Index "${EMAIL_INDEX}" created with mapping.`);
    } else {
      console.log(`[Elasticsearch] Index "${EMAIL_INDEX}" already exists.`);
    }
  } catch (error) {
    console.warn(
      `[Elasticsearch] Warning: Could not initialize index "${EMAIL_INDEX}". Elasticsearch may be offline:`,
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Index or update an email document in Elasticsearch.
 * Safe & non-blocking: never throws to the caller to protect the primary email flow.
 */
export async function indexEmail(doc: EmailDocument): Promise<boolean> {
  try {
    await esClient.index({
      index: EMAIL_INDEX,
      id: doc.id,
      document: doc,
    });
    return true;
  } catch (error) {
    console.error(
      `[Elasticsearch] Failed to index document ${doc.id}:`,
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

/**
 * Search emails in Elasticsearch with text search, filtering, and pagination.
 */
export async function searchEmails(params: SearchEmailParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const from = (page - 1) * limit;

  const mustClauses: any[] = [];
  const filterClauses: any[] = [];

  // General text search across subject, recipientName, and recipientEmail
  if (params.q && params.q.trim()) {
    const trimmed = params.q.trim();
    mustClauses.push({
      bool: {
        should: [
          {
            multi_match: {
              query: trimmed,
              fields: ["subject^2", "recipientName", "recipientEmail^3"],
              fuzziness: "AUTO",
            },
          },
          {
            wildcard: {
              recipientEmail: `*${trimmed.toLowerCase()}*`,
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  }

  // Exact or partial email filter
  if (params.recipient && params.recipient.trim()) {
    const rec = params.recipient.trim().toLowerCase();
    mustClauses.push({
      bool: {
        should: [
          { term: { recipientEmail: rec } },
          { wildcard: { recipientEmail: `*${rec}*` } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  // Subject text search
  if (params.subject && params.subject.trim()) {
    mustClauses.push({
      match: {
        subject: {
          query: params.subject.trim(),
        },
      },
    });
  }

  // Status exact filter
  if (params.status && params.status.trim()) {
    filterClauses.push({
      term: {
        status: params.status.trim().toLowerCase(),
      },
    });
  }

  const query: any = {
    bool: {},
  };

  if (mustClauses.length > 0) {
    query.bool.must = mustClauses;
  } else if (filterClauses.length === 0) {
    query.bool.must = [{ match_all: {} }];
  }

  if (filterClauses.length > 0) {
    query.bool.filter = filterClauses;
  }

  try {
    const response = await esClient.search<EmailDocument>({
      index: EMAIL_INDEX,
      from,
      size: limit,
      query,
      sort: [
        { sentAt: { order: "desc", unmapped_type: "date" } },
        { scheduledAt: { order: "desc", unmapped_type: "date" } },
        { createdAt: { order: "desc", unmapped_type: "date" } },
      ],
    });

    const total =
      typeof response.hits.total === "number"
        ? response.hits.total
        : response.hits.total?.value || 0;

    const emails = response.hits.hits.map((hit) => hit._source as EmailDocument);

    return {
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      emails,
    };
  } catch (error) {
    console.error(
      "[Elasticsearch] Search query failed:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

/**
 * Sync existing database sent email logs and scheduled recipients into Elasticsearch.
 * Allows retroactively indexing existing data without triggering emails or altering DB.
 */
export async function syncExistingEmails(): Promise<{
  totalLogs: number;
  indexed: number;
  failed: number;
}> {
  try {
    // 1. Fetch all email_logs with campaign and recipient details
    const logsResult = await pool.query(`
      SELECT 
        l.id as log_id,
        l.campaign_id,
        l.recipient_id,
        l.recipient_email,
        l.status,
        l.message_id,
        l.error_message,
        l.sent_at,
        c.subject,
        r.name as recipient_name,
        r.scheduled_at,
        r.created_at
      FROM email_logs l
      LEFT JOIN campaigns c ON l.campaign_id = c.id
      LEFT JOIN recipients r ON l.recipient_id = r.id
      ORDER BY l.id ASC
    `);

    let indexed = 0;
    let failed = 0;

    for (const row of logsResult.rows) {
      const doc: EmailDocument = {
        id: `recipient-${row.recipient_id || `log-${row.log_id}`}`,
        campaignId: row.campaign_id,
        recipientId: row.recipient_id,
        recipientEmail: row.recipient_email,
        recipientName: row.recipient_name || null,
        subject: row.subject || "No Subject",
        status: row.status,
        messageId: row.message_id || null,
        scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null,
        sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
        errorMessage: row.error_message || null,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      };

      const success = await indexEmail(doc);
      if (success) {
        indexed++;
      } else {
        failed++;
      }
    }

    // Refresh the index so documents are immediately searchable
    try {
      await esClient.indices.refresh({ index: EMAIL_INDEX });
    } catch {
      // Ignore refresh error
    }

    return {
      totalLogs: logsResult.rowCount || 0,
      indexed,
      failed,
    };
  } catch (error) {
    console.error("[Elasticsearch] Sync existing emails failed:", error);
    throw error;
  }
}
