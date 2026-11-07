import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import './StaffDashboard.css';
import {
  ClipboardList,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock3,
  AlertCircle,
  LogOut,
  X,
  UserRound,
  Mail,
  MapPin,
  CalendarDays,
  Image as ImageIcon,
  Filter,
  Eye,
} from 'lucide-react';
import './StaffDashboard.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

type Ticket = {
  ticket_code: string;
  student_name: string;
  registration_number: string;
  student_email: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  urgency: string;
  status: string;
  assigned_department: string;
  created_at: string;
  location?: string | null;
  submission_type?: string | null;
  has_image?: boolean;
  image_url?: string | null;
};

type Props = {
  onLogout: () => void;
  accessToken: string;
  category: string;
};

const STATUS_OPTIONS = ['Open', 'In Progress', 'Resolved', 'Closed'];

function formatDate(value: string) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusClass(status: string) {
  return status.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function priorityClass(priority: string) {
  return priority.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function StaffDashboard({ onLogout, accessToken, category }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newStatus, setNewStatus] = useState('In Progress');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API}/api/grievances?limit=200`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? 'Your session has expired. Please log in again.'
            : 'Unable to load grievances. Please try again.',
        );
      }

      const data: Ticket[] = await response.json();
      setTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot connect to the backend.');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets, category]);

  // The backend must also enforce department access; this client-side filter is for display only.
  const departmentTickets = useMemo(
    () =>
      tickets.filter(
        (ticket) =>
          ticket.category?.toLowerCase() === category.toLowerCase() ||
          ticket.category?.toLowerCase() === 'other',
      ),
    [tickets, category],
  );

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return departmentTickets.filter((ticket) => {
      const searchable = [
        ticket.ticket_code,
        ticket.student_name,
        ticket.registration_number,
        ticket.student_email,
        ticket.subject,
        ticket.description,
        ticket.category,
        ticket.priority,
        ticket.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !query || searchable.includes(query);
      const matchesStatus = statusFilter === 'All' || ticket.status === statusFilter;
      const matchesPriority =
        priorityFilter === 'All' || ticket.priority?.toLowerCase() === priorityFilter.toLowerCase();

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [departmentTickets, search, statusFilter, priorityFilter]);

  const pendingCount = departmentTickets.filter(
    (ticket) => ticket.status === 'Open' || ticket.status === 'In Progress',
  ).length;
  const inProgressCount = departmentTickets.filter((ticket) => ticket.status === 'In Progress').length;
  const resolvedCount = departmentTickets.filter(
    (ticket) => ticket.status === 'Resolved' || ticket.status === 'Closed',
  ).length;
  const urgentCount = departmentTickets.filter(
    (ticket) => ['high', 'urgent', 'critical'].includes(ticket.priority?.toLowerCase()),
  ).length;

  function openTicket(ticket: Ticket) {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status === 'Open' ? 'In Progress' : ticket.status);
    setRemarks('');
    setError('');
  }

  async function updateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket || !remarks.trim()) {
      setError('Please enter a staff remark before saving the update.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch(
        `${API}/api/grievances/${encodeURIComponent(selectedTicket.ticket_code)}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            status: newStatus,
            update_note: remarks.trim(),
            updated_by: `${category} Staff`,
          }),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'Unable to update this grievance.');
      }

      setSelectedTicket(null);
      setRemarks('');
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The grievance update failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="staff-app">
      <aside className="staff-sidebar">
        <div className="staff-brand">
          <div className="staff-brand-mark"><ClipboardList size={22} /></div>
          <div className="staff-brand-copy">
            <strong>CampusResolve</strong>
            <span>STAFF WORKSPACE</span>
          </div>
        </div>

        <div className="staff-nav-label">DEPARTMENT WORKSPACE</div>
        <div className="staff-nav-item staff-nav-item-active">
          <ClipboardList size={18} />
          <span>Grievance Management</span>
        </div>

        <div className="staff-sidebar-footer">
          <div className="staff-avatar">{category.slice(0, 1).toUpperCase()}</div>
          <div className="staff-sidebar-user">
            <strong>{category} Department</strong>
            <span>Staff Portal</span>
          </div>
        </div>
      </aside>

      <main className="staff-main">
        <header className="staff-topbar">
          <div className="staff-breadcrumb">
            <span>Workspace</span><span className="staff-breadcrumb-separator">/</span>
            <strong>Staff Dashboard</strong>
          </div>
          <div className="staff-topbar-actions">
            <span className="staff-department-pill">{category.toUpperCase()}</span>
            <button className="staff-logout-button" type="button" onClick={onLogout}>
              <LogOut size={17} /><span>Logout</span>
            </button>
          </div>
        </header>

        <section className="staff-content">
          <div className="staff-page-heading">
            <div>
              <div className="staff-eyebrow">STAFF MANAGEMENT</div>
              <h1>{category} Grievances</h1>
              <p>Review, manage and update grievances assigned to your department.</p>
            </div>
            <button className="staff-refresh-button" type="button" onClick={() => void loadTickets()} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'staff-spin' : ''} />
              {loading ? 'Refreshing' : 'Refresh'}
            </button>
          </div>

          <div className="staff-stats-grid">
            <article className="staff-stat-card">
              <div className="staff-stat-icon staff-stat-blue"><ClipboardList size={20} /></div>
              <div className="staff-stat-copy"><span>Total grievances</span><strong>{departmentTickets.length}</strong><small>Assigned to this view</small></div>
            </article>
            <article className="staff-stat-card">
              <div className="staff-stat-icon staff-stat-amber"><Clock3 size={20} /></div>
              <div className="staff-stat-copy"><span>Pending</span><strong>{pendingCount}</strong><small>Open or in progress</small></div>
            </article>
            <article className="staff-stat-card">
              <div className="staff-stat-icon staff-stat-green"><CheckCircle2 size={20} /></div>
              <div className="staff-stat-copy"><span>Resolved / Closed</span><strong>{resolvedCount}</strong><small>Completed grievances</small></div>
            </article>
            <article className="staff-stat-card">
              <div className="staff-stat-icon staff-stat-red"><AlertCircle size={20} /></div>
              <div className="staff-stat-copy"><span>High priority</span><strong>{urgentCount}</strong><small>Requires attention</small></div>
            </article>
          </div>

          <section className="staff-list-section">
            <div className="staff-list-heading">
              <div>
                <h2>Department grievances</h2>
                <p>{category} and Other category complaints</p>
              </div>
              <span className="staff-result-count">{filteredTickets.length} results</span>
            </div>

            <div className="staff-toolbar">
              <label className="staff-search-box">
                <Search size={18} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search ticket, student, registration number..."
                  aria-label="Search grievances"
                />
                {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={15} /></button>}
              </label>
              <label className="staff-filter">
                <Filter size={16} />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
                  <option value="All">All statuses</option>
                  {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label className="staff-filter">
                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Filter by priority">
                  <option value="All">All priorities</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Critical">Critical</option>
                </select>
              </label>
            </div>

            {error && <div className="staff-alert"><AlertCircle size={17} /><span>{error}</span></div>}

            <div className="staff-table-card">
              <div className="staff-table-wrap">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Student</th>
                      <th>Grievance</th>
                      <th>Category</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="staff-empty-state"><span className="staff-loader" />Loading grievances...</td></tr>
                    ) : filteredTickets.length === 0 ? (
                      <tr><td colSpan={7} className="staff-empty-state">
                        <ClipboardList size={30} />
                        <strong>No grievances found</strong>
                        <span>Try changing the search or filters.</span>
                      </td></tr>
                    ) : filteredTickets.map((ticket) => (
                      <tr key={ticket.ticket_code}>
                        <td><span className="staff-ticket-code">{ticket.ticket_code}</span><small>{formatDate(ticket.created_at)}</small></td>
                        <td><strong className="staff-student-name">{ticket.student_name}</strong><small>{ticket.registration_number}</small></td>
                        <td><strong className="staff-subject">{ticket.subject}</strong><small>{ticket.has_image ? <span className="staff-photo-tag"><ImageIcon size={12} /> Photo attached</span> : ticket.assigned_department}</small></td>
                        <td><span className="staff-category-tag">{ticket.category}</span></td>
                        <td><span className={`staff-priority staff-priority-${priorityClass(ticket.priority)}`}>{ticket.priority}</span></td>
                        <td><span className={`staff-status staff-status-${statusClass(ticket.status)}`}>{ticket.status}</span></td>
                        <td><button className="staff-review-button" type="button" onClick={() => openTicket(ticket)}><Eye size={15} /> Review</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </section>
      </main>

      {selectedTicket && (
        <div className="staff-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelectedTicket(null); }}>
          <section className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="staff-modal-title">
            <div className="staff-modal-header">
              <div>
                <div className="staff-eyebrow">GRIEVANCE REVIEW</div>
                <h2 id="staff-modal-title">{selectedTicket.ticket_code}</h2>
                <p>{selectedTicket.subject}</p>
              </div>
              <button className="staff-modal-close" type="button" onClick={() => setSelectedTicket(null)} disabled={saving} aria-label="Close"><X size={20} /></button>
            </div>

            <div className="staff-detail-grid">
              <div className="staff-detail-item"><UserRound size={17} /><div><span>Student</span><strong>{selectedTicket.student_name}</strong></div></div>
              <div className="staff-detail-item"><ClipboardList size={17} /><div><span>Registration number</span><strong>{selectedTicket.registration_number}</strong></div></div>
              <div className="staff-detail-item"><Mail size={17} /><div><span>Student email</span><strong>{selectedTicket.student_email}</strong></div></div>
              <div className="staff-detail-item"><CalendarDays size={17} /><div><span>Submitted</span><strong>{formatDate(selectedTicket.created_at)}</strong></div></div>
              {selectedTicket.location && <div className="staff-detail-item"><MapPin size={17} /><div><span>Location</span><strong>{selectedTicket.location}</strong></div></div>}
            </div>

            <div className="staff-description-block">
              <div className="staff-description-meta">
                <span className="staff-category-tag">{selectedTicket.category}</span>
                <span className={`staff-priority staff-priority-${priorityClass(selectedTicket.priority)}`}>{selectedTicket.priority} priority</span>
                {selectedTicket.has_image && <span className="staff-photo-tag"><ImageIcon size={13} /> Photo attached</span>}
              </div>
              <h3>Complaint description</h3>
              <p>{selectedTicket.description || 'No description provided.'}</p>
              <div className="staff-assignment-line"><strong>Assigned department:</strong> {selectedTicket.assigned_department}</div>
              {selectedTicket.has_image && (
                <div className="staff-uploaded-photo" style={{ marginTop: 18 }}>
                  <h3 style={{ marginBottom: 10 }}>Uploaded grievance photo</h3>
                  {selectedTicket.image_url ? (
                    <a
                      href={selectedTicket.image_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open uploaded grievance photo in a new tab"
                    >
                      <img
                        src={selectedTicket.image_url}
                        alt={`Photo attached to grievance ${selectedTicket.ticket_code}`}
                        loading="lazy"
                        style={{
                          display: 'block',
                          width: '100%',
                          maxWidth: 560,
                          maxHeight: 380,
                          objectFit: 'contain',
                          border: '1px solid #e2e8f0',
                          borderRadius: 10,
                          background: '#f8fafc',
                        }}
                      />
                    </a>
                  ) : (
                    <p style={{ color: '#64748b', fontSize: 13 }}>
                      Photo is attached, but its secure preview URL is unavailable. Refresh and try again.
                    </p>
                  )}
                </div>
              )}
            </div>

            <form className="staff-update-form" onSubmit={updateStatus}>
              <h3>Update grievance</h3>
              <label>
                Status
                <select value={newStatus} onChange={(event) => setNewStatus(event.target.value)}>
                  {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label>
                Staff remarks <span className="staff-required">*</span>
                <textarea
                  rows={4}
                  required
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Describe the action taken or resolution provided to the student..."
                />
              </label>
              <div className="staff-modal-actions">
                <button type="button" className="staff-cancel-button" onClick={() => setSelectedTicket(null)} disabled={saving}>Cancel</button>
                <button type="submit" className="staff-save-button" disabled={saving || !remarks.trim()}>
                  {saving ? 'Saving update...' : 'Save update'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
