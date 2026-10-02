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
          <img
            src="/branding/odan-logo-transparent.png"
            alt="Odan Construction"
          />
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            <span className="nav-icon" aria-hidden="true">
              ▦
            </span>{" "}
            Dashboard
          </NavLink>
          <NavLink to="/clients">
            <span className="nav-icon" aria-hidden="true">
              ◫
            </span>{" "}
            Clients
          </NavLink>
          <NavLink to="/projects">
            <span className="nav-icon" aria-hidden="true">
              ▥
            </span>{" "}
            Projects
          </NavLink>
          <NavLink to="/estimates">
            <span className="nav-icon" aria-hidden="true">
              ▤
            </span>{" "}
            Estimates
          </NavLink>
          <NavLink to="/unit-converter">
            <span className="nav-icon" aria-hidden="true">⇄</span>{" "}
            Unit Converter
          </NavLink>
          {session?.user?.role === "ADMIN" && (
            <>
              <NavLink to="/audit">
                <span className="nav-icon" aria-hidden="true">◷</span>{" "}Audit trail
              </NavLink>
              <NavLink to="/settings/pdf-template">
                <span className="nav-icon" aria-hidden="true">⚙</span>{" "}Settings
              </NavLink>
            </>
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
