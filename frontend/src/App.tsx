import { useState } from 'react';
import LoginPage from './components/LoginPage';
import StudentDashboard from './student/studentDashboard';
import StaffDashboard from './staff/StaffDashboard';
import AdminDashboard from './admin/AdminDashboard';

type UserRole = 'Student' | 'Staff' | 'Admin';

export default function App() {
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [staffCategory, setStaffCategory] = useState('');

  function handleLogin(
    role: UserRole,
    registrationNumberValue: string,
    token?: string,
    category?: string,
  ) {
    setCurrentRole(role);
    setRegistrationNumber(registrationNumberValue || '');
    setAccessToken(token || '');
    setStaffCategory(category || '');
  }

  function handleLogout() {
    setCurrentRole(null);
    setAccessToken('');
    setRegistrationNumber('');
    setStaffCategory('');
  }

  if (!currentRole) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (currentRole === 'Student') {
    return (
      <StudentDashboard
        accessToken={accessToken}
        registrationNumber={registrationNumber}
        onLogout={handleLogout}
      />
    );
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

  return (
    <AdminDashboard
      onLogout={handleLogout}
      accessToken={accessToken}
    />
  );
}
