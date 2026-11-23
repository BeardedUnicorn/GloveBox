import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { isDarkCalibration } from '../../calibration/sources';
import { appStore, useApp } from '../../state/appStore';
import type { Settings } from '../../state/settings';
import { CameraChoice } from './CameraChoice';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="stack field-label">
        <span>{label}</span>
        {hint && <span className="faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Choice<K extends keyof Settings>({
  setting,
  label,
  options,
}: {
  setting: K;
  label: string;
  options: readonly { value: Settings[K]; label: string }[];
}) {
  const value = useApp(state => state.settings[setting]);
  return (
    <select
      aria-label={label}
      value={String(value)}
      onChange={event => {
        const chosen = options.find(option => String(option.value) === event.target.value)!;
        appStore.getState().updateSettings({ [setting]: chosen.value } as Partial<Settings>);
      }}
    >
      {options.map(option => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({ setting, label }: { setting: keyof Settings; label: string }) {
  const value = useApp(state => state.settings[setting]) as boolean;
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={value}
      onChange={event => appStore.getState().updateSettings({ [setting]: event.target.checked })}
    />
  );
}

/** Settings: tracking and the camera, practice, and about. Update and release-note sections plug in below. */
export function SettingsScreen({ children }: { children?: ReactNode }) {
  const handFit = useApp(state => state.settings.handFit);
  const darkCalibrated = useApp(state => isDarkCalibration(state.settings.darkCalibration));

  return (
    <div className="settings stack">
      <h1>Settings</h1>

      <section className="panel" aria-label="Tracking">
        <h2>Tracking</h2>
        <Field label="Mode" hint="Lit: a lit room, hands seen whole. Dark: gloves on, lights off.">
          <Choice
            setting="tracker"
            label="Tracking mode"
            options={[
              { value: 'lit', label: 'Lit' },
              { value: 'dark', label: 'Dark (LED gloves)' },
            ]}
          />
        </Field>
        <Field label="Camera" hint="Automatic skips virtual cameras like OBS.">
          <CameraChoice />
        </Field>
        <Field
          label="Lit mode calibration"
          hint={handFit ? 'Lessons are fitted to your hands.' : 'Fit lessons to your hands and check left from right.'}
        >
          <Link className="btn small" to="/calibrate/lit">
            {handFit ? 'Calibrate again' : 'Calibrate'}
          </Link>
        </Field>
        <Field
          label="Dark mode calibration"
          hint={darkCalibrated ? 'GloveBox knows your gloves.' : 'Needed once before Dark mode: about ten seconds.'}
        >
          <Link className="btn small" to="/calibrate/dark">
            {darkCalibrated ? 'Calibrate again' : 'Calibrate'}
          </Link>
        </Field>
        <Field label="Swap left and right" hint="If the app keeps calling your right hand the left.">
          <Toggle setting="swapHandedness" label="Swap left and right" />
        </Field>
        <Field label="Hand tracking runs on" hint="Try the processor if the graphics card gives trouble.">
          <Choice
            setting="delegate"
            label="Hand tracking runs on"
            options={[
              { value: 'GPU', label: 'Graphics card' },
              { value: 'CPU', label: 'Processor' },
            ]}
          />
        </Field>
      </section>

      <section className="panel" aria-label="Practice">
        <h2>Practice</h2>
        <Field label="Difficulty" hint="How big the target rings are.">
          <Choice
            setting="difficulty"
            label="Difficulty"
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'normal', label: 'Normal' },
              { value: 'hard', label: 'Hard' },
            ]}
          />
        </Field>
        <Field label="View" hint="Mirror: like a mirror. Receiver: what your receiver sees.">
          <Choice
            setting="view"
            label="View"
            options={[
              { value: 'performer', label: 'Mirror' },
              { value: 'receiver', label: 'Receiver' },
            ]}
          />
        </Field>
        <Field label="Light colors">
          <Choice
            setting="palette"
            label="Light colors"
            options={[
              { value: 'rainbow', label: 'Rainbow' },
              { value: 'colorblind', label: 'Colorblind-safe' },
            ]}
          />
        </Field>
        <Field label="Metronome">
          <Toggle setting="metronome" label="Metronome" />
        </Field>
        <Field label="Ghost trails" hint="Where each light goes over the next beat.">
          <Toggle setting="showGhost" label="Ghost trails" />
        </Field>
        <Field label="Dim the camera" hint="Makes the lights stand out.">
          <Toggle setting="dimVideo" label="Dim the camera" />
        </Field>
        <Field label="Show what the tracker sees" hint="The hand skeleton, or every light in Dark mode.">
          <Toggle setting="showSkeleton" label="Show what the tracker sees" />
        </Field>
      </section>

      {children}

      <section className="panel stack" aria-label="About">
        <h2>About</h2>
        <p className="muted">
          GloveBox watches your hands on this device only: no video, images or tracking data ever leave it. Hand
          tracking is MediaPipe's Hand Landmarker, bundled with the app; its usage reports to Google are blocked.
        </p>
        <p className="faint">MIT License · github.com/BeardedUnicorn/GloveBox</p>
      </section>
    </div>
  );
}
