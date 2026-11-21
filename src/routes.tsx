import type { RouteObject } from 'react-router';
import { Link } from 'react-router';
import { Shell } from './components/Shell';
import { CalibrateScreen } from './screens/calibrate/CalibrateScreen';
import { HomeScreen } from './screens/home/HomeScreen';
import { PracticeScreen } from './screens/practice/PracticeScreen';
import { ProgressScreen } from './screens/progress/ProgressScreen';
import { ResultsScreen } from './screens/results/ResultsScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { catalogOf, useApp } from './state/appStore';

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

/** Every screen. Practice and calibration fill the window; the rest sit in the shell. */
export const routes: RouteObject[] = [
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
        <SettingsScreen />
      </Shell>
    ),
  },
  { path: '/calibrate', element: <CalibrateScreen /> },
  {
    path: '*',
    element: (
      <Shell>
        <NotFound />
      </Shell>
    ),
  },
];
