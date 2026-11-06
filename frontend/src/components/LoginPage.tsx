import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import './LoginPage.css';

type Role = 'Student' | 'Staff' | 'Admin';

type LoginPageProps = {
  onLogin: (
    role: Role,
    registrationNumber: string,
    accessToken?: string,
    category?: string,
  ) => void;
};

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const staffAccounts: Record<string, string> = {
  Academics: 'ACADEMICS_STAFF',
  Examinations: 'EXAM_STAFF',
  Hostel: 'HOSTEL_STAFF',
  Transport: 'TRANSPORT_STAFF',
  Administration: 'ADMIN_STAFF',
  Other: 'OTHER_STAFF',
};

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [role, setRole] = useState<Role>('Student');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [adminId, setAdminId] = useState('');
  const [category, setCategory] = useState('Academics');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const staffId = staffAccounts[category];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const loginPayload =
        role === 'Student'
          ? {
              role: 'Student',
              registration_number: registrationNumber.trim().toUpperCase(),
              password,
            }
          : role === 'Admin'
            ? {
                role: 'Admin',
                username: adminId.trim(),
                password,
              }
            : {
                role: 'Staff',
                staff_id: staffId,
                category,
                password,
              };

      const response = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginPayload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'Invalid login credentials.');
      }
      if (!data.access_token) {
        throw new Error('The server did not return an access token.');
      }

      onLogin(
        role,
        role === 'Student' ? registrationNumber.trim().toUpperCase() : '',
        data.access_token,
        data.category || '',
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Login failed. Check that the backend is running.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="background-gallery">
        {[0, 1, 2].map((row) => (
          <div className="gallery-row" key={row}>
            <div className={`gallery-track ${row === 1 ? 'reverse' : ''}`}>
              {[1, 2, 3, 4, 5, 1, 2, 3, 4, 5].map((number, index) => (
                <img
                  key={`${row}-${index}`}
                  src={`/images/campus/campus-${number}.jpg`}
                  alt="Vignan University campus"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="background-overlay" />

      <div className="login-content">
        <div className="login-brand">
          <div className="brand-icon"><Sparkles size={24} /></div>
          <div>
            <h2>CampusResolve</h2>
            <span>INTELLIGENT CAMPUS</span>
          </div>
        </div>

        <div className="login-card">
          <div className="welcome-section">
            <div className="welcome-icon"><GraduationCap size={25} /></div>
            <span className="welcome-label">VIGNAN UNIVERSITY</span>
            <h1>Welcome back!</h1>
            <p>Sign in to access your campus support portal.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="field-label">SELECT YOUR ROLE</label>
            <div className="role-options">
              {(['Student', 'Staff', 'Admin'] as Role[]).map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`role-button ${role === item ? 'selected' : ''}`}
                  onClick={() => {
                    setRole(item);
                    setPassword('');
                    setError('');
                  }}
                >
                  {item}
                </button>
              ))}
            </div>

            {role === 'Student' && (
              <>
                <label className="field-label" htmlFor="registration">REGISTRATION NUMBER</label>
                <div className="input-container">
                  <GraduationCap size={18} />
                  <input
                    id="registration"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
                    placeholder="Enter registration number"
                    autoComplete="username"
                    required
                  />
                </div>
                <label className="field-label" htmlFor="password">CONFIRM REGISTRATION NUMBER</label>
                <div className="input-container">
                  <LockKeyhole size={18} />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter the same registration number"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </>
            )}

            {role === 'Staff' && (
              <>
                <label className="field-label" htmlFor="staff-category">SELECT DEPARTMENT</label>
                <select
                  id="staff-category"
                  className="staff-category-select"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setPassword('');
                    setError('');
                  }}
                >
                  {Object.keys(staffAccounts).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <label className="field-label" htmlFor="staff-id">STAFF ID</label>
                <div className="input-container">
                  <User size={18} />
                  <input id="staff-id" value={staffId} readOnly />
                </div>
                <label className="field-label" htmlFor="password">PASSWORD</label>
                <div className="input-container">
                  <LockKeyhole size={18} />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter department password"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </>
            )}

            {role === 'Admin' && (
              <>
                <label className="field-label" htmlFor="admin-id">ADMIN ID</label>
                <div className="input-container">
                  <User size={18} />
                  <input
                    id="admin-id"
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value)}
                    placeholder="Enter Admin ID"
                    autoComplete="username"
                    required
                  />
                </div>
                <label className="field-label" htmlFor="password">PASSWORD</label>
                <div className="input-container">
                  <LockKeyhole size={18} />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter Admin password"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </>
            )}

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Verifying...' : 'Sign in'}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="security-note">
            <ShieldCheck size={16} />
            Secure Campus Support Platform
          </div>
        </div>

        <div className="login-tagline">
          <h3>One campus. One connected support system.</h3>
          <p>Ask questions. Raise concerns. Track resolutions.</p>
        </div>
      </div>

      <footer className="login-footer">
        CAMPUSRESOLVE © 2026 · VIGNAN UNIVERSITY
      </footer>
    </main>
  );
}
