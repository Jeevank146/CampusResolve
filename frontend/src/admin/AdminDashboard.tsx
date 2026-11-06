import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  Search,
  ShieldCheck,
  LogOut,
  Star,
  MessageSquare,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

type Ticket = {
  ticket_code: string;
  registration_number: string;
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
};

type Feedback = {
  id: number;
  registration_number: string;
  feedback_type: 'AI_RESPONSE' | 'GRIEVANCE_RESOLUTION' | string;
  ticket_code: string | null;
  query_text: string | null;
  rating: number;
  helpful: boolean | null;
  comments: string | null;
  created_at: string;
};

type Props = {
  onLogout: () => void;
  accessToken: string;
};

export default function AdminDashboard({
  onLogout,
  accessToken,
}: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [feedbackError, setFeedbackError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newStatus, setNewStatus] = useState('In Progress');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'grievances'>('dashboard');

  // Load all grievances using Admin JWT
  async function loadTickets() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${API}/api/grievances?limit=200`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Admin session expired or access denied. Please login again.');
        }

        throw new Error('Unable to load grievances.');
      }

      const data: Ticket[] = await response.json();
      setTickets(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Cannot connect to FastAPI.',
      );
    } finally {
      setLoading(false);
    }
  }

  // Load feedback submitted by students. The endpoint is Admin-only.
  async function loadFeedback() {
    setFeedbackLoading(true);
    setFeedbackError('');

    try {
      const response = await fetch(`${API}/api/feedback`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.detail || `Unable to load student feedback (HTTP ${response.status}).`,
        );
      }

      const data: Feedback[] = await response.json();
      setFeedback(Array.isArray(data) ? data : []);
    } catch (e) {
      setFeedbackError(
        e instanceof Error ? e.message : 'Unable to load student feedback.',
      );
    } finally {
      setFeedbackLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
    void loadFeedback();
  }, [accessToken]);

  // Department options
  const departments = useMemo(
    () => [
      ...new Set([
        'Academic Department / Concerned HOD',
        'Examination Cell',
        'Hostel Office',
        'Transport Office',
        'Administrative Office',
        'Student Welfare Office',
        'Pending verification',
        'Admin Review (Escalated)',
        ...tickets.map((ticket) => ticket.assigned_department).filter(Boolean),
      ]),
    ],
    [tickets],
  );

  // Apply search and filters
  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch =
      `${ticket.ticket_code} ${ticket.student_name} ${ticket.subject} ${ticket.category}`
        .toLowerCase()
        .includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' ||
      ticket.status === statusFilter;

    const matchesDepartment =
      departmentFilter === 'All' ||
      ticket.assigned_department === departmentFilter;

    return matchesSearch && matchesStatus && matchesDepartment;
  });

  const pending = tickets.filter(
    (ticket) =>
      ticket.status === 'Open' ||
      ticket.status === 'In Progress',
  ).length;

  const resolved = tickets.filter(
    (ticket) =>
      ticket.status === 'Resolved' ||
      ticket.status === 'Closed',
  ).length;

  const critical = tickets.filter(
    (ticket) => ticket.priority === 'Critical',
  ).length;

  // Active escalations are tickets moved to the Admin Review queue
  // that have not yet been resolved or closed.
  const escalatedTickets = tickets.filter(
    (ticket) =>
      ticket.assigned_department === 'Admin Review (Escalated)' &&
      ticket.status !== 'Resolved' &&
      ticket.status !== 'Closed',
  );

  const categoryCounts = useMemo(() => {
    const categories = [
      'Academics',
      'Examinations',
      'Hostel',
      'Transport',
      'Administration',
      'Other',
    ];

    return tickets.reduce<Record<string, number>>(
      (counts, ticket) => {
        const name = ticket.category || 'Other';
        counts[name] = (counts[name] || 0) + 1;
        return counts;
      },
      Object.fromEntries(categories.map((name) => [name, 0])),
    );
  }, [tickets]);

  const departmentCounts = useMemo(() => {
    const knownDepartments = [
      'Academic Department / Concerned HOD',
      'Examination Cell',
      'Hostel Office',
      'Transport Office',
      'Administrative Office',
      'Student Welfare Office',
      'Pending verification',
      'Admin Review (Escalated)',
    ];

    return tickets.reduce<Record<string, number>>(
      (counts, ticket) => {
        const name = ticket.assigned_department || 'Unassigned';
        counts[name] = (counts[name] || 0) + 1;
        return counts;
      },
      Object.fromEntries(knownDepartments.map((name) => [name, 0])),
    );
  }, [tickets]);

  const averageRating = feedback.length
    ? (feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1)
    : '—';

  const ratedHelpfulFeedback = feedback.filter((item) => item.helpful !== null);
  const helpfulPercentage = ratedHelpfulFeedback.length
    ? Math.round(
        (ratedHelpfulFeedback.filter((item) => item.helpful === true).length /
          ratedHelpfulFeedback.length) * 100,
      )
    : 0;

  // Update grievance status using Admin JWT
  async function updateStatus(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selectedTicket || !remarks.trim()) {
      setError('Please enter an update remark.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch(
        `${API}/api/grievances/${encodeURIComponent(
          selectedTicket.ticket_code,
        )}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            status: newStatus,
            update_note: remarks.trim(),
            updated_by: 'Admin',
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || 'Unable to update grievance.',
        );
      }

      setSelectedTicket(null);
      setRemarks('');
      await loadTickets();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Update failed.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">

      {/* Admin Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={20} />
          </div>

          <div>
            <strong>CampusResolve</strong>
            <span>ADMIN WORKSPACE</span>
          </div>
        </div>

        <div className="nav-label">ADMINISTRATION</div>

        <div
          className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => {
            setActiveView('dashboard');
            document.getElementById('admin-dashboard-top')?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setActiveView('dashboard');
              document.getElementById('admin-dashboard-top')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              });
            }
          }}
        >
          <Activity size={17} />
          Dashboard
        </div>

        <div
          className={`nav-item ${activeView === 'grievances' ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => {
            setActiveView('grievances');
            document.getElementById('all-grievances')?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setActiveView('grievances');
              document.getElementById('all-grievances')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              });
            }
          }}
        >
          <ClipboardList size={17} />
          All grievances
        </div>

        <div className="sidebar-bottom">
          <div className="secure-icon">
            <ShieldCheck size={17} />
          </div>

          <div>
            <b>Administrator</b>
            <span>Management workspace</span>
          </div>
        </div>
      </aside>

      {/* Main Dashboard */}
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> Admin Dashboard
          </div>

          <div className="top-actions">
            <span className="environment">ADMIN</span>

            <button
              className="icon-button"
              onClick={onLogout}
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <section className="content">

          {/* Heading */}
          <div
            id="admin-dashboard-top"
            className="page-heading"
            style={{ scrollMarginTop: 90 }}
          >
            <div>
              <div className="eyebrow">
                CAMPUS ADMINISTRATION
              </div>

              <h1>Admin Dashboard</h1>

              <p>
                Monitor student grievances and departmental performance.
              </p>
            </div>

            <button
              className="subtle-button"
              onClick={() => {
                void loadTickets();
                void loadFeedback();
              }}
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>

          {error && (
            <div className="alert error-alert">
              {error}
            </div>
          )}

          {/* Main Statistics */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">
                <ClipboardList size={18} />
              </div>
              <div>
                <span>Total grievances</span>
                <strong>{tickets.length}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon amber">
                <Activity size={18} />
              </div>
              <div>
                <span>Pending / In progress</span>
                <strong>{pending}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <span>Resolved / Closed</span>
                <strong>{resolved}</strong>
              </div>
            </div>
          </div>

          {/* Additional Statistics */}
          <div
            className="stats-grid"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            <div className="stat-card">
              <div className="stat-icon amber">
                <AlertTriangle size={18} />
              </div>
              <div>
                <span>Critical priority</span>
                <strong>{critical}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon blue">
                <ShieldCheck size={18} />
              </div>
              <div>
                <span>Departments involved</span>
                <strong>{departments.length}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon amber">
                <AlertTriangle size={18} />
              </div>
              <div>
                <span>Active escalations</span>
                <strong>{escalatedTickets.length}</strong>
              </div>
            </div>
          </div>

          {/* Escalated grievances queue */}
          <div className="section-title ticket-heading">
            <div>
              <h3>Escalated grievances</h3>
              <p>Unresolved complaints moved to Admin Review after 48 hours</p>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 11px',
                borderRadius: 20,
                background: '#fff7ed',
                color: '#9a3412',
                border: '1px solid #fed7aa',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <AlertTriangle size={14} />
              {escalatedTickets.length} awaiting review
            </span>
          </div>

          <div className="table-card" style={{ marginBottom: 28 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>TICKET</th>
                    <th>STUDENT</th>
                    <th>SUBJECT</th>
                    <th>CATEGORY</th>
                    <th>PRIORITY</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="empty-state">
                        Loading escalated grievances...
                      </td>
                    </tr>
                  ) : escalatedTickets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-state">
                        No active escalated grievances.
                      </td>
                    </tr>
                  ) : (
                    escalatedTickets.map((ticket) => (
                      <tr key={`escalated-${ticket.ticket_code}`}>
                        <td className="ticket-code">{ticket.ticket_code}</td>
                        <td>
                          {ticket.student_name}
                          <small>{ticket.registration_number}</small>
                        </td>
                        <td><b>{ticket.subject}</b></td>
                        <td>{ticket.category}</td>
                        <td>{ticket.priority}</td>
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
                          <button
                            className="subtle-button"
                            onClick={() => {
                              setSelectedTicket(ticket);
                              setNewStatus(ticket.status);
                              setRemarks('');
                              setError('');
                            }}
                          >
                            Review / Update
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category and Department Summary */}
          <div
            className="grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
              marginBottom: 28,
            }}
          >
            <div
              className="table-card"
              style={{ padding: 18 }}
            >
              <h3>Category-wise grievances</h3>

              {Object.entries(categoryCounts).length === 0 ? (
                <p>No category data available.</p>
              ) : (
                Object.entries(categoryCounts).map(
                  ([name, count]) => (
                    <p
                      key={name}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                      }}
                    >
                      {name}<b>{count}</b>
                    </p>
                  ),
                )
              )}
            </div>

            <div
              className="table-card"
              style={{ padding: 18 }}
            >
              <h3>Department-wise grievances</h3>

              {Object.entries(departmentCounts).length === 0 ? (
                <p>No department data available.</p>
              ) : (
                Object.entries(departmentCounts).map(
                  ([name, count]) => (
                    <p
                      key={name}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                      }}
                    >
                      {name}<b>{count}</b>
                    </p>
                  ),
                )
              )}
            </div>
          </div>

          {/* Student Feedback Overview */}
          <div className="section-title ticket-heading">
            <div>
              <h3>Student feedback overview</h3>
              <p>Ratings and comments submitted for AI answers and grievance resolutions</p>
            </div>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {feedback.length} total responses
            </span>
          </div>

          <div className="stats-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-icon blue"><MessageSquare size={18} /></div>
              <div>
                <span>Total feedback</span>
                <strong>{feedback.length}</strong>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon amber"><Star size={18} /></div>
              <div>
                <span>Average rating</span>
                <strong>{averageRating}{averageRating !== '—' ? ' / 5' : ''}</strong>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><CheckCircle2 size={18} /></div>
              <div>
                <span>Helpful responses</span>
                <strong>{ratedHelpfulFeedback.length ? `${helpfulPercentage}%` : '—'}</strong>
              </div>
            </div>
          </div>

          {feedbackError && (
            <div className="alert error-alert">{feedbackError}</div>
          )}

          <div className="table-card" style={{ marginBottom: 28 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>STUDENT</th>
                    <th>FEEDBACK TYPE</th>
                    <th>QUERY / TICKET</th>
                    <th>RATING</th>
                    <th>HELPFUL</th>
                    <th>COMMENTS</th>
                  </tr>
                </thead>
                <tbody>
                  {feedbackLoading ? (
                    <tr><td colSpan={7} className="empty-state">Loading student feedback...</td></tr>
                  ) : feedback.length === 0 ? (
                    <tr><td colSpan={7} className="empty-state">No student feedback received yet.</td></tr>
                  ) : (
                    feedback.map((item) => (
                      <tr key={item.id}>
                        <td>{item.created_at ? new Date(item.created_at).toLocaleString() : '—'}</td>
                        <td>{item.registration_number}</td>
                        <td>{item.feedback_type === 'AI_RESPONSE' ? 'AI answer' : 'Grievance resolution'}</td>
                        <td>{item.query_text || item.ticket_code || '—'}</td>
                        <td><span style={{ color: '#b45309', fontWeight: 700 }}>{'★'.repeat(Math.max(0, Math.min(5, item.rating)))}{'☆'.repeat(5 - Math.max(0, Math.min(5, item.rating)))} ({item.rating}/5)</span></td>
                        <td>{item.helpful === true ? 'Yes' : item.helpful === false ? 'No' : 'Not rated'}</td>
                        <td>{item.comments || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* All Grievances */}
          <div
            id="all-grievances"
            className="section-title ticket-heading"
            style={{ scrollMarginTop: 90 }}
          >
            <div>
              <h3>All grievances</h3>
              <p>Monitor and manage submitted complaints</p>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                style={{
                  padding: 9,
                  border: '1px solid #e5eaf1',
                  borderRadius: 7,
                }}
              >
                <option value="All">All statuses</option>
                <option>Open</option>
                <option>In Progress</option>
                <option>Resolved</option>
                <option>Closed</option>
              </select>

              <select
                value={departmentFilter}
                onChange={(event) =>
                  setDepartmentFilter(event.target.value)
                }
                style={{
                  padding: 9,
                  border: '1px solid #e5eaf1',
                  borderRadius: 7,
                }}
              >
                <option value="All">All departments</option>
                {departments.map((department) => (
                  <option key={department}>
                    {department}
                  </option>
                ))}
              </select>

              <div className="search-box">
                <Search size={16} />

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Search grievances..."
                />
              </div>
            </div>
          </div>

          <div className="table-card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>TICKET</th>
                    <th>STUDENT</th>
                    <th>SUBJECT</th>
                    <th>CATEGORY</th>
                    <th>DEPARTMENT</th>
                    <th>PRIORITY</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="empty-state">
                        Loading grievances...
                      </td>
                    </tr>
                  ) : filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty-state">
                        No grievances found.
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map((ticket) => (
                      <tr key={ticket.ticket_code}>
                        <td className="ticket-code">
                          {ticket.ticket_code}
                        </td>

                        <td>
                          {ticket.student_name}
                          <small>{ticket.registration_number}</small>
                        </td>

                        <td>
                          <b>{ticket.subject}</b>
                        </td>

                        <td>{ticket.category}</td>

                        <td>
                          {ticket.assigned_department}
                          {ticket.assigned_department === 'Admin Review (Escalated)' && (
                            <small style={{ color: '#b45309', fontWeight: 700 }}>
                              Escalated for admin review
                            </small>
                          )}
                        </td>

                        <td>{ticket.priority}</td>

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
                          <button
                            className="subtle-button"
                            onClick={() => {
                              setSelectedTicket(ticket);
                              setNewStatus(ticket.status);
                              setRemarks('');
                              setError('');
                            }}
                          >
                            Review / Update
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* Admin Review Modal */}
      {selectedTicket && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <div>
                <div className="eyebrow">ADMIN REVIEW</div>
                <h2>{selectedTicket.ticket_code}</h2>
                <p>{selectedTicket.subject}</p>
              </div>

              <button
                className="close-button"
                onClick={() => setSelectedTicket(null)}
              >
                ×
              </button>
            </div>

            <p>
              <b>Student:</b> {selectedTicket.student_name}
            </p>

            <p>
              <b>Registration:</b> {selectedTicket.registration_number}
            </p>

            <p>
              <b>Email:</b> {selectedTicket.student_email}
            </p>

            <p>
              <b>Category:</b> {selectedTicket.category}
            </p>

            <p>
              <b>Priority:</b> {selectedTicket.priority} / {selectedTicket.urgency}
            </p>

            <p>
              <b>Department:</b> {selectedTicket.assigned_department}
            </p>

            <p>
              <b>Description:</b> {selectedTicket.description}
            </p>

            <form
              className="ticket-form"
              onSubmit={updateStatus}
            >
              <label>
                Update status

                <select
                  value={newStatus}
                  onChange={(event) =>
                    setNewStatus(event.target.value)
                  }
                >
                  <option>Open</option>
                  <option>In Progress</option>
                  <option>Resolved</option>
                  <option>Closed</option>
                </select>
              </label>

              <label>
                Admin remarks

                <textarea
                  required
                  rows={4}
                  value={remarks}
                  onChange={(event) =>
                    setRemarks(event.target.value)
                  }
                  placeholder="Enter administrative update..."
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSelectedTicket(null)}
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
