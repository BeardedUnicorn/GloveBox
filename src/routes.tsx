import type { RouteObject } from 'react-router';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { Shell } from './components/Shell';
import { CalibrateScreen } from './screens/calibrate/CalibrateScreen';
import { HomeScreen } from './screens/home/HomeScreen';
import { PracticeScreen } from './screens/practice/PracticeScreen';
import { ProgressScreen } from './screens/progress/ProgressScreen';
import { RecordScreen } from './screens/record/RecordScreen';
import { ResultsScreen } from './screens/results/ResultsScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { catalogOf, useApp } from './state/appStore';
import { UpdatedNotice, UpdatePrompt, UpdatesSection, WhatsNew } from './updates';

function ProgressRoute() {
  const progress = useApp(state => state.progress);
  const lessons = useApp(state => state.lessons);
  return <ProgressScreen progress={progress} catalog={catalogOf(lessons)} />;
}

function NotFound() {
  return (
    <div className="screen-message panel stack">
      <p>Nothing here.</p>
      <Link className="btn" to="/">
        Back to the library
      </Link>
    </div>
  );
}

/** Around every screen: the update check, which waits while you practice or calibrate. */
function Root() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const busy = ['/practice', '/calibrate', '/record'].some(prefix => pathname.startsWith(prefix));
  return (
    <>
      <Outlet />
      <UpdatePrompt blocked={busy} />
      {!busy && <UpdatedNotice onShowWhatsNew={() => navigate('/settings#whats-new')} />}
    </>
  );
}

function SettingsRoute() {
  return (
    <SettingsScreen>
      <UpdatesSection />
      <div id="whats-new">
        <WhatsNew />
      </div>
    </SettingsScreen>
  );
}

/** Every screen. Practice and calibration fill the window; the rest sit in the shell. */
const screens: RouteObject[] = [
  {
    path: '/',
    element: (
      <Shell>
        <HomeScreen />
      </Shell>
    ),
  },
  { path: '/practice/:lessonId', element: <PracticeScreen /> },
  {
    path: '/results/:sessionId',
    element: (
      <Shell>
        <ResultsScreen />
      </Shell>
    ),
  },
  {
    path: '/progress',
    element: (
      <Shell>
        <ProgressRoute />
      </Shell>
    ),
  },
  {
    path: '/settings',
    element: (
      <Shell>
        <SettingsRoute />
      </Shell>
    ),
  },
  { path: '/calibrate/:mode', element: <CalibrateScreen /> },
  { path: '/record', element: <RecordScreen /> },
  {
    path: '*',
    element: (
      <Shell>
        <NotFound />
      </Shell>
    ),
  },
];

export const routes: RouteObject[] = [{ element: <Root />, children: screens }];
