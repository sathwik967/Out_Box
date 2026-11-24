
import { useState } from 'react'
import './CreateCampaign.css'

interface CreateCampaignProps {
  onBack: () => void
  onSuccess: () => void
}

function CreateCampaign({ onBack, onSuccess }: CreateCampaignProps) {
  const [campaignName, setCampaignName] = useState('')
  const [subject, setSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [delaySeconds, setDelaySeconds] = useState(0)
  const [hourlyLimit, setHourlyLimit] = useState(10)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    setError('')
    setSuccess('')

    if (!campaignName.trim() || !subject.trim() || !emailBody.trim()) {
      setError('Please fill in all required fields.')
      return
    }

    if (delaySeconds < 0 || hourlyLimit < 1) {
      setError('Please enter valid delay and hourly limit values.')
      return
    }

    try {
      setLoading(true)

      const response = await fetch('http://localhost:5000/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaignName,
          subject,
          emailBody,
          delaySeconds,
          hourlyLimit,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create campaign.')
      }

      setSuccess(
        `Campaign created successfully! Campaign ID: ${data.campaign?.id ?? 'Created'}`
      )

      setCampaignName('')
      setSubject('')
      setEmailBody('')
      setDelaySeconds(0)
      setHourlyLimit(10)

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="create-campaign-page">
      <div className="create-campaign-header">
        <div>
          <button className="back-button" onClick={onBack}>
            ← Back to Overview
          </button>

          <h1>Create Campaign</h1>
          <p>Create and configure a new email campaign.</p>
        </div>
      </div>

      <div className="campaign-form-card">
        <div className="form-heading">
          <h2>Campaign Details</h2>
          <p>Enter the details for your email campaign below.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Campaign Name *</label>
            <input
              type="text"
              placeholder="e.g. Welcome Email Campaign"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Email Subject *</label>
            <input
              type="text"
              placeholder="Enter your email subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Email Body *</label>
            <textarea
              placeholder="Write your email message here..."
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={7}
              required
            />
            <small>You can personalize messages using {'{{name}}'}.</small>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Minimum Delay (seconds)</label>
              <input
                type="number"
                min="0"
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
              />
              <small>Delay between scheduled emails.</small>
            </div>

            <div className="form-group">
              <label>Hourly Email Limit</label>
              <input
                type="number"
                min="1"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
              />
              <small>Maximum emails per hour for this campaign.</small>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}

          <div className="form-actions">
            <button
              type="button"
              className="cancel-button"
              onClick={onBack}
              disabled={loading}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="submit-campaign-button"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateCampaign
