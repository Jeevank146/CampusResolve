
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import LoginPage from './components/LoginPage';
import StaffDashboard from './staff/StaffDashboard';
import AdminDashboard from './admin/AdminDashboard';
import HelpdeskChat from './student/HelpdeskChat';
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Clock3,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';

type UserRole = 'Student' | 'Staff' | 'Admin';
type WorkspacePage = 'overview' | 'grievances' | 'helpdesk' | 'knowledge';

type Ticket = {
  id: number;
  ticket_code: string;
  registration_number: string | null;
  student_name: string;
  student_email: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  urgency: string;
  status: string;
  assigned_department: string;
  created_at: string;
  updated_at: string;
};

type GrievanceForm = {
  registration_number: string;
  student_name: string;
  student_email: string;
  subject: string;
  description: string;
};

const API =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const initialForm: GrievanceForm = {
  registration_number: '',
  student_name: '',
  student_email: '',
  subject: '',
  description: '',
};

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successCode, setSuccessCode] = useState('');
  const [form, setForm] = useState<GrievanceForm>(initialForm);
  const [accessToken, setAccessToken] = useState('');
  const [staffCategory, setStaffCategory] = useState('');
  const [currentRegistrationNumber, setCurrentRegistrationNumber] =
    useState('');

  const [currentRole, setCurrentRole] =
    useState<UserRole>('Student');

  const [showDashboard, setShowDashboard] = useState(false);
  const [activePage, setActivePage] = useState<WorkspacePage>('overview');

  // Resolution feedback state
  const [selectedFeedbackTicket, setSelectedFeedbackTicket] =
    useState<Ticket | null>(null);

  const [submittedResolutionFeedback, setSubmittedResolutionFeedback] =
    useState<string[]>([]);

  function markFeedbackSubmitted(ticketCode: string) {
    setSubmittedResolutionFeedback((previous) =>
      previous.includes(ticketCode)
        ? previous
        : [...previous, ticketCode],
    );
  }

  // 1. Load grievances
  async function loadTickets() {
    if (
      currentRole === 'Student' &&
      !currentRegistrationNumber.trim()
    ) {
      setTickets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('limit', '50');

      if (currentRole === 'Student') {
        params.set(
          'registration_number',
          currentRegistrationNumber.trim().toUpperCase(),
        );
      }

      const response = await fetch(
        `${API}/api/grievances?${params.toString()}`,
        {
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
        },
      );

      if (!response.ok) {
        throw new Error('Unable to load grievance data.');
      }

      const data: Ticket[] = await response.json();
      setTickets(data);
    } catch {
      setError(
        'Cannot connect to the backend. Start PostgreSQL and FastAPI, then refresh.',
      );
    } finally {
      setLoading(false);
    }
  }

  // 2. Load tickets after login
  useEffect(() => {
    if (showDashboard) {
      void loadTickets();
    }
  }, [
    showDashboard,
    currentRole,
    currentRegistrationNumber,
    accessToken,
  ]);

  // 3. Handle login
  function handleLogin(
    role: UserRole,
    registrationNumber: string,
    token?: string,
    category?: string,
  ) {
    setCurrentRole(role);
    setCurrentRegistrationNumber(registrationNumber);
    setAccessToken(token || '');
    setStaffCategory(category || '');

    setForm({
      ...initialForm,
      registration_number:
        role === 'Student' ? registrationNumber : '',
    });

    setSearch('');
    setTickets([]);
    setSubmittedResolutionFeedback([]);
    setActivePage('overview');
    setShowDashboard(true);
  }

  // 4. Handle logout
  // Database records are not deleted on logout.
  function handleLogout() {
    setShowDashboard(false);
    setSuccessCode('');
    setError('');
    setSearch('');
    setShowForm(false);
    setAccessToken('');
    setStaffCategory('');
    setSelectedFeedbackTicket(null);
    setSubmittedResolutionFeedback([]);
    setActivePage('overview');
  }

  // 5. Submit grievance
  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setError('');
    setSuccessCode('');

    try {
      const registrationNumber =
        currentRole === 'Student'
          ? currentRegistrationNumber
          : form.registration_number;

      const response = await fetch(`${API}/api/grievances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {}),
        },
        body: JSON.stringify({
          registration_number: registrationNumber,
          student_name: form.student_name,
          student_email: form.student_email,
          subject: form.subject,
          description: form.description,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail
              .map((item: { msg?: string }) => item.msg)
              .join(', ')
          : data.detail;

        throw new Error(
          detail || 'Unable to submit grievance.',
        );
      }

      setSuccessCode(data.ticket_code);

      setForm({
        ...initialForm,
        registration_number:
          currentRole === 'Student'
            ? currentRegistrationNumber
            : '',
      });

      setShowForm(false);
      await loadTickets();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Something went wrong.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // 6. Delete grievance
  async function deleteTicket(ticket: Ticket) {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ticket ${ticket.ticket_code}? Its update history will also be deleted.`,
    );

    if (!confirmed) return;

    setError('');

    try {
      const params = new URLSearchParams({
        registration_number: currentRegistrationNumber,
      });

      const response = await fetch(
        `${API}/api/grievances/${encodeURIComponent(ticket.ticket_code)}?${params.toString()}`,
        {
          method: 'DELETE',
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.detail || 'Unable to delete grievance.',
        );
      }

      setSuccessCode('');
      await loadTickets();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Delete failed.',
      );
    }
  }

  // 7. Search tickets
  const visibleTickets = useMemo(
    () =>
      tickets.filter((ticket) =>
        `${ticket.ticket_code} ${ticket.subject} ${ticket.category} ${ticket.student_name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [tickets, search],
  );

  const openCount = tickets.filter(
    (ticket) =>
      ticket.status === 'Open' ||
      ticket.status === 'In Progress',
  ).length;

  const resolvedCount = tickets.filter(
    (ticket) =>
      ticket.status === 'Resolved' ||
      ticket.status === 'Closed',
  ).length;

  // 8. Show login page
  if (!showDashboard) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (currentRole === 'Staff') {
    return (
      <StaffDashboard
        onLogout={handleLogout}
        accessToken={accessToken}
        category={staffCategory}
      />
    );
  }

  if (currentRole === 'Admin') {
    return (
      <AdminDashboard
        onLogout={handleLogout}
        accessToken={accessToken}
      />
    );
  }

  return (
    <div className="app-shell">

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={20} />
          </div>

          <div>
            <strong>CampusResolve</strong>
            <span>INTELLIGENT CAMPUS</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <div
          className={`nav-item ${activePage === 'overview' ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('overview')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              setActivePage('overview');
            }
          }}
        >
          <Activity size={17} />
          Overview
        </div>

        <div
          className={`nav-item ${activePage === 'grievances' ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('grievances')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              setActivePage('grievances');
            }
          }}
        >
          <ClipboardList size={17} />
          Grievances
          <span className="nav-count">{tickets.length}</span>
        </div>

        <div
          className={`nav-item ${activePage === 'helpdesk' ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('helpdesk')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              setActivePage('helpdesk');
            }
          }}
        >
          <CircleHelp size={17} />
          Helpdesk assistant
        </div>

        <div className="sidebar-bottom">
          <div className="secure-icon">
            <ShieldCheck size={17} />
          </div>

          <div>
            <b>Prototype workspace</b>
            <span>
              {currentRole} account
              {currentRole === 'Student'
                ? ` · ${currentRegistrationNumber}`
                : ''}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Dashboard */}
      <main className="main-area">

        {/* Top Navigation */}
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{' '}
            {activePage === 'overview'
              ? 'Overview'
              : activePage === 'grievances'
                ? 'Grievances'
                : activePage === 'helpdesk'
                  ? 'Helpdesk assistant'
                  : 'Campus knowledge'}
          </div>

          <div className="top-actions">
            <span className="environment">
              {currentRole.toUpperCase()}
            </span>

            <button
              className="icon-button"
              aria-label="Notifications"
            >
              <Bell size={18} />
            </button>

            <div className="avatar">
              {currentRole.substring(0, 2).toUpperCase()}
            </div>

            <button
              className="icon-button"
              aria-label="Logout"
              title="Logout"
              onClick={handleLogout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <section className="content">
          {activePage === 'overview' ||
          activePage === 'grievances' ? (
            <>
              {/* Page Heading */}
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    STUDENT SUPPORT PLATFORM
                  </div>

                  <h1>Campus at a glance</h1>

                  <p>
                    One place to ask questions, raise concerns,
                    and follow progress.
                  </p>
                </div>

                <button
                  className="primary-button"
                  onClick={() => {
                    setForm({
                      ...initialForm,
                      registration_number:
                        currentRole === 'Student'
                          ? currentRegistrationNumber
                          : '',
                    });

                    setShowForm(true);
                    setError('');
                    setSuccessCode('');
                  }}
                >
                  <Plus size={17} />
                  New grievance
                </button>
              </div>

              {/* Hero Section */}
              <div className="hero-card">
                <div className="hero-copy">
                  <div className="hero-tag">
                    <Sparkles size={14} />
                    ONE INTELLIGENT CAMPUS
                  </div>

                  <h2>Ask. Resolve. Track.</h2>

                  <p>
                    A unified support experience for campus
                    questions and student grievances.
                  </p>

                  <button
                    className="hero-link"
                    onClick={() => {
                      setForm({
                        ...initialForm,
                        registration_number:
                          currentRole === 'Student'
                            ? currentRegistrationNumber
                            : '',
                      });
                      setShowForm(true);
                    }}
                  >
                    Raise a grievance
                    <ArrowUpRight size={16} />
                  </button>
                </div>

                <div className="hero-visual">
                  <div className="orbit orbit-one"></div>
                  <div className="orbit orbit-two"></div>

                  <div className="hero-core">
                    <Sparkles size={31} />
                  </div>

                  <div className="float-card float-top">
                    <CheckCircle2 size={16} />
                    Ticket created
                  </div>

                  <div className="float-card float-bottom">
                    <Clock3 size={16} />
                    Status tracking
                  </div>
                </div>
              </div>

              {/* Statistics */}
              <div className="section-title">
                <div>
                  <h3>
                    {currentRole === 'Student'
                      ? 'My support overview'
                      : 'Support overview'}
                  </h3>

                  <p>
                    {currentRole === 'Student'
                      ? 'Your grievance information'
                      : 'Live counts from the prototype database'}
                  </p>
                </div>

                <button
                  className="subtle-button"
                  onClick={() => void loadTickets()}
                >
                  <RefreshCw size={15} />
                  Refresh
                </button>
              </div>

              <div className="stats-grid">
                <Stat
                  icon={<ClipboardList size={18} />}
                  label="Total tickets"
                  value={tickets.length}
                  tone="blue"
                />

                <Stat
                  icon={<Clock3 size={18} />}
                  label="Open / in progress"
                  value={openCount}
                  tone="amber"
                />

                <Stat
                  icon={<CheckCircle2 size={18} />}
                  label="Resolved / closed"
                  value={resolvedCount}
                  tone="green"
                />
              </div>

              {/* Recent Grievances */}
              <div className="section-title ticket-heading">
                <div>
                  <h3>
                    {currentRole === 'Student'
                      ? 'My grievances'
                      : 'Recent grievances'}
                  </h3>

                  <p>
                    {currentRole === 'Student'
                      ? 'Your submitted tickets and current status'
                      : 'Submitted tickets and their current status'}
                  </p>
                </div>

                <div className="search-box">
                  <Search size={16} />

                  <input
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                    placeholder="Search tickets..."
                  />
                </div>
              </div>

              {error && (
                <div className="alert error-alert">
                  {error}
                </div>
              )}

              {successCode && (
                <div className="alert success-alert">
                  <CheckCircle2 size={17} />
                  Grievance submitted. Your ticket ID is
                  <b>{successCode}</b>.
                </div>
              )}

              <div className="table-card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>TICKET</th>
                        <th>SUBJECT</th>
                        <th>CATEGORY</th>
                        <th>SUBMITTED BY</th>
                        <th>STATUS</th>
                        <th>DATE</th>
                        <th>ACTION</th>
                      </tr>
                    </thead>

                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="empty-state">
                            Loading tickets…
                          </td>
                        </tr>
                      ) : visibleTickets.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="empty-state">
                            No grievances found for this account.
                          </td>
                        </tr>
                      ) : (
                        visibleTickets.map((ticket) => (
                          <tr key={ticket.ticket_code}>
                            <td className="ticket-code">
                              {ticket.ticket_code}
                            </td>

                            <td>
                              <b>{ticket.subject}</b>
                              <small>{ticket.description}</small>
                            </td>

                            <td>{ticket.category}</td>

                            <td>
                              {ticket.student_name}
                              <small>{ticket.student_email}</small>
                            </td>

                            <td>
                              <span
                                className={`status status-${ticket.status
                                  .toLowerCase()
                                  .replaceAll(' ', '-')}`}
                              >
                                {ticket.status}
                              </span>
                            </td>

                            <td>
                              {new Date(
                                ticket.created_at,
                              ).toLocaleDateString()}
                            </td>

                            <td>
                              {currentRole === 'Student' && (
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  {(ticket.status === 'Resolved' ||
                                    ticket.status === 'Closed') && (
                                    submittedResolutionFeedback.includes(
                                      ticket.ticket_code,
                                    ) ? (
                                      <span
                                        style={{
                                          color: '#15803d',
                                          fontSize: 12,
                                          fontWeight: 600,
                                        }}
                                      >
                                        Feedback submitted
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        className="subtle-button"
                                        onClick={() =>
                                          setSelectedFeedbackTicket(ticket)
                                        }
                                      >
                                        Rate resolution
                                      </button>
                                    )
                                  )}

                                  <button
                                    type="button"
                                    className="delete-ticket-button"
                                    onClick={() =>
                                      void deleteTicket(ticket)
                                    }
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <footer>
                CampusResolve <span>•</span> Local prototype
              </footer>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    STUDENT SUPPORT PLATFORM
                  </div>

                  <h1>
                    {activePage === 'helpdesk'
                      ? 'AI Helpdesk Assistant'
                      : 'Campus Knowledge'}
                  </h1>

                  <p>
                    {activePage === 'helpdesk'
                      ? 'Ask questions and get answers from the Vignan University knowledge base.'
                      : 'Explore university information by asking the AI assistant.'}
                  </p>
                </div>

                <button
                  className="secondary-button"
                  onClick={() => setActivePage('overview')}
                >
                  Back to overview
                </button>
              </div>

              <HelpdeskChat accessToken={accessToken || null} />

              <footer>
                CampusResolve <span>•</span> Official knowledge base assistant
              </footer>
            </>
          )}
        </section>
      </main>

      {/* New Grievance Modal */}
      {showForm && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowForm(false);
            }
          }}
        >
          <div className="modal">

            <div className="modal-head">
              <div>
                <div className="eyebrow">
                  STUDENT SUPPORT
                </div>

                <h2>Raise a grievance</h2>

                <p>
                  Share the details so your concern can
                  be recorded and routed.
                </p>
              </div>

              <button
                className="close-button"
                onClick={() => setShowForm(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={submitTicket}
              className="ticket-form"
            >
              <div className="form-row">
                <label>
                  Registration number

                  <input
                    required
                    value={
                      currentRole === 'Student'
                        ? currentRegistrationNumber
                        : form.registration_number
                    }
                    readOnly={currentRole === 'Student'}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        registration_number: event.target.value,
                      })
                    }
                    placeholder="Enter registration number"
                  />
                </label>

                <label>
                  Student name

                  <input
                    required
                    minLength={2}
                    value={form.student_name}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        student_name: event.target.value,
                      })
                    }
                    placeholder="Enter your name"
                  />
                </label>
              </div>

              <label>
                Student email

                <input
                  required
                  type="email"
                  value={form.student_email}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      student_email: event.target.value,
                    })
                  }
                  placeholder="name@example.com"
                />
              </label>

              <label>
                Subject

                <input
                  required
                  minLength={4}
                  value={form.subject}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      subject: event.target.value,
                    })
                  }
                  placeholder="Briefly describe the issue"
                />
              </label>

              <label>
                Description

                <textarea
                  required
                  minLength={10}
                  rows={5}
                  value={form.description}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      description: event.target.value,
                    })
                  }
                  placeholder="Explain what happened and what support you need…"
                />
              </label>

              <div className="form-note">
                AI will automatically identify the grievance
                category, priority and appropriate department.
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  disabled={submitting}
                >
                  {submitting
                    ? 'Submitting…'
                    : 'Submit grievance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grievance Resolution Feedback Modal */}
      {selectedFeedbackTicket && (
        <ResolutionFeedbackModal
          ticket={selectedFeedbackTicket}
          accessToken={accessToken}
          onClose={() => setSelectedFeedbackTicket(null)}
          onSubmitted={markFeedbackSubmitted}
        />
      )}
    </div>
  );
}

