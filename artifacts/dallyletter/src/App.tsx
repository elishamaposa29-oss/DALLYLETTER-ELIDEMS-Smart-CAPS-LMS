import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { InstallBanner } from "@/components/InstallBanner";
import NotFound from "@/pages/not-found";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Suspended from "@/pages/Suspended";

import StudentHome from "@/pages/student/StudentHome";
import StudentLessons from "@/pages/student/StudentLessons";
import StudentClasses from "@/pages/student/StudentClasses";
import StudentStudyGroups from "@/pages/student/StudentStudyGroups";
import StudentPayments from "@/pages/student/StudentPayments";
import StudentNotifications from "@/pages/student/StudentNotifications";
import StudentChat from "@/pages/student/StudentChat";
import StudentPolls from "@/pages/student/StudentPolls";
import StudentBreakElidems from "@/pages/student/StudentBreakElidems";

import TeacherHome from "@/pages/teacher/TeacherHome";
import TeacherLessons from "@/pages/teacher/TeacherLessons";
import TeacherClasses from "@/pages/teacher/TeacherClasses";
import TeacherChat from "@/pages/teacher/TeacherChat";
import TeacherPayments from "@/pages/teacher/TeacherPayments";
import TeacherPolls from "@/pages/teacher/TeacherPolls";

import AdminHome from "@/pages/admin/AdminHome";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminLessons from "@/pages/admin/AdminLessons";
import AdminClasses from "@/pages/admin/AdminClasses";
import AdminPayments from "@/pages/admin/AdminPayments";
import AdminChat from "@/pages/admin/AdminChat";
import AdminNotifications from "@/pages/admin/AdminNotifications";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminAI from "@/pages/admin/AdminAI";
import AdminAISettings from "@/pages/admin/AdminAISettings";
import AdminPolls from "@/pages/admin/AdminPolls";
import AdminBreakElidems from "@/pages/admin/AdminBreakElidems";
import AdminSafety from "@/pages/admin/AdminSafety";
import AdminAuditLogs from "@/pages/admin/AdminAuditLogs";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/suspended" component={Suspended} />

      {/* Student Routes */}
      <Route path="/student/lessons">
        <ProtectedRoute allowedRoles={["student"]}><StudentLessons /></ProtectedRoute>
      </Route>
      <Route path="/student/classes">
        <ProtectedRoute allowedRoles={["student"]}><StudentClasses /></ProtectedRoute>
      </Route>
      <Route path="/student/study-groups">
        <ProtectedRoute allowedRoles={["student"]}><StudentStudyGroups /></ProtectedRoute>
      </Route>
      <Route path="/student/payments">
        <ProtectedRoute allowedRoles={["student"]}><StudentPayments /></ProtectedRoute>
      </Route>
      <Route path="/student/notifications">
        <ProtectedRoute allowedRoles={["student"]}><StudentNotifications /></ProtectedRoute>
      </Route>
      <Route path="/student/chat">
        <ProtectedRoute allowedRoles={["student"]}><StudentChat /></ProtectedRoute>
      </Route>
      <Route path="/student/polls">
        <ProtectedRoute allowedRoles={["student"]}><StudentPolls /></ProtectedRoute>
      </Route>
      <Route path="/student/break-elidems">
        <ProtectedRoute allowedRoles={["student"]}><StudentBreakElidems /></ProtectedRoute>
      </Route>
      <Route path="/">
        <ProtectedRoute allowedRoles={["student"]}><StudentHome /></ProtectedRoute>
      </Route>

      {/* Teacher Routes */}
      <Route path="/teacher/lessons">
        <ProtectedRoute allowedRoles={["teacher"]}><TeacherLessons /></ProtectedRoute>
      </Route>
      <Route path="/teacher/classes">
        <ProtectedRoute allowedRoles={["teacher"]}><TeacherClasses /></ProtectedRoute>
      </Route>
      <Route path="/teacher/chat">
        <ProtectedRoute allowedRoles={["teacher"]}><TeacherChat /></ProtectedRoute>
      </Route>
      <Route path="/teacher/payments">
        <ProtectedRoute allowedRoles={["teacher"]}><TeacherPayments /></ProtectedRoute>
      </Route>
      <Route path="/teacher/polls">
        <ProtectedRoute allowedRoles={["teacher"]}><TeacherPolls /></ProtectedRoute>
      </Route>
      <Route path="/teacher">
        <ProtectedRoute allowedRoles={["teacher"]}><TeacherHome /></ProtectedRoute>
      </Route>

      {/* Admin Routes */}
      <Route path="/admin/users">
        <ProtectedRoute allowedRoles={["owner"]}><AdminUsers /></ProtectedRoute>
      </Route>
      <Route path="/admin/lessons">
        <ProtectedRoute allowedRoles={["owner"]}><AdminLessons /></ProtectedRoute>
      </Route>
      <Route path="/admin/classes">
        <ProtectedRoute allowedRoles={["owner"]}><AdminClasses /></ProtectedRoute>
      </Route>
      <Route path="/admin/payments">
        <ProtectedRoute allowedRoles={["owner"]}><AdminPayments /></ProtectedRoute>
      </Route>
      <Route path="/admin/chat">
        <ProtectedRoute allowedRoles={["owner"]}><AdminChat /></ProtectedRoute>
      </Route>
      <Route path="/admin/notifications">
        <ProtectedRoute allowedRoles={["owner"]}><AdminNotifications /></ProtectedRoute>
      </Route>
      <Route path="/admin/settings">
        <ProtectedRoute allowedRoles={["owner"]}><AdminSettings /></ProtectedRoute>
      </Route>
      <Route path="/admin/ai/settings">
        <ProtectedRoute allowedRoles={["owner"]}><AdminAISettings /></ProtectedRoute>
      </Route>
      <Route path="/admin/ai">
        <ProtectedRoute allowedRoles={["owner"]}><AdminAI /></ProtectedRoute>
      </Route>
      <Route path="/admin/polls">
        <ProtectedRoute allowedRoles={["owner"]}><AdminPolls /></ProtectedRoute>
      </Route>
      <Route path="/admin/break-elidems">
        <ProtectedRoute allowedRoles={["owner"]}><AdminBreakElidems /></ProtectedRoute>
      </Route>
      <Route path="/admin/safety">
        <ProtectedRoute allowedRoles={["owner"]}><AdminSafety /></ProtectedRoute>
      </Route>
      <Route path="/admin/audit-logs">
        <ProtectedRoute allowedRoles={["owner"]}><AdminAuditLogs /></ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute allowedRoles={["owner"]}><AdminHome /></ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <TooltipProvider>
            <Router />
            <Toaster />
            <InstallBanner />
          </TooltipProvider>
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
