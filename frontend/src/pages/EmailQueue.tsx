
import { useCallback, useEffect, useMemo, useState } from "react";
import "./EmailQueue.css";

type JobState =
  | "waiting"
  | "active"
  | "delayed"
  | "completed"
  | "failed"
  | "paused";

type FilterState = "all" | JobState;

interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
}

interface QueueJob {
  id: string;
  name: string;
  state: JobState;
  campaignId: number;
  recipientId: number;
  recipientName: string;
  recipientEmail: string;
  attemptsMade: number;
  maxAttempts: number;
  delay: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  failedReason: string | null;
}

interface JobDetails extends QueueJob {
  stacktrace: string[];
}

interface QueueResponse {
  success: boolean;
  counts: QueueCounts;
  totalJobs: number;
  jobs: QueueJob[];
}

interface JobDetailsResponse {
  success: boolean;
  job: JobDetails;
}

interface EmailQueueProps {
  onBack: () => void;
}

const emptyCounts: QueueCounts = {
  waiting: 0,
  active: 0,
  delayed: 0,
  completed: 0,
  failed: 0,
  paused: 0,
};

const filters: FilterState[] = [
  "all",
  "waiting",
  "active",
  "delayed",
  "completed",
  "failed",
  "paused",
];

function EmailQueue({ onBack }: EmailQueueProps) {
  const [counts, setCounts] = useState<QueueCounts>(emptyCounts);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [filter, setFilter] = useState<FilterState>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Individual job details state
  const [selectedJob, setSelectedJob] = useState<JobDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  const fetchQueue = useCallback(async (manual = false) => {
    if (manual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      setError("");

      const response = await fetch("http://localhost:5000/api/queue");

      if (!response.ok) {
        throw new Error("Unable to fetch queue information.");
      }

      const data: QueueResponse = await response.json();

      if (!data.success) {
        throw new Error("The backend could not load queue information.");
      }

      setCounts(data.counts);
      setJobs(data.jobs);
      setTotalJobs(data.totalJobs);
      setLastUpdated(new Date());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while loading the queue."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Fetch individual job details
  const fetchJobDetails = async (jobId: string) => {
    setSelectedJob(null);
    setDetailsError("");
    setDetailsLoading(true);

    try {
      const response = await fetch(
        `http://localhost:5000/api/queue/${encodeURIComponent(jobId)}`
      );

      const data: JobDetailsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error("Unable to fetch job details.");
      }

      setSelectedJob(data.job);
    } catch (err) {
      setDetailsError(
        err instanceof Error
          ? err.message
          : "Something went wrong while fetching job details."
      );
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setSelectedJob(null);
    setDetailsError("");
    setDetailsLoading(false);
  };

  const filteredJobs = useMemo(() => {
    if (filter === "all") {
      return jobs;
    }

    return jobs.filter((job) => job.state === filter);
  }, [jobs, filter]);

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "—";

    return new Date(timestamp).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDuration = (milliseconds: number) => {
    if (!milliseconds) return "0 sec";

    const seconds = Math.round(milliseconds / 1000);

    if (seconds < 60) return `${seconds} sec`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return remainingSeconds
      ? `${minutes} min ${remainingSeconds} sec`
      : `${minutes} min`;
  };

  const getStateLabel = (state: JobState) => {
    return state.charAt(0).toUpperCase() + state.slice(1);
  };

  return (
    <div className="email-queue-page">
      <header className="queue-page-header">
        <div>
          <p className="breadcrumb">Workspace / Email Queue</p>
          <h1>Email Queue Management</h1>
          <p className="queue-page-subtitle">
            Monitor and track email jobs processed by BullMQ.
          </p>
        </div>

        <div className="queue-header-actions">
          <button
            className="queue-back-button"
            onClick={onBack}
          >
            ← Overview
          </button>

          <button
            className="queue-refresh-button"
            onClick={() => fetchQueue(true)}
            disabled={loading || refreshing}
          >
            {refreshing ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
      </header>

      {lastUpdated && (
        <p className="queue-last-updated">
          Last updated: {lastUpdated.toLocaleTimeString("en-IN")}
        </p>
      )}

      {error && (
        <div className="queue-error">
          <strong>Unable to load queue</strong>
          <span>{error}</span>
          <button onClick={() => fetchQueue(true)}>
            Try again
          </button>
        </div>
      )}

      <section className="queue-stats-grid">
        <div className="queue-stat-card">
          <div className="queue-stat-heading">
            <span>Total Jobs</span>
            <span className="queue-stat-icon purple">▦</span>
          </div>
          <h2>{loading ? "—" : totalJobs}</h2>
          <p>Jobs currently retained in queue</p>
        </div>

        <div className="queue-stat-card">
          <div className="queue-stat-heading">
            <span>Waiting</span>
            <span className="queue-stat-icon orange">◷</span>
          </div>
          <h2>{loading ? "—" : counts.waiting}</h2>
          <p>Waiting to be processed</p>
        </div>

        <div className="queue-stat-card">
          <div className="queue-stat-heading">
            <span>Active</span>
            <span className="queue-stat-icon blue">↻</span>
          </div>
          <h2>{loading ? "—" : counts.active}</h2>
          <p>Currently being processed</p>
        </div>

        <div className="queue-stat-card">
          <div className="queue-stat-heading">
            <span>Delayed</span>
            <span className="queue-stat-icon yellow">◴</span>
          </div>
          <h2>{loading ? "—" : counts.delayed}</h2>
          <p>Scheduled for later processing</p>
        </div>

        <div className="queue-stat-card">
          <div className="queue-stat-heading">
            <span>Completed</span>
            <span className="queue-stat-icon green">✓</span>
          </div>
          <h2>{loading ? "—" : counts.completed}</h2>
          <p>Successfully processed jobs</p>
        </div>

        <div className="queue-stat-card">
          <div className="queue-stat-heading">
            <span>Failed</span>
            <span className="queue-stat-icon red">!</span>
          </div>
          <h2>{loading ? "—" : counts.failed}</h2>
          <p>Jobs that failed processing</p>
        </div>
      </section>

      <section className="queue-jobs-panel">
        <div className="queue-jobs-heading">
          <div>
            <h2>Email Jobs</h2>
            <p>
              Showing up to 50 most recent jobs per queue state.
            </p>
          </div>

          <span className="queue-job-total">
            {filteredJobs.length} jobs shown
          </span>
        </div>

        <div className="queue-filters">
          {filters.map((item) => (
            <button
              key={item}
              className={`queue-filter-button ${
                filter === item ? "selected" : ""
              }`}
              onClick={() => setFilter(item)}
            >
              {item === "all" ? "All Jobs" : getStateLabel(item)}
              {item !== "all" && (
                <span>{counts[item]}</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="queue-message">
            Loading email jobs...
          </div>
        ) : error ? (
          <div className="queue-message">
            Queue information is unavailable. Please refresh.
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="queue-message">
            No {filter === "all" ? "" : filter + " "}jobs found.
          </div>
        ) : (
          <div className="queue-table-wrapper">
            <table className="queue-jobs-table">
              <thead>
                <tr>
                  <th>JOB / RECIPIENT</th>
                  <th>CAMPAIGN</th>
                  <th>STATUS</th>
                  <th>ATTEMPTS</th>
                  <th>CREATED</th>
                  <th>PROCESSED</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>
                {filteredJobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <div className="queue-recipient">
                        <strong>{job.recipientName}</strong>
                        <small>{job.recipientEmail}</small>
                        <small className="queue-job-id">
                          Job ID: {job.id}
                        </small>
                      </div>
                    </td>

                    <td>
                      <span className="queue-campaign-id">
                        #{job.campaignId}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`queue-status-badge ${job.state}`}
                      >
                        {getStateLabel(job.state)}
                      </span>
                    </td>

                    <td>
                      {job.attemptsMade} / {job.maxAttempts}
                    </td>

                    <td>{formatDate(job.timestamp)}</td>

                    <td>
                      {job.finishedOn
                        ? formatDuration(
                            job.finishedOn -
                              (job.processedOn ?? job.timestamp)
                          )
                        : job.processedOn
                          ? "Processing"
                          : "—"}
                    </td>

                    <td>
                      <button
                        className="queue-view-details-button"
                        onClick={() => fetchJobDetails(job.id)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="queue-page-footer">
        <span>© 2026 Outbox Email Scheduler</span>
        <span>Queue powered by BullMQ and Redis</span>
      </footer>

      {/* Individual Job Details Popup */}
      {(detailsLoading || detailsError || selectedJob) && (
        <div
          className="job-details-overlay"
          onClick={closeDetails}
        >
          <div
            className="job-details-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="job-details-header">
              <div>
                <p>EMAIL QUEUE / JOB DETAILS</p>
                <h2>Job Information</h2>
              </div>

              <button
                className="job-details-close"
                onClick={closeDetails}
                aria-label="Close job details"
              >
                ×
              </button>
            </div>

            {detailsLoading ? (
              <div className="job-details-message">
                Loading job details...
              </div>
            ) : detailsError ? (
              <div className="job-details-error">
                {detailsError}
                <button onClick={closeDetails}>Close</button>
              </div>
            ) : selectedJob ? (
              <div className="job-details-content">
                <div className="job-details-status-row">
                  <span>Current Status</span>
                  <span
                    className={`queue-status-badge ${selectedJob.state}`}
                  >
                    {getStateLabel(selectedJob.state)}
                  </span>
                </div>

                <div className="job-details-section">
                  <h3>Job Information</h3>

                  <div className="job-details-grid">
                    <div>
                      <span>Job ID</span>
                      <strong>{selectedJob.id}</strong>
                    </div>

                    <div>
                      <span>Job Name</span>
                      <strong>{selectedJob.name}</strong>
                    </div>

                    <div>
                      <span>Campaign ID</span>
                      <strong>#{selectedJob.campaignId}</strong>
                    </div>

                    <div>
                      <span>Recipient ID</span>
                      <strong>{selectedJob.recipientId}</strong>
                    </div>
                  </div>
                </div>

                <div className="job-details-section">
                  <h3>Recipient Information</h3>

                  <div className="job-details-grid">
                    <div>
                      <span>Recipient Name</span>
                      <strong>{selectedJob.recipientName}</strong>
                    </div>

                    <div>
                      <span>Email Address</span>
                      <strong>{selectedJob.recipientEmail}</strong>
                    </div>
                  </div>
                </div>

                <div className="job-details-section">
                  <h3>Processing Information</h3>

                  <div className="job-details-grid">
                    <div>
                      <span>Attempts Made</span>
                      <strong>
                        {selectedJob.attemptsMade} / {selectedJob.maxAttempts}
                      </strong>
                    </div>

                    <div>
                      <span>Configured Delay</span>
                      <strong>{selectedJob.delay} ms</strong>
                    </div>

                    <div>
                      <span>Created At</span>
                      <strong>{formatDate(selectedJob.timestamp)}</strong>
                    </div>

                    <div>
                      <span>Started At</span>
                      <strong>{formatDate(selectedJob.processedOn)}</strong>
                    </div>

                    <div>
                      <span>Finished At</span>
                      <strong>{formatDate(selectedJob.finishedOn)}</strong>
                    </div>

                    <div>
                      <span>Processing Duration</span>
                      <strong>
                        {selectedJob.processedOn && selectedJob.finishedOn
                          ? formatDuration(
                              selectedJob.finishedOn - selectedJob.processedOn
                            )
                          : "—"}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="job-details-section">
                  <h3>Failure Information</h3>

                  <div className="job-details-failure">
                    {selectedJob.failedReason || "No failure reported."}
                  </div>

                  {selectedJob.stacktrace.length > 0 && (
                    <div className="job-details-stacktrace">
                      <strong>Error Stack Trace</strong>
                      <pre>
                        {selectedJob.stacktrace.join("\n\n")}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="job-details-footer">
              <button onClick={closeDetails}>
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailQueue;
