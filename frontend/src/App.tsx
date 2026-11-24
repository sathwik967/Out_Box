
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import CreateCampaign from "./pages/CreateCampaign";
import RecipientManagement from "./pages/RecipientManagement";
import CampaignScheduling from "./pages/CampaignScheduling";
import EmailQueue from "./pages/EmailQueue";

interface Campaign {
  id: number;
  campaign_name: string;
  subject: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

interface CampaignResponse {
  success: boolean;
  total: number;
  campaigns: Campaign[];
}

type Page =
  | "overview"
  | "create"
  | "recipients"
  | "scheduling"
  | "queue";

function App() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [activePage, setActivePage] = useState<Page>("overview");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        setError("");

        const response = await fetch(
          "http://localhost:5000/api/campaigns"
        );

        if (!response.ok) {
          throw new Error("Unable to fetch campaigns from backend.");
        }

        const data: CampaignResponse = await response.json();

        if (!data.success) {
          throw new Error("The backend could not load campaigns.");
        }

        setCampaigns(data.campaigns);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, [refreshKey]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((campaign) =>
      campaign.campaign_name
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [campaigns, search]);

  const totalSent = campaigns.reduce(
    (total, campaign) => total + Number(campaign.sent_count || 0),
    0
  );

  const totalFailed = campaigns.reduce(
    (total, campaign) => total + Number(campaign.failed_count || 0),
    0
  );

  const totalRecipients = campaigns.reduce(
    (total, campaign) =>
      total + Number(campaign.total_recipients || 0),
    0
  );

  const totalPending = Math.max(
    0,
    totalRecipients - totalSent - totalFailed
  );

  const scheduledCampaigns = campaigns.filter(
    (campaign) => campaign.status === "scheduled"
  ).length;

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusClass = (status: string) => {
    return status.toLowerCase().replace(/\s+/g, "-");
  };

