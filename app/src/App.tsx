import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import HomeScreen from "./screens/Home";
import NewTaskScreen from "./screens/NewTask";
import TaskDetailScreen from "./screens/TaskDetail";
import ApprovalScreen from "./screens/Approval";
import SettingsScreen from "./screens/Settings";
import LoginScreen from "./screens/Login";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route
          path="/"
          element={
            <AuthGuard>
              <HomeScreen />
            </AuthGuard>
          }
        />
        <Route
          path="/new"
          element={
            <AuthGuard>
              <NewTaskScreen />
            </AuthGuard>
          }
        />
        <Route
          path="/tasks/:id"
          element={
            <AuthGuard>
              <TaskDetailScreen />
            </AuthGuard>
          }
        />
        <Route
          path="/tasks/:taskId/approval"
          element={
            <AuthGuard>
              <ApprovalScreen />
            </AuthGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGuard>
              <SettingsScreen />
            </AuthGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
