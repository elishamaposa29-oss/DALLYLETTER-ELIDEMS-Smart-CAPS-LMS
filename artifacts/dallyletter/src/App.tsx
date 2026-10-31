import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SystemNotificationBridge } from "@/components/SystemNotificationBridge";
import { DailyAttendanceTracker } from "@/components/DailyAttendanceTracker";
const NotFound = lazy(() => import("@/pages/not-found"));
const ResourceUnavailable = lazy(() => import("@/pages/ResourceUnavailable"));
const SharedMedia = lazy(() => import("@/pages/SharedMedia"));
const Docs = lazy(() => import("@/pages/Docs"));
const LessonPreview = lazy(() => import("@/pages/LessonPreview"));
const TeacherQualifications = lazy(() => import("@/pages/TeacherQualifications"));
const ProfileHub = lazy(() => import("@/pages/ProfileHub"));
const Login = lazy(() => import("@/pages/Login"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const TransferVerification = lazy(() => import("@/pages/TransferVerification"));
const Register = lazy(() => import("@/pages/Register"));
const Suspended = lazy(() => import("@/pages/Suspended"));
const StudentHome = lazy(() => import("@/pages/student/StudentHome"));
const StudentLessons = lazy(() => import("@/pages/student/StudentLessons"));
const StudentExercise = lazy(() => import("@/pages/student/StudentExercise"));
const StudentExercises = lazy(() => import("@/pages/student/StudentExercises"));
const StudentClasses = lazy(() => import("@/pages/student/StudentClasses"));
const StudentStudyGroups = lazy(() => import("@/pages/student/StudentStudyGroups"));
const StudentPayments = lazy(() => import("@/pages/student/StudentPayments"));
const StudentNotifications = lazy(() => import("@/pages/student/StudentNotifications"));
const StudentChat = lazy(() => import("@/pages/student/StudentChat"));
const StudentPolls = lazy(() => import("@/pages/student/StudentPolls"));
const StudentBreakElidems = lazy(() => import("@/pages/student/StudentBreakElidems"));
const StudentAssignments = lazy(() => import("@/pages/student/StudentAssignments"));
const StudentAchievements = lazy(() => import("@/pages/student/StudentAchievements"));
const StudentReportAlert = lazy(() => import("@/pages/student/StudentReportAlert"));
const PrefectPanel = lazy(() => import("@/pages/student/PrefectPanel"));
const TeacherHome = lazy(() => import("@/pages/teacher/TeacherHome"));
const TeacherLessons = lazy(() => import("@/pages/teacher/TeacherLessons"));
const ExerciseMarking = lazy(() => import("@/pages/teacher/ExerciseMarking"));
const TeacherClasses = lazy(() => import("@/pages/teacher/TeacherClasses"));
const TeacherChat = lazy(() => import("@/pages/teacher/TeacherChat"));
const TeacherPayments = lazy(() => import("@/pages/teacher/TeacherPayments"));
const TeacherPolls = lazy(() => import("@/pages/teacher/TeacherPolls"));
const TeacherAssignments = lazy(() => import("@/pages/teacher/TeacherAssignments"));
const AdminHome = lazy(() => import("@/pages/admin/AdminHome"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminLessons = lazy(() => import("@/pages/admin/AdminLessons"));
const AdminClasses = lazy(() => import("@/pages/admin/AdminClasses"));
const AdminPayments = lazy(() => import("@/pages/admin/AdminPayments"));
const AdminChat = lazy(() => import("@/pages/admin/AdminChat"));
const AdminNotifications = lazy(() => import("@/pages/admin/AdminNotifications"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminAI = lazy(() => import("@/pages/admin/AdminAI"));
const AdminAISettings = lazy(() => import("@/pages/admin/AdminAISettings"));
const AdminPolls = lazy(() => import("@/pages/admin/AdminPolls"));
const AdminBreakElidems = lazy(() => import("@/pages/admin/AdminBreakElidems"));
const AdminSafety = lazy(() => import("@/pages/admin/AdminSafety"));
const AdminAuditLogs = lazy(() => import("@/pages/admin/AdminAuditLogs"));
const AdminFinancial = lazy(() => import("@/pages/admin/AdminFinancial"));
const AdminStaffPayments = lazy(() => import("@/pages/admin/AdminStaffPayments"));
const AdminOwnerAlerts = lazy(() => import("@/pages/admin/AdminOwnerAlerts"));
const AdminAssignments = lazy(() => import("@/pages/admin/AdminAssignments"));
const AdminAchievements = lazy(() => import("@/pages/admin/AdminAchievements"));
const OwnerCommandCenter = lazy(() => import("@/pages/admin/OwnerCommandCenter"));
const ManagerHome = lazy(() => import("@/pages/manager/ManagerHome"));
const ManagerTeachers = lazy(() => import("@/pages/manager/ManagerTeachers"));
const ManagerStudents = lazy(() => import("@/pages/manager/ManagerStudents"));
const ManagerReports = lazy(() => import("@/pages/manager/ManagerReports"));
const ManagerPrefects = lazy(() => import("@/pages/manager/ManagerPrefects"));
const ManagerTransferRequests = lazy(() => import("@/pages/manager/ManagerTransferRequests"));
const ManagerReportReview = lazy(() => import("@/pages/manager/ManagerReportReview"));
const ManagerReviewQueue = lazy(() => import("@/pages/manager/ManagerReviewQueue"));
const FeatureCenter = lazy(() => import("@/pages/FeatureCenter"));

const fallbackApiBaseUrl = typeof window !== "undefined" && window.location.hostname === "localhost" ? "http://localhost:4000" : "https://dallyletter-elidems-smart-caps-lms-4.onrender.com";
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || import.meta.env.API_BASE_URL?.trim() || fallbackApiBaseUrl;
if (apiBaseUrl) setBaseUrl(apiBaseUrl);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000, gcTime: 10 * 60_000 } } });

function Router() { return <Suspense fallback={<div role="status" aria-live="polite" className="min-h-screen flex items-center justify-center bg-[#0A1931] text-[#FFF8E1]">Loading Dallyletter Elidems…</div>}><Switch>
  <Route path="/profile-hub"><ProtectedRoute allowedRoles={["student","prefect","teacher","owner","admin","platform_owner","manager","senior_manager"]}><ProfileHub /></ProtectedRoute></Route><Route path="/profile/:id"><ProtectedRoute allowedRoles={["student","prefect","teacher","owner","admin","platform_owner","manager","senior_manager"]}><ProfileHub /></ProtectedRoute></Route><Route path="/login" component={Login} /><Route path="/forgot-password" component={ForgotPassword} /><Route path="/reset-password" component={ResetPassword} /><Route path="/verify/transfer/:token" component={TransferVerification} /><Route path="/verify-email" component={VerifyEmail} /><Route path="/confirm-email-change" component={VerifyEmail} /><Route path="/features"><ProtectedRoute allowedRoles={["student","prefect","teacher","owner","admin","platform_owner","manager","senior_manager"]}><FeatureCenter /></ProtectedRoute></Route><Route path="/register" component={Register} /><Route path="/resource-unavailable" component={ResourceUnavailable} /><Route path="/docs" component={Docs} /><Route path="/preview/lesson/:id"><ProtectedRoute allowedRoles={["student","prefect","teacher","owner"]}><LessonPreview /></ProtectedRoute></Route><Route path="/teacher/qualifications"><ProtectedRoute allowedRoles={["teacher"]}><TeacherQualifications /></ProtectedRoute></Route><Route path="/suspended" component={Suspended} />
  <Route path="/shared-media" component={SharedMedia} /><Route path="/student/lessons"><ProtectedRoute allowedRoles={["student","prefect","teacher","owner"]}><StudentLessons /></ProtectedRoute></Route><Route path="/student/exercises"><ProtectedRoute allowedRoles={["student","prefect"]}><StudentExercises /></ProtectedRoute></Route><Route path="/student/exercises/:id"><ProtectedRoute allowedRoles={["student","prefect"]}><StudentExercise /></ProtectedRoute></Route><Route path="/student/classes"><ProtectedRoute allowedRoles={["student","prefect"]}><StudentClasses /></ProtectedRoute></Route><Route path="/student/study-groups"><ProtectedRoute allowedRoles={["student","prefect","teacher","owner"]}><StudentStudyGroups /></ProtectedRoute></Route><Route path="/student/payments"><ProtectedRoute allowedRoles={["student","prefect"]}><StudentPayments /></ProtectedRoute></Route><Route path="/student/notifications"><ProtectedRoute allowedRoles={["student","prefect"]}><StudentNotifications /></ProtectedRoute></Route><Route path="/student/chat"><ProtectedRoute allowedRoles={["student","prefect"]}><StudentChat /></ProtectedRoute></Route><Route path="/student/polls"><ProtectedRoute allowedRoles={["student","prefect","teacher","owner"]}><StudentPolls /></ProtectedRoute></Route><Route path="/student/break-elidems"><ProtectedRoute allowedRoles={["student","prefect"]}><StudentBreakElidems /></ProtectedRoute></Route><Route path="/student/assignments"><ProtectedRoute allowedRoles={["student","prefect","teacher","owner"]}><StudentAssignments /></ProtectedRoute></Route><Route path="/student/achievements"><ProtectedRoute allowedRoles={["student","prefect"]}><StudentAchievements /></ProtectedRoute></Route><Route path="/student/report"><ProtectedRoute allowedRoles={["student","prefect"]}><StudentReportAlert /></ProtectedRoute></Route><Route path="/student/prefect"><ProtectedRoute allowedRoles={["student","prefect"]}><PrefectPanel /></ProtectedRoute></Route><Route path="/"><ProtectedRoute allowedRoles={["student","prefect"]}><StudentHome /></ProtectedRoute></Route>
  <Route path="/teacher/lessons"><ProtectedRoute allowedRoles={["teacher"]}><TeacherLessons /></ProtectedRoute></Route><Route path="/teacher/exercises/:id/mark"><ProtectedRoute allowedRoles={["teacher","owner","admin"]}><ExerciseMarking /></ProtectedRoute></Route><Route path="/teacher/classes"><ProtectedRoute allowedRoles={["teacher"]}><TeacherClasses /></ProtectedRoute></Route><Route path="/teacher/chat"><ProtectedRoute allowedRoles={["teacher"]}><TeacherChat /></ProtectedRoute></Route><Route path="/teacher/payments"><ProtectedRoute allowedRoles={["teacher"]}><TeacherPayments /></ProtectedRoute></Route><Route path="/teacher/polls"><ProtectedRoute allowedRoles={["teacher"]}><TeacherPolls /></ProtectedRoute></Route><Route path="/teacher/assignments"><ProtectedRoute allowedRoles={["teacher"]}><TeacherAssignments /></ProtectedRoute></Route><Route path="/teacher"><ProtectedRoute allowedRoles={["teacher"]}><TeacherHome /></ProtectedRoute></Route>
  <Route path="/manager/teachers"><ProtectedRoute allowedRoles={["owner","manager","senior_manager"]} allowManagerStaff><ManagerTeachers /></ProtectedRoute></Route><Route path="/manager/students"><ProtectedRoute allowedRoles={["owner","manager","senior_manager"]} allowManagerStaff><ManagerStudents /></ProtectedRoute></Route><Route path="/manager/reports"><ProtectedRoute allowedRoles={["owner","manager","senior_manager"]} allowManagerStaff><ManagerReports /></ProtectedRoute></Route><Route path="/manager/notifications"><ProtectedRoute allowedRoles={["owner","manager","senior_manager"]} allowManagerStaff><AdminNotifications /></ProtectedRoute></Route><Route path="/manager/chat"><ProtectedRoute allowedRoles={["owner","manager","senior_manager"]} allowManagerStaff><TeacherChat /></ProtectedRoute></Route><Route path="/manager/assignments"><ProtectedRoute allowedRoles={["owner","manager","senior_manager"]} allowManagerStaff><AdminAssignments /></ProtectedRoute></Route><Route path="/manager/prefects"><ProtectedRoute allowedRoles={["owner","manager","senior_manager"]} allowManagerStaff><ManagerPrefects /></ProtectedRoute></Route><Route path="/manager/transfer-requests"><ProtectedRoute allowedRoles={["owner","manager","senior_manager"]} allowManagerStaff><ManagerTransferRequests /></ProtectedRoute></Route><Route path="/manager/reports/review"><ProtectedRoute allowedRoles={["owner","manager","senior_manager"]} allowManagerStaff><ManagerReportReview /></ProtectedRoute></Route><Route path="/manager/review-queue"><ProtectedRoute allowedRoles={["owner","manager","senior_manager"]} allowManagerStaff><ManagerReviewQueue /></ProtectedRoute></Route><Route path="/manager/safety"><ProtectedRoute allowedRoles={["owner","manager","senior_manager"]} allowManagerStaff><AdminSafety /></ProtectedRoute></Route><Route path="/manager"><ProtectedRoute allowedRoles={["teacher","owner","manager","senior_manager"]}><ManagerHome /></ProtectedRoute></Route>
  <Route path="/admin/command-center"><ProtectedRoute allowedRoles={["owner"]}><OwnerCommandCenter /></ProtectedRoute></Route><Route path="/admin/users"><ProtectedRoute allowedRoles={["owner"]}><AdminUsers /></ProtectedRoute></Route><Route path="/admin/lessons"><ProtectedRoute allowedRoles={["owner"]}><AdminLessons /></ProtectedRoute></Route><Route path="/admin/classes"><ProtectedRoute allowedRoles={["owner"]}><AdminClasses /></ProtectedRoute></Route><Route path="/admin/payments"><ProtectedRoute allowedRoles={["owner"]}><AdminPayments /></ProtectedRoute></Route><Route path="/admin/chat"><ProtectedRoute allowedRoles={["owner"]}><AdminChat /></ProtectedRoute></Route><Route path="/admin/notifications"><ProtectedRoute allowedRoles={["owner"]}><AdminNotifications /></ProtectedRoute></Route><Route path="/admin/settings"><ProtectedRoute allowedRoles={["owner"]}><AdminSettings /></ProtectedRoute></Route><Route path="/admin/ai/settings"><ProtectedRoute allowedRoles={["owner"]}><AdminAISettings /></ProtectedRoute></Route><Route path="/admin/ai"><ProtectedRoute allowedRoles={["owner"]}><AdminAI /></ProtectedRoute></Route><Route path="/admin/polls"><ProtectedRoute allowedRoles={["owner"]}><AdminPolls /></ProtectedRoute></Route><Route path="/admin/break-elidems"><ProtectedRoute allowedRoles={["owner"]}><AdminBreakElidems /></ProtectedRoute></Route><Route path="/admin/safety"><ProtectedRoute allowedRoles={["owner"]}><AdminSafety /></ProtectedRoute></Route><Route path="/admin/audit-logs"><ProtectedRoute allowedRoles={["owner"]}><AdminAuditLogs /></ProtectedRoute></Route><Route path="/admin/financial"><ProtectedRoute allowedRoles={["owner"]}><AdminFinancial /></ProtectedRoute></Route><Route path="/admin/staff-payments"><ProtectedRoute allowedRoles={["owner"]}><AdminStaffPayments /></ProtectedRoute></Route><Route path="/admin/alerts"><ProtectedRoute allowedRoles={["owner"]}><AdminOwnerAlerts /></ProtectedRoute></Route><Route path="/admin/assignments"><ProtectedRoute allowedRoles={["owner"]}><AdminAssignments /></ProtectedRoute></Route><Route path="/admin/achievements"><ProtectedRoute allowedRoles={["owner"]}><AdminAchievements /></ProtectedRoute></Route><Route path="/admin"><ProtectedRoute allowedRoles={["owner"]}><AdminHome /></ProtectedRoute></Route>
  <Route component={NotFound} />
</Switch></Suspense>; }
function App(){return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,"")}><AuthProvider><TooltipProvider><Router/><Toaster/><SystemNotificationBridge/><DailyAttendanceTracker/></TooltipProvider></AuthProvider></WouterRouter></QueryClientProvider>}
export default App;