// Statistics Card
function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        {icon}
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>

      <div className="stat-decoration" />
    </div>
  );
}

// Grievance Resolution Feedback Modal
type ResolutionFeedbackModalProps = {
  ticket: Ticket;
  accessToken: string;
  onClose: () => void;
  onSubmitted: (ticketCode: string) => void;
};

function ResolutionFeedbackModal({
  ticket,
  accessToken,
  onClose,
  onSubmitted,
}: ResolutionFeedbackModalProps) {
  const [rating, setRating] = useState(0);
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (rating < 1 || rating > 5) {
      setError('Please select a star rating.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`${API}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          feedback_type: 'GRIEVANCE_RESOLUTION',
          ticket_code: ticket.ticket_code,
          rating,
          helpful,
          comments: comments.trim() || null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || 'Unable to submit feedback.',
        );
      }

      onSubmitted(ticket.ticket_code);
      setSuccess(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Feedback submission failed.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <div>
            <div className="eyebrow">STUDENT FEEDBACK</div>
            <h2>Rate grievance resolution</h2>
            <p>Ticket: {ticket.ticket_code}</p>
          </div>

          <button
            type="button"
            className="close-button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close feedback form"
          >
            ×
          </button>
        </div>

        {success ? (
          <>
            <div className="alert success-alert">
              Thank you! Your grievance feedback was submitted successfully.
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="primary-button"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <form
            className="ticket-form"
            onSubmit={submitFeedback}
          >
            <p>
              <b>Issue:</b> {ticket.subject}
            </p>

            <label>How satisfied are you with the resolution?</label>

            <div
              style={{
                display: 'flex',
                gap: 9,
                margin: '10px 0 20px',
              }}
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`Rate ${star} stars`}
                  onClick={() => setRating(star)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: rating >= star ? '#f59e0b' : '#cbd5e1',
                    padding: 2,
                  }}
                >
                  <Star
                    size={30}
                    fill={
                      rating >= star
                        ? 'currentColor'
                        : 'none'
                    }
                  />
                </button>
              ))}
            </div>

            <label>Was your grievance resolved satisfactorily?</label>

            <div
              style={{
                display: 'flex',
                gap: 10,
                margin: '10px 0 18px',
              }}
            >
              <button
                type="button"
                className="secondary-button"
                style={{
                  background:
                    helpful === true ? '#dcfce7' : undefined,
                  borderColor:
                    helpful === true ? '#16a34a' : undefined,
                }}
                onClick={() => setHelpful(true)}
              >
                Yes
              </button>

              <button
                type="button"
                className="secondary-button"
                style={{
                  background:
                    helpful === false ? '#fee2e2' : undefined,
                  borderColor:
                    helpful === false ? '#dc2626' : undefined,
                }}
                onClick={() => setHelpful(false)}
              >
                No
              </button>
            </div>

            <label>
              Additional comments (optional)

              <textarea
                rows={4}
                maxLength={2000}
                value={comments}
                onChange={(event) =>
                  setComments(event.target.value)
                }
                placeholder="Share your experience..."
              />
            </label>

            {error && (
              <div className="alert error-alert">
                {error}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={saving || rating === 0}
              >
                {saving ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
