
import { useEffect, useState } from "react";
import "./CampaignScheduling.css";

interface Campaign {
  id: number;
  campaign_name: string;
  subject: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  scheduled_at: string | null;
}

interface CampaignResponse {
  success: boolean;
  campaigns: Campaign[];
}

interface Recipient {
  id: number;
  name: string;
  email: string;
  status: string;
}

interface RecipientResponse {
  success: boolean;
  total: number;
  recipients: Recipient[];
}

interface ScheduleResponse {
  success: boolean;
  message: string;
  campaignId: number;
  queuedCount: number;
}

interface CampaignSchedulingProps {
  onBack: () => void;
  onSuccess: () => void;
}

function CampaignScheduling({
  onBack,
  onSuccess,
}: CampaignSchedulingProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedCampaign = campaigns.find(
    (campaign) => campaign.id === Number(selectedCampaignId)
  );

  const pendingRecipients = recipients.filter(
    (recipient) => recipient.status === "pending"
  );

  // Load campaigns
  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const response = await fetch(
          "http://localhost:5000/api/campaigns"
        );

        if (!response.ok) {
          throw new Error("Unable to load campaigns.");
        }

        const data: CampaignResponse = await response.json();

        if (!data.success) {
          throw new Error("Failed to retrieve campaigns.");
        }

        setCampaigns(data.campaigns);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong."
        );
      } finally {
        setLoadingCampaigns(false);
      }
    };

    fetchCampaigns();
  }, []);

  // Load recipients when campaign changes
  useEffect(() => {
    if (!selectedCampaignId) {
      setRecipients([]);
      return;
    }

    const fetchRecipients = async () => {
      try {
        setLoadingRecipients(true);
        setError("");
        setSuccess("");

        const response = await fetch(
          `http://localhost:5000/api/campaigns/${selectedCampaignId}/recipients`
        );

        if (!response.ok) {
          throw new Error("Unable to load campaign recipients.");
        }

        const data: RecipientResponse = await response.json();

        if (!data.success) {
          throw new Error("Failed to retrieve recipients.");
        }

        setRecipients(data.recipients);
      } catch (err) {
        setRecipients([]);
        setError(
          err instanceof Error ? err.message : "Something went wrong."
        );
      } finally {
        setLoadingRecipients(false);
      }
    };

    fetchRecipients();
  }, [selectedCampaignId]);

  // Schedule campaign
  const handleSchedule = async () => {
    if (!selectedCampaignId) {
      setError("Please select a campaign.");
      return;
    }

    if (pendingRecipients.length === 0) {
      setError("This campaign has no pending recipients to schedule.");
      return;
    }

    const confirmed = window.confirm(
      `Schedule ${pendingRecipients.length} pending emails for "${selectedCampaign?.campaign_name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setScheduling(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `http://localhost:5000/api/campaigns/${selectedCampaignId}/schedule`,
        {
          method: "POST",
        }
      );

      const data: ScheduleResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Campaign scheduling failed.");
      }

      setSuccess(
        `${data.message}. ${data.queuedCount} email jobs processed for the queue.`
      );

      // Refresh recipient list
      const recipientsResponse = await fetch(
        `http://localhost:5000/api/campaigns/${selectedCampaignId}/recipients`
      );

      if (recipientsResponse.ok) {
        const recipientsData: RecipientResponse =
          await recipientsResponse.json();

        if (recipientsData.success) {
          setRecipients(recipientsData.recipients);
        }
      }

      // Notify dashboard to refresh campaign data
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to schedule campaign."
      );
    } finally {
      setScheduling(false);
    }
  };

  return (
    <div className="scheduling-page">
      <div className="scheduling-header">
        <button
          className="scheduling-back-button"
          onClick={onBack}
        >
          ← Back to Overview
        </button>

        <h1>Campaign Scheduling</h1>
        <p>
          Select a campaign and add its pending emails to the
          background queue.
        </p>
      </div>

      <div className="scheduling-content">
        <section className="scheduling-card">
          <div className="scheduling-card-heading">
            <h2>Select Campaign</h2>
            <p>Choose the campaign you want to schedule.</p>
          </div>

          <div className="scheduling-form-group">
            <label htmlFor="schedule-campaign">
              Campaign
            </label>

            <select
              id="schedule-campaign"
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              disabled={loadingCampaigns || scheduling}
            >
              <option value="">
                {loadingCampaigns
                  ? "Loading campaigns..."
                  : "Select a campaign"}
              </option>

              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  #{campaign.id} - {campaign.campaign_name}
                </option>
              ))}
            </select>

            {!loadingCampaigns && campaigns.length === 0 && (
              <small>No campaigns available. Create a campaign first.</small>
            )}
          </div>
        </section>

        <section className="scheduling-card">
          <div className="scheduling-card-heading">
            <h2>Campaign Details</h2>
            <p>Review the campaign before scheduling its emails.</p>
          </div>

          {!selectedCampaign ? (
            <div className="scheduling-empty">
              Select a campaign to view its details.
            </div>
          ) : (
            <>
              <div className="scheduling-details">
                <div>
                  <span>Campaign Name</span>
                  <strong>{selectedCampaign.campaign_name}</strong>
                </div>

                <div>
                  <span>Subject</span>
                  <strong>{selectedCampaign.subject}</strong>
                </div>

                <div>
                  <span>Campaign Status</span>
                  <strong className="scheduling-status">
                    {selectedCampaign.status}
                  </strong>
                </div>

                <div>
                  <span>Total Recipients</span>
                  <strong>{selectedCampaign.total_recipients}</strong>
                </div>

                <div>
                  <span>Successfully Sent</span>
                  <strong>{selectedCampaign.sent_count}</strong>
                </div>

                <div>
                  <span>Failed Emails</span>
                  <strong>{selectedCampaign.failed_count}</strong>
                </div>
              </div>

              <div className="pending-summary">
                <div>
                  <strong>
                    {loadingRecipients ? "—" : pendingRecipients.length}
                  </strong>
                  <span>Pending recipients</span>
                </div>

                <p>
                  Only recipients with pending status will be
                  submitted for scheduling.
                </p>
              </div>

              <button
                className="schedule-button"
                onClick={handleSchedule}
                disabled={
                  scheduling ||
                  loadingRecipients ||
                  pendingRecipients.length === 0
                }
              >
                {scheduling
                  ? "Scheduling..."
                  : "Schedule Campaign"}
              </button>

              {loadingRecipients && (
                <p className="scheduling-note">
                  Loading recipient information...
                </p>
              )}

              {!loadingRecipients &&
                recipients.length === 0 && (
                  <p className="scheduling-note">
                    Upload recipients before scheduling this campaign.
                  </p>
                )}

              {!loadingRecipients &&
                recipients.length > 0 &&
                pendingRecipients.length === 0 && (
                  <p className="scheduling-note">
                    No pending recipients are available for scheduling.
                  </p>
                )}
            </>
          )}

          {error && (
            <div className="scheduling-error">{error}</div>
          )}

          {success && (
            <div className="scheduling-success">{success}</div>
          )}
        </section>
      </div>
    </div>
  );
}

export default CampaignScheduling;
