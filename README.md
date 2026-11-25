# Outbox Email Scheduler

A full-stack email scheduling application that allows users to create email campaigns, upload recipients, schedule emails, and manage email delivery using a reliable background job processing system.

The application uses **Node.js, Express, TypeScript, React, PostgreSQL, Redis, BullMQ, and Nodemailer**.

## Tech Stack

### Backend
- Node.js
- Express.js
- TypeScript
- PostgreSQL
- Redis
- BullMQ
- Nodemailer
- Bull Board

### Frontend
- React
- TypeScript
- Vite

### Infrastructure
- Docker
- PostgreSQL 16
- Redis 7.2
- Elasticsearch 8.11 (container available; application indexing/search integration is not completed)

---

## Project Structure

```text
outbox-email-scheduler/
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── workers/
│   │   ├── ...
│   │   └── server.ts
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── src/
│   ├── package.json
│   └── ...
│
├── .gitignore
└── README.md
```

---

## Prerequisites

Make sure you have installed:

- Node.js and npm
- Docker Desktop
- Git
- PostgreSQL (optional if using the Docker container)
- Redis (optional if using the Docker container)

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/sathwik967/Out_Box.git
cd Out_Box
```

### 2. Start Redis and PostgreSQL

The application uses Docker containers for Redis and PostgreSQL.

Start the containers:

```bash
docker start outbox-redis
docker start outbox-postgres
```

Verify that they are running:

```bash
docker ps
```

Expected port mappings:

| Service | Port |
|---|---:|
| PostgreSQL | 5433 |
| Redis | 6380 |

The PostgreSQL database used by the application is:

```text
outbox_scheduler
```

Ensure the database and required tables are initialized before starting the backend.

---

## Backend Setup

### 1. Navigate to Backend

```bash
cd backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file inside the backend directory.

Example configuration (use the variable names expected by your backend source code):

```env
PORT=5000

DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5433/outbox_scheduler

REDIS_HOST=localhost
REDIS_PORT=6380

WORKER_CONCURRENCY=5
```

Configure the SMTP credentials as described in the Ethereal Email section below.

**Important:** Never upload your `.env` file or expose passwords and SMTP credentials in GitHub.

### 4. Start the Backend

```bash
npm run dev
```

The backend runs at:

```text
http://localhost:5000
```

Bull Board queue monitoring:

```text
http://localhost:5000/admin/queues
```

Bull Board provides visibility into waiting, active, delayed, completed, and failed jobs.

---

## Frontend Setup

Open another terminal.

### 1. Navigate to Frontend