  // Shared sidebar for all pages
  const renderSidebar = () => (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">O</div>
        <div>
          <h2>Outbox</h2>
          <span>Email Scheduler</span>
        </div>
      </div>

      <div className="nav-section">
        <p className="nav-heading">WORKSPACE</p>

        <button
          className={`nav-item ${
            activePage === "overview" ? "active" : ""
          }`}
          onClick={() => setActivePage("overview")}
        >
          <span className="nav-icon">▦</span>
          Overview
        </button>

        <button
          className={`nav-item ${
            activePage === "create" ? "active" : ""
          }`}
          onClick={() => setActivePage("create")}
        >
          <span className="nav-icon">＋</span>
          Create Campaign
        </button>

        <button className="nav-item" disabled>
          <span className="nav-icon">✉</span>
          Campaigns
          <span className="coming-soon">Soon</span>
        </button>

        <button
          className={`nav-item ${
            activePage === "recipients" ? "active" : ""
          }`}
          onClick={() => setActivePage("recipients")}
        >
          <span className="nav-icon">♙</span>
          Recipients
        </button>

        <button
          className={`nav-item ${
            activePage === "scheduling" ? "active" : ""
          }`}
          onClick={() => setActivePage("scheduling")}
        >
          <span className="nav-icon">◷</span>
          Campaign Scheduling
        </button>

        <button
          className={`nav-item ${
            activePage === "queue" ? "active" : ""
          }`}
          onClick={() => setActivePage("queue")}
        >
          <span className="nav-icon">☷</span>
          Email Queue
        </button>
      </div>

      <div className="sidebar-bottom">
        <div className="backend-status">
          <span className="status-dot"></span>
          <div>
            <strong>Backend connected</strong>
            <small>localhost:5000</small>
          </div>
        </div>

        <div className="profile">
          <div className="avatar">A</div>
          <div>
            <strong>Administrator</strong>
            <small>Workspace owner</small>
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app-layout">
      {renderSidebar()}

      <main className="main-content">
        {activePage === "create" && (
          <CreateCampaign
            onBack={() => setActivePage("overview")}
            onSuccess={() => {
              setRefreshKey((previous) => previous + 1);
            }}
          />
        )}

        {activePage === "recipients" && (
          <RecipientManagement
            onBack={() => setActivePage("overview")}
          />
        )}

        {activePage === "scheduling" && (
          <CampaignScheduling
            onBack={() => setActivePage("overview")}
            onSuccess={() => {
              setRefreshKey((previous) => previous + 1);
            }}
          />
        )}

        {activePage === "queue" && (
          <EmailQueue
            onBack={() => setActivePage("overview")}
          />
        )}

        {activePage === "overview" && (
          <>
            <header className="topbar">
              <div>
                <p className="breadcrumb">Workspace / Overview</p>
                <h1>Dashboard</h1>
              </div>

              <div className="topbar-right">
                <span className="today-label">
                  Email Campaign Management
                </span>
                <div className="top-avatar">A</div>
              </div>
            </header>

            <section className="welcome-section">
              <div>
                <h2>Welcome to Outbox 👋</h2>
                <p>
                  Monitor your email campaigns and track delivery
                  performance from one place.
                </p>
              </div>
              <div className="welcome-decoration">✉</div>
            </section>

            <section className="stats-grid">
              <div className="stat-card">
                <div className="stat-top">
                  <span>Total Campaigns</span>
                  <span className="stat-icon purple">▦</span>
                </div>
                <h2>{loading ? "—" : campaigns.length}</h2>
                <p>All created campaigns</p>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Emails Sent</span>
                  <span className="stat-icon green">✓</span>
                </div>
                <h2>{loading ? "—" : totalSent}</h2>
                <p>Successfully processed</p>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Pending Emails</span>
                  <span className="stat-icon orange">◷</span>
                </div>
                <h2>{loading ? "—" : totalPending}</h2>
                <p>Not yet sent or failed</p>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Failed Emails</span>
                  <span className="stat-icon red">!</span>
                </div>
                <h2>{loading ? "—" : totalFailed}</h2>
                <p>Emails marked as failed</p>
              </div>
            </section>

            <section className="overview-grid">
              <div className="campaign-panel">
                <div className="panel-header">
                  <div>
                    <h3>Recent Campaigns</h3>
                    <p>Campaign activity from your backend</p>
                  </div>

                  <span className="campaign-count">
                    {campaigns.length} campaigns
                  </span>
                </div>

                <div className="search-box">
                  <span>⌕</span>
                  <input
                    type="text"
                    placeholder="Search campaigns..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {loading ? (
                  <div className="message-state">
                    Loading campaigns...
                  </div>
                ) : error ? (
                  <div className="message-state error-state">
                    {error}
                    <small>
                      Make sure your backend is running on port 5000.
                    </small>
                  </div>
                ) : filteredCampaigns.length === 0 ? (
                  <div className="message-state">
                    No campaigns found.
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>CAMPAIGN</th>
                          <th>RECIPIENTS</th>
                          <th>SENT</th>
                          <th>STATUS</th>
                          <th>CREATED</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredCampaigns.map((campaign) => (
                          <tr key={campaign.id}>
                            <td>
                              <div className="campaign-name">
                                <div className="campaign-letter">
                                  {campaign.campaign_name
                                    .charAt(0)
                                    .toUpperCase()}
                                </div>
                                <div>
                                  <strong>
                                    {campaign.campaign_name}
                                  </strong>
                                  <small>
                                    Campaign #{campaign.id}
                                  </small>
                                </div>
                              </div>
                            </td>

                            <td>{campaign.total_recipients}</td>
                            <td>{campaign.sent_count}</td>
                            <td>
                              <span
                                className={`status-badge ${getStatusClass(
                                  campaign.status
                                )}`}
                              >
                                {campaign.status}
                              </span>
                            </td>
                            <td>{formatDate(campaign.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="side-panels">
                <div className="quick-panel">
                  <h3>Queue Overview</h3>
                  <p>Current campaign activity</p>

                  <div className="queue-number">
                    <strong>
                      {loading ? "—" : scheduledCampaigns}
                    </strong>
                    <span>Scheduled campaigns</span>
                  </div>

                  <div className="queue-divider"></div>

                  <div className="queue-row">
                    <span>Total recipients</span>
                    <strong>
                      {loading ? "—" : totalRecipients}
                    </strong>
                  </div>

                  <div className="queue-row">
                    <span>Pending emails</span>
                    <strong>
                      {loading ? "—" : totalPending}
                    </strong>
                  </div>

                  <div className="queue-row">
                    <span>Failed emails</span>
                    <strong>
                      {loading ? "—" : totalFailed}
                    </strong>
                  </div>
                </div>

                <div className="info-panel">
                  <div className="info-icon">✦</div>
                  <h3>Outbox Scheduler</h3>
                  <p>
                    Your email campaigns are managed through a
                    background queue powered by BullMQ and Redis.
                  </p>
                  <span className="tech-label">
                    POWERED BY BULLMQ
                  </span>
                </div>
              </div>
            </section>

            <footer className="footer">
              <span>© 2026 Outbox Email Scheduler</span>
              <span>
                Built with React, TypeScript and Tailwind CSS
              </span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
