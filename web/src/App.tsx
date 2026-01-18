import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Auth from './components/Auth';
import Notes from './components/Notes';
import Diary from './components/Diary';
import Journals from './components/Journals';
import { isAuthenticated, clearAuthState, getUsername } from './lib/auth';
import './App.css';

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const username = getUsername();

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout? Your session will be cleared.')) {
      clearAuthState();
      window.location.href = '/';
    }
  };

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
            to="/diary" 
            className={`nav-link ${location.pathname === '/diary' ? 'active' : ''}`}
          >
            📖 Diary
          </Link>
          <Link 
            to="/journals" 
            className={`nav-link ${location.pathname === '/journals' ? 'active' : ''}`}
          >
            📔 Journals
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
          path="/diary"
          element={
            <ProtectedRoute>
              <Diary />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/journals"
          element={
            <ProtectedRoute>
              <Journals />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
