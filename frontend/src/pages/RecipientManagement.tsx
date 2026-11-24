
import { useEffect, useState } from "react";
import "./RecipientManagement.css";

interface Campaign {
  id: number;
  campaign_name: string;
  status: string;
}

interface CampaignResponse {
  success: boolean;
  campaigns: Campaign[];
}

interface Recipient {
  id: number;
  campaign_id: number;
  name: string;
  email: string;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface RecipientResponse {
  success: boolean;
  total: number;
  recipients: Recipient[];
}

interface UploadResponse {
  success: boolean;
  message: string;
  inserted: number;
  skipped: number;
  totalRecipients: number;
}

interface RecipientManagementProps {
  onBack: () => void;
}

function RecipientManagement({ onBack }: RecipientManagementProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  // Load recipients whenever a campaign is selected
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
          throw new Error("Unable to load recipients.");
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

  // Upload CSV file
  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!selectedCampaignId) {
      setError("Please select a campaign first.");
      return;
    }

    if (!selectedFile) {
      setError("Please select a CSV file.");
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a valid CSV file.");
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(
        `http://localhost:5000/api/campaigns/${selectedCampaignId}/recipients/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data: UploadResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "CSV upload failed."
        );
      }

      setSuccess(
        `${data.message}. Inserted: ${data.inserted}, Skipped: ${data.skipped}.`
      );

      setSelectedFile(null);

      const fileInput = document.getElementById(
        "recipient-csv"
      ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }

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
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to upload CSV file."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="recipient-page">
      <div className="recipient-header">
        <div>
          <button className="recipient-back-button" onClick={onBack}>
            ← Back to Overview
          </button>

          <h1>Recipient Management</h1>

          <p>
            Upload, manage and view recipients for your email campaigns.
          </p>
        </div>
      </div>

      <div className="recipient-content">
        {/* Campaign Selection */}
        <section className="recipient-card">
          <div className="recipient-card-heading">
            <h2>Select Campaign</h2>
            <p>Choose the campaign for which you want to upload recipients.</p>
          </div>

          <div className="recipient-form-group">
            <label htmlFor="campaign-select">Campaign</label>

            <select
              id="campaign-select"
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              disabled={loadingCampaigns}
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

        {/* CSV Upload */}
        <section className="recipient-card">
          <div className="recipient-card-heading">
            <h2>Upload Recipients</h2>
            <p>Upload a CSV file containing recipient information.</p>
          </div>

          <form onSubmit={handleUpload}>
            <div className="csv-format-info">
              <strong>Required CSV format</strong>
              <p>Your CSV file must contain these two columns:</p>
              <code>name,email</code>
              <p>Example:</p>
              <code>
                name,email
                <br />
                Rahul,rahul@example.com
                <br />
                Priya,priya@example.com
                <br />
                Arjun,arjun@example.com
              </code>
            </div>

            <div className="recipient-form-group">
              <label htmlFor="recipient-csv">Choose CSV File</label>

              <input
                id="recipient-csv"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) =>
                  setSelectedFile(e.target.files?.[0] || null)
                }
              />

              {selectedFile && (
                <small>Selected: {selectedFile.name}</small>
              )}
            </div>

            <button
              type="submit"
              className="recipient-upload-button"
              disabled={uploading || !selectedCampaignId}
            >
              {uploading ? "Uploading..." : "Upload Recipients"}
            </button>
          </form>

          {error && <div className="recipient-error">{error}</div>}
          {success && <div className="recipient-success">{success}</div>}
        </section>

        {/* Recipient List */}
        <section className="recipient-card">
          <div className="recipient-card-heading recipient-list-heading">
            <div>
              <h2>Recipient List</h2>
              <p>Recipients uploaded to the selected campaign.</p>
            </div>

            <span className="recipient-count">
              {recipients.length} recipients
            </span>
          </div>

          {!selectedCampaignId ? (
            <div className="recipient-empty">
              Select a campaign to view its recipients.
            </div>
          ) : loadingRecipients ? (
            <div className="recipient-empty">
              Loading recipients...
            </div>
          ) : recipients.length === 0 ? (
            <div className="recipient-empty">
              No recipients uploaded to this campaign yet.
            </div>
          ) : (
            <div className="recipient-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>NAME</th>
                    <th>EMAIL</th>
                    <th>STATUS</th>
                    <th>CREATED</th>
                  </tr>
                </thead>

                <tbody>
                  {recipients.map((recipient) => (
                    <tr key={recipient.id}>
                      <td>{recipient.name}</td>
                      <td>{recipient.email}</td>
                      <td>
                        <span
                          className={`recipient-status ${recipient.status.toLowerCase()}`}
                        >
                          {recipient.status}
                        </span>
                      </td>
                      <td>
                        {new Date(
                          recipient.created_at
                        ).toLocaleDateString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default RecipientManagement;
