import { Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Estimates } from "./pages/Estimates";
import { EstimateEditor } from "./pages/EstimateEditor";
import { EstimateDetail } from "./pages/EstimateDetail";
import { Audit } from "./pages/Audit";
import { ChangePassword } from "./pages/ChangePassword";
import { Dashboard } from "./pages/Dashboard";
import { Clients } from "./pages/Clients";
import { ClientEditor } from "./pages/ClientEditor";
import { ClientDetail } from "./pages/ClientDetail";
import { ProjectEditor } from "./pages/ProjectEditor";
import { ProjectDetail } from "./pages/ProjectDetail";
export function App() {
  const { session, loading, error, refresh } = useAuth();
  if (loading)
    return <div className="loading-screen">Opening your workspace…</div>;
  if (error)
    return (
      <div className="loading-screen">
        <h1>Workspace unavailable</h1>
        <p>
          The API could not be reached. Check the dedicated server and database.
        </p>
        <button onClick={refresh}>Try again</button>
      </div>
    );
  if (!session?.user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/estimates" element={<Estimates />} />
        {session.user.role !== "VIEWER" && (
          <>
            <Route path="/estimates/new" element={<EstimateEditor />} />
            <Route path="/estimates/:id/edit" element={<EstimateEditor />} />
            <Route path="/clients/new" element={<ClientEditor />} />
            <Route path="/clients/:id/edit" element={<ClientEditor />} />
            <Route
              path="/clients/:clientId/projects/new"
              element={<ProjectEditor />}
            />
            <Route path="/projects/:id/edit" element={<ProjectEditor />} />
          </>
        )}
        <Route path="/estimates/:id" element={<EstimateDetail />} />
        <Route path="/account/password" element={<ChangePassword />} />
        {session.user.role === "ADMIN" && (
          <Route path="/audit" element={<Audit />} />
        )}
        <Route
          path="*"
          element={
            <p>
              Page not found. <a href="/estimates">Return to estimates</a>
            </p>
          }
        />
      </Route>
    </Routes>
  );
}
