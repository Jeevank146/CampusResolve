import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, CSSProperties, FormEvent, ReactNode } from 'react';
import './StudentDashboard.css';
import HelpdeskChat from './HelpdeskChat';
import {
  Activity, ArrowUpRight, Bell, Bot, CalendarDays, CheckCircle2,
  CircleAlert, CircleHelp, ClipboardList, Clock3, LogOut, Plus,
  RefreshCw, Search, ShieldCheck, Sparkles, Star, ImagePlus, MapPin, X,
} from 'lucide-react';

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
  submission_type?: string;
  location?: string | null;
  has_image?: boolean;
};

type GrievanceForm = {
  registration_number: string;
  student_name: string;
  student_email: string;
  subject: string;
  description: string;
  location: string;
};

type StudentDashboardProps = {
  accessToken: string;
  registrationNumber: string;
  onLogout: () => void;
};

type StudentPage = 'overview' | 'grievances' | 'helpdesk';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const campusBackgrounds = [
  '/images/campus/campus-1.jpg',
  '/images/campus/campus-2.jpg',
  '/images/campus/campus-3.jpg',
  '/images/campus/campus-4.jpg',
];

const initialForm: GrievanceForm = {
  registration_number: '',
  student_name: '',
  student_email: '',
  subject: '',
  description: '',
  location: '',
};

