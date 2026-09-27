import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Estimates } from "./pages/Estimates";
import { EstimateEditor } from "./pages/EstimateEditor";
import { EstimateDetail } from "./pages/EstimateDetail";
import { Audit } from "./pages/Audit";
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
        <Route path="/" element={<Navigate to="/estimates" replace />} />
        <Route path="/estimates" element={<Estimates />} />
        {session.user.role !== "VIEWER" && (
          <>
            <Route path="/estimates/new" element={<EstimateEditor />} />
            <Route path="/estimates/:id/edit" element={<EstimateEditor />} />
          </>
        )}
        <Route path="/estimates/:id" element={<EstimateDetail />} />
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
