import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth";
export function Layout() {
  const { session, signOut } = useAuth();
  const [error, setError] = useState("");
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">O</span>
          <span>
            ODAN<small>CONSTRUCTION</small>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <NavLink to="/" end>
            ◇ &nbsp; Dashboard
          </NavLink>
          <NavLink to="/clients">◎ &nbsp; Clients</NavLink>
          <NavLink to="/estimates">▦ &nbsp; Estimates</NavLink>
          {session?.user?.role === "ADMIN" && (
            <NavLink to="/audit">◷ &nbsp; Audit trail</NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{session?.user?.name.slice(0, 1)}</span>
          <strong>{session?.user?.name}</strong>
          <small>{session?.user?.role.toLowerCase()}</small>
          <NavLink to="/account/password">Change password</NavLink>
          <button
            className="text-button"
            onClick={() => void signOut().catch((e) => setError(e.message))}
          >
            Sign out →
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>Estimate management</span>
          <span className="workspace-tag">ODAN WORKSPACE</span>
        </header>
        <div className="content">
          <Outlet />
        </div>
        <footer className="app-footer">
          Odan Construction <span>Built on clear numbers.</span>
        </footer>
      </main>
    </div>
  );
}