export default function StudentDashboard({
  accessToken,
  registrationNumber,
  onLogout,
}: StudentDashboardProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successCode, setSuccessCode] = useState('');
  const [form, setForm] = useState<GrievanceForm>({
    ...initialForm,
    registration_number: registrationNumber,
  });
  const [activePage, setActivePage] = useState<StudentPage>('overview');
  const [selectedFeedbackTicket, setSelectedFeedbackTicket] =
    useState<Ticket | null>(null);
  const [submittedResolutionFeedback, setSubmittedResolutionFeedback] =
    useState<string[]>([]);
  const [backgroundIndex, setBackgroundIndex] = useState(0);

  // Optional photo grievance state
  const [grievanceImage, setGrievanceImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');

  // Email OTP verification for grievance submissions
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setBackgroundIndex((current) => (current + 1) % campusBackgrounds.length);
    }, 6500);

    return () => window.clearInterval(timer);
  }, []);

  function markFeedbackSubmitted(ticketCode: string) {
    setSubmittedResolutionFeedback((previous) =>
      previous.includes(ticketCode) ? previous : [...previous, ticketCode],
    );
  }

  async function loadTickets() {
    if (!registrationNumber.trim()) {
      setTickets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('registration_number', registrationNumber.trim().toUpperCase());

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

  useEffect(() => {
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationNumber, accessToken]);

  async function sendEmailOTP() {
    const email = form.student_email.trim().toLowerCase();

    if (!email) {
      setError('Please enter your email address first.');
      return;
    }

    setOtpSending(true);
    setError('');

    try {
      const response = await fetch(`${API}/api/grievances/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          registration_number: registrationNumber,
          student_name: form.student_name.trim() || 'Student',
          student_email: email,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'Unable to send verification code.');
      }

      setOtpSent(true);
      setOtpVerified(false);
      setOtpCode('');
      setError('');
    } catch (otpError) {
      setError(
        otpError instanceof Error
          ? otpError.message
          : 'Unable to send verification code.',
      );
    } finally {
      setOtpSending(false);
    }
  }

  async function verifyEmailOTP() {
    const email = form.student_email.trim().toLowerCase();
    const code = otpCode.trim();

    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit OTP sent to your email.');
      return;
    }

    setOtpVerifying(true);
    setError('');

    try {
      const response = await fetch(`${API}/api/grievances/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          registration_number: registrationNumber,
          student_name: form.student_name.trim() || 'Student',
          student_email: email,
          otp: code,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'OTP verification failed.');
      }

      setOtpVerified(true);
      setError('');
    } catch (otpError) {
      setOtpVerified(false);
      setError(
        otpError instanceof Error
          ? otpError.message
          : 'OTP verification failed.',
      );
    } finally {
      setOtpVerifying(false);
    }
  }

  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!otpVerified) {
      setError('Please verify your email before submitting the grievance.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccessCode('');

    try {
      let response: Response;

      if (grievanceImage) {
        // Photo grievance: send multipart FormData.
        const photoForm = new FormData();

        photoForm.append('registration_number', registrationNumber);
        photoForm.append('student_name', form.student_name);
        photoForm.append('student_email', form.student_email);
        photoForm.append('subject', form.subject);
        photoForm.append('description', form.description);

        if (form.location.trim()) {
          photoForm.append('location', form.location.trim());
        }

        photoForm.append('image', grievanceImage);

        response = await fetch(`${API}/api/grievances/photo`, {
          method: 'POST',
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
          body: photoForm,
        });
      } else {
        // Existing text-only grievance API remains unchanged.
        response = await fetch(`${API}/api/grievances`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            registration_number: registrationNumber,
            student_name: form.student_name,
            student_email: form.student_email,
            subject: form.subject,
            description: form.description,
          }),
        });
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item: { msg?: string }) => item.msg).join(', ')
          : data.detail;

        throw new Error(detail || 'Unable to submit grievance.');
      }

      setSuccessCode(data.ticket_code);
      setForm({ ...initialForm, registration_number: registrationNumber });
      setGrievanceImage(null);
      setImagePreview('');
      setOtpCode('');
      setOtpSent(false);
      setOtpVerified(false);
      setShowForm(false);
      await loadTickets();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Something went wrong.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please choose a valid image file.');
      event.target.value = '';
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError('Image size must be 8 MB or less.');
      event.target.value = '';
      return;
    }

    setError('');
    setGrievanceImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function removeSelectedImage() {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImagePreview('');
    setGrievanceImage(null);

    const input = document.getElementById(
      'grievance-image',
    ) as HTMLInputElement | null;

    if (input) input.value = '';
  }

  async function deleteTicket(ticket: Ticket) {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ticket ${ticket.ticket_code}? Its update history will also be deleted.`,
    );

    if (!confirmed) return;

    setError('');

    try {
      const params = new URLSearchParams({
        registration_number: registrationNumber,
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
        throw new Error(data.detail || 'Unable to delete grievance.');
      }

      setSuccessCode('');
      await loadTickets();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Delete failed.',
      );
    }
  }

  const visibleTickets = useMemo(
    () =>
      tickets.filter((ticket) =>
        `${ticket.ticket_code} ${ticket.subject} ${ticket.category} ${ticket.student_name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [tickets, search],
  );

  const resolvedCount = tickets.filter(
    (ticket) => ticket.status === 'Resolved' || ticket.status === 'Closed',
  ).length;

  const inProgressCount = tickets.filter(
    (ticket) => ticket.status === 'In Progress',
  ).length;

  const pendingCount = tickets.filter(
    (ticket) => ticket.status === 'Open',
  ).length;

  const recentTickets = [...tickets]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime(),
    )
    .slice(0, 5);

  const latestUpdate = tickets.length
    ? new Date(
        Math.max(
          ...tickets.map((ticket) =>
            new Date(ticket.updated_at || ticket.created_at).getTime(),
          ),
        ),
      ).toLocaleDateString()
    : 'No updates yet';

  function openGrievanceForm() {
    setForm({ ...initialForm, registration_number: registrationNumber });
    setShowForm(true);
    setError('');
    setSuccessCode('');
    setGrievanceImage(null);
    setImagePreview('');
    setOtpCode('');
    setOtpSent(false);
    setOtpVerified(false);
  }

  return (
    <div className="app-shell campus-dashboard">
      <div
        key={backgroundIndex}
        className="campus-background"
        aria-hidden="true"
        style={{
          backgroundImage: `url("${campusBackgrounds[backgroundIndex]}")`,
        } as CSSProperties}
      />
      <div className="campus-background-overlay" />

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={20} /></div>
          <div>
            <strong>CampusResolve</strong>
            <span>INTELLIGENT CAMPUS</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <button
          type="button"
          className={`nav-item ${activePage === 'overview' ? 'active' : ''}`}
          onClick={() => setActivePage('overview')}
        >
          <Activity size={17} /> Overview
        </button>

        <button
          type="button"
          className={`nav-item ${activePage === 'grievances' ? 'active' : ''}`}
          onClick={() => setActivePage('grievances')}
        >
          <ClipboardList size={17} /> Grievances
          <span className="nav-count">{tickets.length}</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activePage === 'helpdesk' ? 'active' : ''}`}
          onClick={() => setActivePage('helpdesk')}
        >
          <CircleHelp size={17} /> Helpdesk assistant
        </button>

        <div className="sidebar-bottom">
          <div className="secure-icon"><ShieldCheck size={17} /></div>
          <div>
            <b>Student workspace</b>
            <span>Student account · {registrationNumber}</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{' '}
            {activePage === 'overview'
              ? 'Overview'
              : activePage === 'grievances'
                ? 'Grievances'
                : 'Helpdesk assistant'}
          </div>

          <div className="top-actions">
            <span className="environment">STUDENT</span>
            <button type="button" className="icon-button" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <div className="avatar">ST</div>
            <button
              type="button"
              className="icon-button"
              aria-label="Logout"
              title="Logout"
              onClick={onLogout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <section className="content">
          {activePage === 'overview' ? (
            <>
              <div className="page-heading dashboard-heading">
                <div>
                  <div className="eyebrow">VIGNAN UNIVERSITY · STUDENT PORTAL</div>
                  <h1>Student Dashboard</h1>
                  <p>Track your campus concerns, get support and stay updated.</p>
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={openGrievanceForm}
                >
                  <Plus size={17} /> Raise a grievance
                </button>
              </div>

              <div className="welcome-strip">
                <div>
                  <span className="welcome-kicker">
                    <Sparkles size={14} /> CAMPUSRESOLVE STUDENT SPACE
                  </span>
                  <h2>Ask. Resolve. Track.</h2>
                  <p>Your single place to raise concerns and follow every update.</p>
                </div>

                <div className="welcome-actions">
                  <button type="button" onClick={openGrievanceForm}>
                    <Plus size={16} /> New grievance
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePage('helpdesk')}
                  >
                    <Bot size={16} /> Ask AI Helpdesk
                  </button>
                </div>
              </div>

              {error && <div className="alert error-alert">{error}</div>}

              {successCode && (
                <div className="alert success-alert">
                  <CheckCircle2 size={17} />
                  Grievance submitted. Your ticket ID is <b>{successCode}</b>.
                </div>
              )}

              <div className="section-title overview-section-title">
                <div>
                  <h3>My grievance overview</h3>
                  <p>Live summary of your submitted requests</p>
                </div>

                <button
                  type="button"
                  className="subtle-button"
                  onClick={() => void loadTickets()}
                  disabled={loading}
                >
                  <RefreshCw size={15} />
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              <div className="stats-grid stats-grid-four">
                <Stat
                  icon={<ClipboardList size={20} />}
                  label="Total grievances"
                  value={tickets.length}
                  tone="blue"
                />
                <Stat
                  icon={<CircleAlert size={20} />}
                  label="Awaiting action"
                  value={pendingCount}
                  tone="amber"
                />
                <Stat
                  icon={<Clock3 size={20} />}
                  label="In progress"
                  value={inProgressCount}
                  tone="violet"
                />
                <Stat
                  icon={<CheckCircle2 size={20} />}
                  label="Resolved"
                  value={resolvedCount}
                  tone="green"
                />
              </div>

              <div className="dashboard-lower-grid">
                <section className="panel recent-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Recent grievances</h3>
                      <p>Your latest submitted tickets</p>
                    </div>
                    <button
                      type="button"
                      className="text-action"
                      onClick={() => setActivePage('grievances')}
                    >
                      View all <ArrowUpRight size={15} />
                    </button>
                  </div>

                  {recentTickets.length === 0 ? (
                    <div className="empty-dashboard">
                      <ClipboardList size={25} />
                      <b>No grievances yet</b>
                      <span>Use “Raise a grievance” to submit your first request.</span>
                    </div>
                  ) : (
                    <div className="recent-list">
                      {recentTickets.map((ticket) => (
                        <div className="recent-ticket" key={ticket.ticket_code}>
                          <div className="recent-ticket-icon">
                            <ClipboardList size={17} />
                          </div>
                          <div className="recent-ticket-main">
                            <b>{ticket.subject}</b>
                            <span>{ticket.ticket_code} · {ticket.category}</span>
                          </div>
                          <span className={`status status-${ticket.status.toLowerCase().replaceAll(' ', '-')}`}>
                            {ticket.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="panel support-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Student support</h3>
                      <p>Quick access to CampusResolve services</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="support-action"
                    onClick={openGrievanceForm}
                  >
                    <span className="support-action-icon blue"><Plus size={18} /></span>
                    <span>
                      <b>Raise a grievance</b>
                      <small>Report an issue on campus</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>

                  <button
                    type="button"
                    className="support-action"
                    onClick={() => setActivePage('grievances')}
                  >
                    <span className="support-action-icon amber"><Activity size={18} /></span>
                    <span>
                      <b>Track my requests</b>
                      <small>Check status and resolution</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>

                  <button
                    type="button"
                    className="support-action"
                    onClick={() => setActivePage('helpdesk')}
                  >
                    <span className="support-action-icon green"><Bot size={18} /></span>
                    <span>
                      <b>AI Helpdesk assistant</b>
                      <small>Ask campus-related questions</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>

                  <div className="last-update">
                    <CalendarDays size={15} />
                    Last grievance update: <b>{latestUpdate}</b>
                  </div>
                </section>
              </div>

              <footer>
                CampusResolve <span>•</span> Vignan University Student Support
              </footer>
            </>
          ) : activePage === 'grievances' ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">STUDENT SUPPORT PLATFORM</div>
                  <h1>My Grievances</h1>
                  <p>View, search and manage the concerns you have submitted.</p>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={openGrievanceForm}
                >
                  <Plus size={17} /> New grievance
                </button>
              </div>

              {error && <div className="alert error-alert">{error}</div>}

              {successCode && (
                <div className="alert success-alert">
                  <CheckCircle2 size={17} />
                  Grievance submitted. Your ticket ID is <b>{successCode}</b>.
                </div>
              )}

              <div className="section-title ticket-heading">
                <div>
                  <h3>
                    Submitted tickets
                    <span className="inline-count">{tickets.length}</span>
                  </h3>
                  <p>Search by ticket ID, subject or category</p>
                </div>

                <div className="search-box">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search grievances…"
                  />
                </div>
              </div>

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
                          <td colSpan={7} className="empty-state">Loading tickets…</td>
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
                            <td className="ticket-code">{ticket.ticket_code}</td>
                            <td>
                              <b>{ticket.subject}</b>
                              <small>{ticket.description}</small>
                              {ticket.has_image && (
                                <small className="ticket-photo-indicator">
                                  <ImagePlus size={12} /> Photo attached
                                </small>
                              )}
                            </td>
                            <td>{ticket.category}</td>
                            <td>
                              {ticket.student_name}
                              <small>{ticket.student_email}</small>
                            </td>
                            <td>
                              <span className={`status status-${ticket.status.toLowerCase().replaceAll(' ', '-')}`}>
                                {ticket.status}
                              </span>
                            </td>
                            <td>{new Date(ticket.created_at).toLocaleDateString()}</td>
                            <td>
                              <div className="ticket-actions">
                                {(ticket.status === 'Resolved' || ticket.status === 'Closed') &&
                                  (submittedResolutionFeedback.includes(ticket.ticket_code) ? (
                                    <span className="feedback-done">Feedback submitted</span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="subtle-button"
                                      onClick={() => setSelectedFeedbackTicket(ticket)}
                                    >
                                      Rate resolution
                                    </button>
                                  ))}
                                <button
                                  type="button"
                                  className="delete-ticket-button"
                                  onClick={() => void deleteTicket(ticket)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <footer>
                CampusResolve <span>•</span> Student grievance tracking
              </footer>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">STUDENT SUPPORT PLATFORM</div>
                  <h1>AI Helpdesk Assistant</h1>
                  <p>Ask questions and get answers from the Vignan University knowledge base.</p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setActivePage('overview')}
                >
                  Back to dashboard
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

      {showForm && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowForm(false);
              removeSelectedImage();
            }
          }}
        >
          <div className="modal">
            <div className="modal-head">
              <div>
                <div className="eyebrow">STUDENT SUPPORT</div>
                <h2>Raise a grievance</h2>
                <p>Share the details so your concern can be recorded and routed.</p>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => {
                  setShowForm(false);
                  removeSelectedImage();
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={submitTicket} className="ticket-form">
              <div className="form-row">
                <label>
                  Registration number
                  <input required value={registrationNumber} readOnly />
                </label>
                <label>
                  Student name
                  <input
                    required
                    minLength={2}
                    value={form.student_name}
                    onChange={(event) =>
                      setForm({ ...form, student_name: event.target.value })
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
                  onChange={(event) => {
                    setForm({ ...form, student_email: event.target.value });
                    setOtpCode('');
                    setOtpSent(false);
                    setOtpVerified(false);
                  }}
                  placeholder="name@example.com"
                />
              </label>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void sendEmailOTP()}
                  disabled={otpSending || otpVerified || !form.student_email.trim()}
                >
                  {otpSending ? 'Sending OTP…' : otpSent ? 'Resend OTP' : 'Send OTP'}
                </button>
                {otpVerified && (
                  <span style={{ color: '#15803d', fontWeight: 600, fontSize: '0.9rem' }}>
                    <CheckCircle2 size={15} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />
                    Email verified
                  </span>
                )}
              </div>

              {otpSent && !otpVerified && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'end' }}>
                  <label style={{ flex: '1 1 180px' }}>
                    6-digit OTP
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otpCode}
                      onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Enter email OTP"
                    />
                  </label>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void verifyEmailOTP()}
                    disabled={otpVerifying || otpCode.length !== 6}
                  >
                    {otpVerifying ? 'Verifying…' : 'Verify OTP'}
                  </button>
                </div>
              )}

              {otpSent && (
                <small style={{ color: '#64748b' }}>
                  Check your inbox. The OTP expires in 5 minutes.
                </small>
              )}

              <label>
                Subject
                <input
                  required
                  minLength={4}
                  value={form.subject}
                  onChange={(event) =>
                    setForm({ ...form, subject: event.target.value })
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
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Explain what happened and what support you need…"
                />
              </label>

              <label>
                Location (optional)
                <div className="photo-location-field">
                  <MapPin size={17} />
                  <input
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                    placeholder="e.g. Block A, Room 204"
                  />
                </div>
              </label>

              <div className="photo-upload-section">
                <label htmlFor="grievance-image" className="photo-upload-label">
                  <ImagePlus size={20} />
                  <span>
                    <b>Attach a photo (optional)</b>
                    <small>Upload an image to help explain the issue · Max 8 MB</small>
                  </span>
                </label>

                <input
                  id="grievance-image"
                  className="photo-file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                />

                {imagePreview && (
                  <div className="photo-preview">
                    <img
                      src={imagePreview}
                      alt="Grievance attachment preview"
                    />
                    <div>
                      <b>{grievanceImage?.name}</b>
                      <small>
                        {grievanceImage
                          ? `${(grievanceImage.size / (1024 * 1024)).toFixed(2)} MB`
                          : ''}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={removeSelectedImage}
                      aria-label="Remove attached image"
                    >
                      <X size={17} />
                    </button>
                  </div>
                )}
              </div>

              <div className="form-note">
                AI will automatically identify the grievance category, priority and appropriate department.
                {grievanceImage ? ' The attached photo will also be analysed.' : ''}
              </div>

              {error && <div className="alert error-alert">{error}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setShowForm(false);
                    removeSelectedImage();
                  }}
                >
                  Cancel
                </button>
                <button className="primary-button" disabled={submitting || !otpVerified}>
                  {submitting
                    ? 'Submitting…'
                    : !otpVerified
                      ? 'Verify email to submit'
                      : grievanceImage
                        ? 'Submit photo grievance'
                        : 'Submit grievance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="stat-decoration" />
    </div>
  );
}

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
        throw new Error(data.detail || 'Unable to submit feedback.');
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
        if (event.target === event.currentTarget && !saving) onClose();
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
              <button type="button" className="primary-button" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <form className="ticket-form" onSubmit={submitFeedback}>
            <p><b>Issue:</b> {ticket.subject}</p>
            <label>How satisfied are you with the resolution?</label>

            <div className="rating-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`Rate ${star} stars`}
                  onClick={() => setRating(star)}
                  className={rating >= star ? 'star-selected' : ''}
                >
                  <Star size={30} fill={rating >= star ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>

            <label>Was your grievance resolved satisfactorily?</label>
            <div className="helpful-actions">
              <button
                type="button"
                className={helpful === true ? 'chosen-yes' : ''}
                onClick={() => setHelpful(true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={helpful === false ? 'chosen-no' : ''}
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
                onChange={(event) => setComments(event.target.value)}
                placeholder="Share your experience..."
              />
            </label>

            {error && <div className="alert error-alert">{error}</div>}

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