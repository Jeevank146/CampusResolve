
import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
  User,
  Mail,
  Eye,
  EyeOff,
  Globe,
  ClipboardList,
  CalendarDays,
  Building2,
  ScrollText,
  BookOpen,
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

type ForgotPasswordStep = 'request' | 'verify' | 'reset';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const staffAccounts: Record<string, string> = {
  Academics: 'ACADEMICS_STAFF',
  Examinations: 'EXAM_STAFF',
  Hostel: 'HOSTEL_STAFF',
  Transport: 'TRANSPORT_STAFF',
  Administration: 'ADMIN_STAFF',
  Other: 'OTHER_STAFF',
};

const officialLinks = [
  {
    label: <>Vignan<br />Website</>,
    icon: Globe,
    url: 'https://vignan.ac.in/',
  },
  {
    label: <>Rules &<br />Regulations</>,
    icon: ScrollText,
    url: 'https://vignan.ac.in/policies.php',
  },
  {
    label: <>Academic<br />Regulations</>,
    icon: BookOpen,
    url: 'https://www.vignan.ac.in/Regulations.php',
  },
  {
    label: <>University<br />Policies</>,
    icon: ShieldCheck,
    url: 'https://vignan.ac.in/policies.php',
  },
  {
    label: <>Exam &<br />Results</>,
    icon: ClipboardList,
    url: 'https://vignan.ac.in/exam_home.php',
  },
];

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [role, setRole] = useState<Role>('Student');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [adminId, setAdminId] = useState('');
  const [category, setCategory] = useState('Academics');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Forgot Password state (only used by Student role).
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotPasswordStep>('request');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const staffId = staffAccounts[category];

  function openForgotPassword() {
    setForgotEmail('');
    setForgotStep('request');
    setForgotOtp('');
    setResetToken('');
    setNewPassword('');
    setConfirmNewPassword('');
    setForgotError('');
    setForgotMessage('');
    setForgotOpen(true);
  }

  async function requestPasswordResetOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = forgotEmail.trim().toLowerCase();
    if (!email) {
      setForgotError('Enter your registered email address.');
      return;
    }

    setForgotLoading(true);
    setForgotError('');
    setForgotMessage('');

    try {
      const response = await fetch(`${API}/api/auth/forgot-password/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'Unable to send password reset OTP.');
      }
      setForgotEmail(email);
      setForgotStep('verify');
      setForgotMessage(data.message || 'OTP sent to your registered email address.');
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Unable to send OTP.');
    } finally {
      setForgotLoading(false);
    }
  }

  async function verifyPasswordResetOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const otp = forgotOtp.trim();
    if (!/^\d{6}$/.test(otp)) {
      setForgotError('Enter the 6-digit OTP sent to your registered email.');
      return;
    }

    setForgotLoading(true);
    setForgotError('');

    try {
      const response = await fetch(`${API}/api/auth/forgot-password/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim().toLowerCase(),
          otp,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'OTP verification failed.');
      }
      if (!data.reset_token) {
        throw new Error('The server did not return a password reset token.');
      }
      setResetToken(data.reset_token);
      setForgotStep('reset');
      setForgotMessage(data.message || 'Email verified. Create your new password.');
      setForgotError('');
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'OTP verification failed.');
    } finally {
      setForgotLoading(false);
    }
  }

  async function saveNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setForgotError('Password must contain at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setForgotError('New password and confirm password do not match.');
      return;
    }

    setForgotLoading(true);
    setForgotError('');

    try {
      const response = await fetch(`${API}/api/auth/forgot-password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim().toLowerCase(),
          reset_token: resetToken,
          new_password: newPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'Unable to update password.');
      }

      setPassword('');
      setShowPassword(false);
      setSuccessMessage(data.message || 'Password updated. Sign in using your new password.');
      setForgotOpen(false);
      setForgotOtp('');
      setResetToken('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setForgotLoading(false);
    }
  }

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
        role === 'Student'
          ? registrationNumber.trim().toUpperCase()
          : '',
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
      <div className="login-background" />
      <div className="login-background-overlay" />

      <header className="top-brand">
        <div className="top-brand-icon">
          <GraduationCap size={27} />
        </div>
        <div>
          <h2>CampusResolve</h2>
          <span>INTELLIGENT CAMPUS SUPPORT</span>
        </div>
      </header>

      <section className="login-right">
        <div className="login-heading">
          <span>WELCOME TO</span>
          <h2>CampusResolve</h2>
        </div>

        <div className="login-card">
          <div className="college-logo">
            <img
              src="/images/campus/vignan%20logo.jpg"
              alt="Vignan University"
            />
            <span>CAMPUS SUPPORT PORTAL</span>
          </div>

          <div className="login-intro">
            <h1>Sign In</h1>
            <p>Access your campus support account.</p>
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
                    setShowPassword(false);
                  }}
                >
                  {item === 'Student' && <GraduationCap size={17} />}
                  {item === 'Staff' && <User size={17} />}
                  {item === 'Admin' && <ShieldCheck size={17} />}
                  {item}
                </button>
              ))}
            </div>

            {role === 'Student' && (
              <>
                <label className="field-label" htmlFor="registration">
                  REGISTRATION NUMBER
                </label>
                <div className="input-container">
                  <User size={18} />
                  <input
                    id="registration"
                    value={registrationNumber}
                    onChange={(e) =>
                      setRegistrationNumber(e.target.value.toUpperCase())
                    }
                    placeholder="Enter registration number"
                    autoComplete="username"
                    required
                  />
                </div>

                <label className="field-label" htmlFor="student-password">
                  CONFIRM REGISTRATION NUMBER
                </label>
                <div className="input-container">
                  <LockKeyhole size={18} />
                  <input
                    id="student-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter the same registration number"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <div className="forgot-password-row">
                  <button
                    type="button"
                    className="forgot-password-link"
                    onClick={openForgotPassword}
                  >
                    Forgot Password?
                  </button>
                </div>
              </>
            )}

            {role === 'Staff' && (
              <>
                <label className="field-label" htmlFor="staff-category">
                  SELECT DEPARTMENT
                </label>
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

                <label className="field-label" htmlFor="staff-id">
                  STAFF ID
                </label>
                <div className="input-container">
                  <User size={18} />
                  <input id="staff-id" value={staffId} readOnly />
                </div>

                <label className="field-label" htmlFor="staff-password">
                  PASSWORD
                </label>
                <div className="input-container">
                  <LockKeyhole size={18} />
                  <input
                    id="staff-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter department password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </>
            )}

            {role === 'Admin' && (
              <>
                <label className="field-label" htmlFor="admin-id">
                  ADMIN ID
                </label>
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

                <label className="field-label" htmlFor="admin-password">
                  PASSWORD
                </label>
                <div className="input-container">
                  <LockKeyhole size={18} />
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter Admin password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </>
            )}

            {successMessage && (
              <div className="login-success-message">{successMessage}</div>
            )}
            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Verifying...' : 'SIGN IN'}
              {!loading && <ArrowRight size={19} />}
            </button>
          </form>

          <div className="security-note">
            <ShieldCheck size={17} />
            <span>Secure Campus Support Platform</span>
          </div>

          <footer className="card-footer">
            © 2026 VFSTR — CampusResolve
          </footer>
        </div>
      </section>

      <nav className="official-links-panel" aria-label="Vignan official links">
        {officialLinks.map((item, index) => {
          const Icon = item.icon;

          return (
            <a
              key={index}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="official-link"
            >
              <div className="official-link-icon">
                <Icon size={23} />
              </div>
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      {forgotOpen && (
        <div
          className="forgot-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !forgotLoading) {
              setForgotOpen(false);
            }
          }}
        >
          <section
            className="forgot-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-modal-title"
          >
            <button
              type="button"
              className="forgot-modal-close"
              onClick={() => setForgotOpen(false)}
              disabled={forgotLoading}
              aria-label="Close forgot password"
            >
              ×
            </button>

            <div className="forgot-modal-eyebrow">CAMPUSRESOLVE ACCOUNT SECURITY</div>
            <h2 id="forgot-modal-title">
              {forgotStep === 'request'
                ? 'Forgot Password?'
                : forgotStep === 'verify'
                  ? 'Verify Your Email'
                  : 'Set New Password'}
            </h2>
            <p className="forgot-modal-description">
              {forgotStep === 'request'
                ? 'Enter the email address you previously verified during a grievance submission. We will send an OTP to this email address.'
                : forgotStep === 'verify'
                  ? 'Enter the 6-digit OTP sent to your registered email address.'
                  : 'Your email is verified. Create a new password for your student account.'}
            </p>

            {forgotMessage && (
              <div className="forgot-modal-message">{forgotMessage}</div>
            )}
            {forgotError && (
              <div className="forgot-modal-error">{forgotError}</div>
            )}

            {forgotStep === 'request' && (
              <form onSubmit={requestPasswordResetOtp}>
                <label className="field-label" htmlFor="forgot-email">
                  REGISTERED EMAIL ADDRESS
                </label>
                <div className="input-container">
                  <Mail size={18} />
                  <input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(event) => setForgotEmail(event.target.value)}
                    placeholder="Enter your verified email address"
                    autoComplete="email"
                    maxLength={320}
                    required
                  />
                </div>
                <button className="login-button forgot-modal-submit" type="submit" disabled={forgotLoading}>
                  {forgotLoading ? 'Sending OTP…' : 'Send OTP'}
                </button>
              </form>
            )}

            {forgotStep === 'verify' && (
              <form onSubmit={verifyPasswordResetOtp}>
                <label className="field-label" htmlFor="forgot-otp">
                  6-DIGIT OTP
                </label>
                <div className="input-container">
                  <ShieldCheck size={18} />
                  <input
                    id="forgot-otp"
                    value={forgotOtp}
                    onChange={(event) => setForgotOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter OTP"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                  />
                </div>
                <button className="login-button forgot-modal-submit" type="submit" disabled={forgotLoading}>
                  {forgotLoading ? 'Verifying…' : 'Verify OTP'}
                </button>
              </form>
            )}

            {forgotStep === 'reset' && (
              <form onSubmit={saveNewPassword}>
                <label className="field-label" htmlFor="forgot-new-password">
                  NEW PASSWORD
                </label>
                <div className="input-container">
                  <LockKeyhole size={18} />
                  <input
                    id="forgot-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </div>
                <label className="field-label" htmlFor="forgot-confirm-password">
                  CONFIRM NEW PASSWORD
                </label>
                <div className="input-container">
                  <LockKeyhole size={18} />
                  <input
                    id="forgot-confirm-password"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(event) => setConfirmNewPassword(event.target.value)}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </div>
                <button className="login-button forgot-modal-submit" type="submit" disabled={forgotLoading}>
                  {forgotLoading ? 'Updating Password…' : 'Update Password'}
                </button>
              </form>
            )}

            <button
              type="button"
              className="forgot-modal-cancel"
              onClick={() => setForgotOpen(false)}
              disabled={forgotLoading}
            >
              Cancel
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
