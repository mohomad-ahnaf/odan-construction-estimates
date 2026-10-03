import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { WorkspaceIcon } from "../components/WorkspaceIcon";
import { ChangePassword } from "./ChangePassword";
import { PdfTemplateSettings } from "./PdfTemplateSettings";

type Section = "account" | "pdf";

export function Settings() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const isAdmin = session?.user?.role === "ADMIN";
  const selected: Section = params.get("section") === "pdf" && isAdmin ? "pdf" : "account";
  const sections: Section[] = isAdmin ? ["account", "pdf"] : ["account"];
  const select = (section: Section) => setParams({ section });
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, section: Section) => {
    const index = sections.indexOf(section);
    const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? sections[(index + 1) % sections.length] :
      event.key === "ArrowLeft" || event.key === "ArrowUp" ? sections[(index - 1 + sections.length) % sections.length] :
        event.key === "Home" ? sections[0] : event.key === "End" ? sections.at(-1) : null;
    if (!next) return;
    event.preventDefault();
    select(next);
    document.getElementById(`settings-tab-${next}`)?.focus();
  };

  return <div className="settings-page">
    <header className="page-heading settings-heading"><div><span className="eyebrow">WORKSPACE PREFERENCES</span>
      <h1>Settings</h1><p className="muted">Manage your account security and construction documents.</p></div></header>
    <div className="settings-layout">
      <div className="settings-sections" role="tablist" aria-label="Settings sections">
        <button type="button" role="tab" id="settings-tab-account" aria-selected={selected === "account"}
          aria-controls="settings-panel-account" tabIndex={selected === "account" ? 0 : -1}
          onClick={() => select("account")} onKeyDown={(event) => onTabKey(event, "account")}>
          <WorkspaceIcon name="security" /> <span>Account &amp; Security</span>
        </button>
        {isAdmin && <button type="button" role="tab" id="settings-tab-pdf" aria-selected={selected === "pdf"}
          aria-controls="settings-panel-pdf" tabIndex={selected === "pdf" ? 0 : -1}
          onClick={() => select("pdf")} onKeyDown={(event) => onTabKey(event, "pdf")}>
          <WorkspaceIcon name="documents" /> <span>PDF &amp; Documents</span>
        </button>}
      </div>
      <section className="settings-panel" role="tabpanel" id="settings-panel-account" hidden={selected !== "account"}
        aria-labelledby="settings-tab-account" tabIndex={0}>
        <div className="settings-panel-heading"><WorkspaceIcon name="security" size={22} /><div><h2>Account &amp; Security</h2>
          <p>Update the password for your signed-in account.</p></div></div>
        <div className="settings-profile"><div><span>Signed in as</span><strong>{session?.user?.name}</strong></div>
          <div><span>Role</span><strong>{session?.user?.role.toLowerCase()}</strong></div></div>
        <ChangePassword embedded />
      </section>
      {isAdmin && <section className="settings-panel settings-panel-pdf" role="tabpanel" id="settings-panel-pdf"
        hidden={selected !== "pdf"} aria-labelledby="settings-tab-pdf" tabIndex={0}>
        <div className="settings-panel-heading"><WorkspaceIcon name="documents" size={22} /><div><h2>PDF &amp; Documents</h2>
          <p>Control estimate PDF branding, layout, and previews.</p></div></div>
        {selected === "pdf" && <PdfTemplateSettings embedded />}
      </section>}
    </div>
  </div>;
}
