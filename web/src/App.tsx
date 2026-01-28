import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import Auth from './components/Auth';
import Notes from './components/Notes';
import Lists from './components/Lists';
import Journal from './components/Journal';
import Boards from './components/Boards';
import { isAuthenticated, clearAuthState, getUsername } from './lib/auth';
import { onSessionExpired } from './lib/api';
import { startSessionMonitoring, stopSessionMonitoring } from './lib/sessionManager';
import './App.css';

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const username = getUsername();

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout? Your session will be cleared.')) {
      stopSessionMonitoring();
      clearAuthState();
      window.location.href = '/';
    }
  };

  // Handle session expiration - redirect to login
  useEffect(() => {
    const handleExpired = () => {
      alert('Your session has expired. Please login again.');
      navigate('/', { replace: true });
    };

    // Register callback for API-detected session expiration
    onSessionExpired(handleExpired);

    // Start monitoring session
    startSessionMonitoring(handleExpired);

    return () => {
      stopSessionMonitoring();
    };
  }, [navigate]);

  return (
    <div className="app-layout">
      <nav className="app-nav">
        <div className="nav-brand">
          <span className="nav-logo">🔐</span>
          <span className="nav-title">cryptd</span>
        </div>
        
        <div className="nav-links">
          <Link 
            to="/notes" 
            className={`nav-link ${location.pathname === '/notes' ? 'active' : ''}`}
          >
            📝 Notes
          </Link>
          <Link 
            to="/lists" 
            className={`nav-link ${location.pathname === '/lists' ? 'active' : ''}`}
          >
            ✅ Lists
          </Link>
          <Link 
            to="/journal" 
            className={`nav-link ${location.pathname === '/journal' ? 'active' : ''}`}
          >
            📔 Journal
          </Link>
          <Link 
            to="/boards" 
            className={`nav-link ${location.pathname === '/boards' ? 'active' : ''}`}
          >
            📋 Boards
          </Link>
        </div>

        <div className="nav-user">
          <span className="username">{username}</span>
          <button onClick={handleLogout} className="btn-logout">
            Logout
          </button>
        </div>
      </nav>

      <main className="app-main">
        {children}
      </main>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return <Layout>{children}</Layout>;
}

function App() {
  const [authenticated, setAuthenticated] = useState(() => isAuthenticated());

  const handleAuthenticated = () => {
    setAuthenticated(true);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={
            authenticated ? (
              <Navigate to="/notes" replace />
            ) : (
              <Auth onAuthenticated={handleAuthenticated} />
            )
          } 
        />
        
        <Route
          path="/notes"
          element={
            <ProtectedRoute>
              <Notes />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/lists"
          element={
            <ProtectedRoute>
              <Lists />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/journal"
          element={
            <ProtectedRoute>
              <Journal />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/boards"
          element={
            <ProtectedRoute>
              <Boards />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
