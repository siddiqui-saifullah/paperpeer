import { useEffect, type ReactElement } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorCard } from './components/Page';
import { Shell } from './components/Shell';
import { useSession } from './context/session';
import { AccountPage } from './pages/Account';
import { LoginPage, RegisterPage, SetPasswordPage } from './pages/Auth';
import { ExamPage } from './pages/Exam';
import { ExamsPage } from './pages/Exams';
import { HomePage } from './pages/Home';
import { InsightsPage } from './pages/Insights';
import { MarkingPage } from './pages/Marking';
import { NewExamPage } from './pages/NewExam';
import { PeoplePage } from './pages/People';
import { SkillsPage } from './pages/Skills';

function NotFound() {
  return (
    <Shell active="" title="Not found">
      <ErrorCard status={404} message="" />
    </Shell>
  );
}

/** A page only staff (or only students) may open; anyone else sees "not found". */
function Only({ staff, children }: { staff: boolean; children: ReactElement }) {
  const { isStaff } = useSession();
  return isStaff === staff ? children : <NotFound />;
}

/** Each navigation starts at the top, with focus on the page for screen readers. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    scrollTo(0, 0);
    requestAnimationFrame(() => (document.querySelector<HTMLElement>('[autofocus]') || document.querySelector<HTMLElement>('main'))?.focus({ preventScroll: true }));
  }, [pathname]);
  return null;
}

function AppRoutes() {
  const { me, loading } = useSession();
  if (loading) return null;

  if (!me) {
    return (
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  if (me.mustChangePassword) return <SetPasswordPage />;

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/exams" element={<ExamsPage />} />
      <Route path="/exams/new" element={<Only staff><NewExamPage /></Only>} />
      <Route path="/exams/:id" element={<ExamPage />} />
      <Route path="/submissions/:id" element={<Only staff><MarkingPage /></Only>} />
      <Route path="/insights" element={<Only staff><InsightsPage /></Only>} />
      <Route path="/people" element={<Only staff><PeoplePage /></Only>} />
      <Route path="/skills" element={<Only staff={false}><SkillsPage /></Only>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export function App() {
  return (
    <HashRouter>
      <ScrollToTop />
      <AppRoutes />
    </HashRouter>
  );
}
