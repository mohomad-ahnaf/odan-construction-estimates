import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { WorkspaceIcon } from "./WorkspaceIcon";
export function Layout() {
  const { session, signOut } = useAuth();
  const [error, setError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    setMobileNavOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mobile = window.matchMedia("(max-width: 700px), (max-width: 950px) and (max-height: 500px) and (pointer: coarse)");
    const closeOnDesktop = () => { if (!mobile.matches) setMobileNavOpen(false); };
    mobile.addEventListener("change", closeOnDesktop);
    return () => mobile.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("nav a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [menuButtonRef.current, ...Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element): element is HTMLElement => Boolean(element && element.getClientRects().length));
      if (!controls.length) return;
      const first = controls[0]!;
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [mobileNavOpen]);
  return (
    <div className="app-shell">
      {mobileNavOpen && <button type="button" className="sidebar-backdrop" aria-label="Dismiss navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className="sidebar">
        <div className="sidebar-header">
          <a className="brand" href="/">
            <img src="/branding/odan-logo-transparent.png" alt="Odan Construction" />
          </a>
          <button ref={menuButtonRef} type="button" className="sidebar-menu-toggle" aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavOpen} aria-controls="sidebar-content" onClick={() => setMobileNavOpen((open) => !open)}>
            <WorkspaceIcon name={mobileNavOpen ? "close" : "menu"} size={22} />
          </button>
        </div>
        <div ref={drawerRef} id="sidebar-content" className={`sidebar-content${mobileNavOpen ? " is-open" : ""}`}>
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
          {session?.user?.role === "ADMIN" && <NavLink to="/site-photos">
            <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span>{" "}
            Site Photos
          </NavLink>}
          {session?.user?.role === "ADMIN" && (
            <>
              <NavLink to="/audit">
                <span className="nav-icon" aria-hidden="true">◷</span>{" "}Audit trail
              </NavLink>
            </>
          )}
          <NavLink to="/settings">
            <span className="nav-icon"><WorkspaceIcon name="settings" /></span>{" "}Settings
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{session?.user?.name.slice(0, 1)}</span>
          <strong>{session?.user?.name}</strong>
          <small>{session?.user?.role.toLowerCase()}</small>
          <button
            className="text-button"
            onClick={() => void signOut().catch((e) => setError(e.message))}
          >
            <WorkspaceIcon name="signOut" size={16} /> Sign out
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
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