```bash
cd frontend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Frontend

```bash
npm run dev
```

The frontend runs at:

```text
http://localhost:5173
```

Make sure the backend is running before using the application.

---

## Ethereal Email Configuration

The application uses **Ethereal Email** as a test SMTP service through Nodemailer.

Ethereal provides temporary test email accounts and allows developers to inspect generated emails without delivering them to real recipient inboxes.

### Setup Instructions

1. Visit https://ethereal.email/
2. Create a test email account.
3. Generate or obtain the SMTP credentials.
4. Configure the SMTP host, port, username, and password using the environment variable names expected by the backend.
5. Restart the backend.

Typical SMTP configuration:

```env
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=YOUR_ETHEREAL_USERNAME
SMTP_PASS=YOUR_ETHEREAL_PASSWORD
```

The exact variable names should match the application's Nodemailer configuration.

After an email is sent, Ethereal provides a preview URL that can be used to inspect the email content.

**Note:** Ethereal is used for development and testing. Emails are not delivered to actual recipient inboxes.

---

## Architecture Overview

### 1. Email Scheduling

The application uses BullMQ as its background job processing system.

The scheduling workflow:

1. A user creates an email campaign through the frontend.
2. Recipient information is uploaded using a CSV file.
3. Campaign and recipient information is stored in PostgreSQL.
4. Email jobs are added to the BullMQ queue.
5. Redis stores the queue data and delayed job information.
6. BullMQ workers process jobs when they become eligible.
7. Nodemailer sends the email through Ethereal SMTP.
8. Delivery status and email logs are updated in PostgreSQL.

This approach allows email processing to happen asynchronously without blocking the main API.

### 2. Persistence Across Server Restarts

Redis is used as the persistent storage backend for BullMQ.

Scheduled and delayed jobs are stored in Redis rather than being maintained only in application memory.

Therefore:

- Jobs remain stored when the backend server stops.
- Restarting the backend reconnects to the existing Redis queue.
- Pending and delayed jobs can continue processing after the server restarts.
- PostgreSQL stores campaign, recipient, and email log information.

The application was tested by creating a delayed job, restarting the backend before its execution time, and verifying that the job resumed after restart.

### 3. Rate Limiting

The application implements rate limiting to control email sending frequency.

Implemented controls include:

- A minimum delay of 10 seconds between individual email sends.
- Per-campaign hourly sending limits.
- Per-sender hourly sending limits.
- Redis-based counters and atomic reservation logic using Lua scripts.

These mechanisms help prevent excessive email sending and enforce configured sending limits.

### 4. Worker Concurrency

BullMQ workers process email jobs in the background.

Worker concurrency is configurable through an environment variable:

```env
WORKER_CONCURRENCY=5
```

This allows multiple eligible jobs to be processed concurrently while respecting the configured concurrency limit.

### 5. Duplicate Email Protection

The application includes duplicate-send protection.

- Recipients already marked as sent are skipped.
- Recipients are claimed before sending to prevent simultaneous processing.
- A unique partial PostgreSQL index prevents duplicate successful email log entries.
- Ambiguous SMTP failures are handled conservatively to avoid automatically sending the same email again.

This provides additional protection against duplicate email processing.

---

## Features Implemented

### Backend

| Feature | Description |
|---|---|
| Campaign Management | Create and retrieve email campaigns |
| CSV Upload | Upload recipient lists using CSV files |
| Email Scheduling | Schedule emails using BullMQ |
| Background Processing | Process emails asynchronously |
| Redis Persistence | Preserve delayed jobs across backend restarts |
| Rate Limiting | Enforce minimum delays and hourly limits |
| Worker Concurrency | Configure concurrent job processing |
| SMTP Integration | Send test emails using Ethereal and Nodemailer |
| Email Logging | Store email delivery logs |
| Duplicate Protection | Prevent duplicate successful sends |
| Campaign Completion | Automatically update campaign status when processing finishes |
| Bull Board | Monitor and manage queue jobs |
| Queue API | Retrieve queue counts and job details |

### Frontend

| Feature | Description |
|---|---|
| Dashboard | View campaign and email-related information |
| Campaign Management | Create and view campaigns |
| Compose Email | Create email campaigns with email content |
| CSV Recipient Upload | Upload recipients |
| Queue Management | View queue-related information |
| Job Details | Inspect individual queue job details |
| API Integration | Communicate with the backend |

---

## Testing and Verification

The following important scenarios were tested:

### 1. Duplicate-Send Protection

A test job was created for a recipient who had already received an email.

The worker detected the existing sent status and skipped sending another email.

The successful email log count remained unchanged.

### 2. Delayed Job Persistence

A delayed job was added to BullMQ.

The backend was stopped and restarted before the job's scheduled execution.

After restarting, the worker resumed processing the job from Redis.

This verified that delayed jobs survive backend restarts.

### 3. Queue Monitoring

Bull Board was used to inspect job states, including completed and delayed jobs.

### 4. Database Verification

PostgreSQL was used to verify recipient statuses and successful email log records.

---

## Assumptions and Trade-offs

- Ethereal Email is used for testing instead of a production email provider.
- Redis and PostgreSQL are run using Docker containers.
- The application uses a configurable worker concurrency value.
- Email sending is handled asynchronously using BullMQ.
- The current application does not provide a complete Google OAuth authentication flow.
- Slack OAuth notifications and multiple Ethereal sender account management are not implemented.
- Elasticsearch indexing and email search integration are not completed.
- A failure after SMTP acceptance but before the database transaction completes may require manual reconciliation. The application avoids automatically retrying an ambiguous send to reduce duplicate delivery risk.

---

## Future Improvements

- Google OAuth authentication.
- Slack integration for notifications.
- Multiple sender account support.
- Elasticsearch-powered email search.
- Improved email analytics and reporting.
- Production SMTP provider integration.
- Enhanced error recovery and monitoring.

---

## Conclusion

Outbox Email Scheduler demonstrates asynchronous email scheduling, background job processing, Redis-based persistence, rate limiting, worker concurrency, and duplicate-send protection.

The project focuses on reliable queue-based email processing and provides a foundation for building a scalable email scheduling system.
