
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ClipboardList,
  RefreshCw,
  Search,
  CheckCircle2,
  LogOut,
} from 'lucide-react';

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
};

type Props = {
  onLogout: () => void;
  accessToken: string;
  category: string;
};

export default function StaffDashboard({
  onLogout,
  accessToken,
  category,
}: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newStatus, setNewStatus] = useState('In Progress');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  // Load tickets using authentication token
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
        throw new Error(
          response.status === 401
            ? 'Session expired. Please login again.'
            : 'Unable to load grievances.',
        );
      }

      const data: Ticket[] = await response.json();
      setTickets(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Cannot connect to the backend.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, [accessToken, category]);

  // Show only assigned category and Other tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const matchesCategory =
        ticket.category === category ||
        ticket.category === 'Other';

      const matchesSearch =
        `${ticket.ticket_code} ${ticket.subject} ${ticket.student_name} ${ticket.category}`
          .toLowerCase()
          .includes(search.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [tickets, category, search]);

  const pendingCount = filteredTickets.filter(
    (ticket) =>
      ticket.status === 'Open' ||
      ticket.status === 'In Progress',
  ).length;

  const resolvedCount = filteredTickets.filter(
    (ticket) =>
      ticket.status === 'Resolved' ||
      ticket.status === 'Closed',
  ).length;

  // Update grievance status
  async function updateStatus(event: FormEvent<HTMLFormElement>) {
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
            updated_by: `${category} Staff`,
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
        e instanceof Error ? e.message : 'Update failed.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ClipboardList size={20} />
          </div>

          <div>
            <strong>CampusResolve</strong>
            <span>STAFF WORKSPACE</span>
          </div>
        </div>

        <div className="nav-label">DEPARTMENT WORKSPACE</div>

        <div className="nav-item active">
          <ClipboardList size={17} />
          Grievance Management
        </div>

        <div className="sidebar-bottom">
          <div>
            <b>{category} Department</b>
            <span>Staff Portal</span>
          </div>
        </div>
      </aside>

      {/* Main Dashboard */}
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace / Staff Dashboard
          </div>

          <div className="top-actions">
            <span className="environment">
              {category.toUpperCase()}
            </span>

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
          <div className="page-heading">
            <div>
              <div className="eyebrow">STAFF MANAGEMENT</div>
              <h1>{category} Grievances</h1>
              <p>
                Review complaints assigned to your department
                and Other category.
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

          {/* Statistics */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">
                <ClipboardList size={18} />
              </div>
              <div>
                <span>Total grievances</span>
                <strong>{filteredTickets.length}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon amber">
                <RefreshCw size={18} />
              </div>
              <div>
                <span>Pending / In progress</span>
                <strong>{pendingCount}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <span>Resolved / Closed</span>
                <strong>{resolvedCount}</strong>
              </div>
            </div>
          </div>

          {/* Grievance List */}
          <div className="section-title ticket-heading">
            <div>
              <h3>Department grievances</h3>
              <p>
                {category} and Other category complaints
              </p>
            </div>

            <div className="search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search grievances..."
              />
            </div>
          </div>

          {error && (
            <div className="alert error-alert">
              {error}
            </div>
          )}

          <div className="table-card">
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
                        Loading grievances...
                      </td>
                    </tr>
                  ) : filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-state">
                        No grievances found for this department.
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
                          <small>{ticket.assigned_department}</small>
                        </td>

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
                              setNewStatus(
                                ticket.status === 'Open'
                                  ? 'In Progress'
                                  : ticket.status,
                              );
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

      {/* Review Modal */}
      {selectedTicket && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <div>
                <div className="eyebrow">TICKET DETAILS</div>
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
              <b>Category:</b> {selectedTicket.category}
            </p>

            <p>
              <b>Department:</b> {selectedTicket.assigned_department}
            </p>

            <p>
              <b>Priority:</b> {selectedTicket.priority} / {selectedTicket.urgency}
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
                  onChange={(event) => setNewStatus(event.target.value)}
                >
                  <option>Open</option>
                  <option>In Progress</option>
                  <option>Resolved</option>
                  <option>Closed</option>
                </select>
              </label>

              <label>
                Staff remarks

                <textarea
                  rows={4}
                  required
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Describe the action taken or resolution..."
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
