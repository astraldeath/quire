import {
  Type,
  LayoutTemplate,
  Palette,
  Hand,
  BookOpen,
  Play,
} from 'lucide-react';
import { defaults, type ReaderPreferences } from '../../domain/models';
import { SettingsTabs } from '../../components/SettingsTabs';
import {
  ThemePicker,
  Segments,
  StepperControl,
  Switch,
  ColorControl,
} from '../../components/Controls';
export function ReadingSettings({
  preferences,
  onPreferences,
  comic = false,
  fixedLayout = false,
  onRsvp,
}: {
  preferences: ReaderPreferences;
  onPreferences(value: ReaderPreferences): void;
  comic?: boolean;
  fixedLayout?: boolean;
  onRsvp?(): void;
}) {
  const patch = (value: Partial<ReaderPreferences>) =>
    onPreferences({ ...preferences, ...value });
  return (
    <SettingsTabs
      layout="settings"
      label="Reading settings sections"
      tabs={[
        ...(fixedLayout
          ? []
          : comic
            ? [
                {
                  id: 'comics',
                  label: 'Comics',
                  icon: BookOpen,
                  content: (
                    <div className="reader-settings">
                      <Segments
                        label="Page layout"
                        value={preferences.comicMode ?? 'single'}
                        options={[
                          { value: 'single', label: 'Single' },
                          { value: 'double', label: 'Double' },
                          { value: 'webtoon', label: 'Webtoon' },
                        ]}
                        onChange={(comicMode) => patch({ comicMode })}
                      />
                      <Segments
                        label="Reading direction"
                        value={preferences.comicDirection ?? 'ltr'}
                        options={[
                          { value: 'ltr', label: 'Left to right' },
                          { value: 'rtl', label: 'Right to left' },
                        ]}
                        onChange={(comicDirection) => patch({ comicDirection })}
                      />
                      <div className="reader-behavior">
                        <Switch
                          label="Tap sides to turn pages"
                          checked={preferences.tapToTurn !== false}
                          onChange={(tapToTurn) => patch({ tapToTurn })}
                        />
                        <Switch
                          label="Swipe to turn pages"
                          checked={preferences.swipeToTurn !== false}
                          onChange={(swipeToTurn) => patch({ swipeToTurn })}
                        />
                      </div>
                    </div>
                  ),
                },
              ]
            : [
                {
                  id: 'text',
                  label: 'Text',
                  icon: Type,
                  content: (
                    <div className="reader-settings">
                      {' '}
                      <Segments
                        label="Font"
                        value={preferences.font}
                        options={[
                          { value: 'publisher', label: 'Publisher' },
                          { value: 'Georgia', label: 'Serif' },
                          { value: 'sans-serif', label: 'Sans serif' },
                        ]}
                        onChange={(font) => patch({ font })}
                      />
                      <div className="stepper-group">
                        <StepperControl
                          label="Font size"
                          min={12}
                          max={36}
                          value={preferences.size}
                          unit=" px"
                          onChange={(size) => patch({ size })}
                        />
                        <StepperControl
                          label="Line spacing"
                          min={1.2}
                          max={2.4}
                          step={0.1}
                          value={preferences.lineHeight}
                          onChange={(lineHeight) => patch({ lineHeight })}
                        />
                      </div>
                      <Switch
                        label="Keep publisher formatting"
                        checked={preferences.publisherStyles}
                        onChange={(publisherStyles) =>
                          patch({ publisherStyles })
                        }
                      />
                    </div>
                  ),
                },
                {
                  id: 'layout',
                  label: 'Layout',
                  icon: LayoutTemplate,
                  content: (
                    <div className="reader-settings">
                      <div className="stepper-group">
                        {' '}
                        <StepperControl
                          label="Margins"
                          min={8}
                          max={
                            matchMedia('(max-width: 599px)').matches ? 20 : 80
                          }
                          step={4}
                          value={
                            matchMedia('(max-width: 599px)').matches
                              ? Math.min(preferences.margin, 20)
                              : preferences.margin
                          }
                          unit=" px"
                          onChange={(margin) => patch({ margin })}
                        />
                        <StepperControl
                          label="Text width"
                          min={320}
                          max={1200}
                          step={40}
                          value={preferences.maxWidth}
                          unit=" px"
                          onChange={(maxWidth) => patch({ maxWidth })}
                        />
                      </div>
                      <Segments
                        label="Reading flow"
                        value={preferences.flow}
                        options={[
                          { value: 'paginated', label: 'Pages' },
                          { value: 'scrolled', label: 'Chapter scroll' },
                          { value: 'continuous', label: 'Continuous' },
                        ]}
                        onChange={(flow) => patch({ flow })}
                      />
                      {preferences.flow === 'paginated' && (
                        <Segments
                          label="Page layout"
                          value={preferences.columns ?? 'one'}
                          options={[
                            { value: 'one', label: 'Single page' },
                            { value: 'two', label: 'Two pages' },
                          ]}
                          onChange={(columns) => patch({ columns })}
                        />
                      )}
                      {preferences.flow === 'continuous' && (
                        <p className="settings-note">
                          Scroll past a chapter’s end to load the next one.
                        </p>
                      )}
                    </div>
                  ),
                },
              ]),
        ...(onRsvp && !comic && !fixedLayout
          ? [
              {
                id: 'rsvp',
                label: 'RSVP',
                icon: Play,
                content: (
                  <div className="reader-settings">
                    <StepperControl
                      label="Words per minute"
                      min={60}
                      max={1000}
                      step={10}
                      value={preferences.rsvpWpm ?? 250}
                      onChange={(rsvpWpm) => patch({ rsvpWpm })}
                    />
                    <Switch
                      label="Pause at punctuation"
                      checked={preferences.rsvpPunctuationPauses !== false}
                      onChange={(rsvpPunctuationPauses) =>
                        patch({ rsvpPunctuationPauses })
                      }
                    />
                    <button onClick={onRsvp}>
                      <Play size={18} />
                      Start RSVP
                    </button>
                  </div>
                ),
              },
            ]
          : []),
        {
          id: 'theme',
          label: 'Theme',
          icon: Palette,
          content: (
            <div className="reader-settings">
              {' '}
              <ThemePicker
                label="Reading theme"
                value={preferences.theme}
                options={['app', 'light', 'dark', 'onyx', 'contrast', 'custom']}
                onChange={(theme) => patch({ theme })}
              />
              {preferences.theme === 'custom' && (
                <>
                  <ColorControl
                    label="Text color"
                    value={preferences.foreground}
                    onChange={(foreground) => patch({ foreground })}
                  />
                  <ColorControl
                    label="Page color"
                    value={preferences.background}
                    onChange={(background) => patch({ background })}
                  />
                </>
              )}
            </div>
          ),
        },
        ...(comic
          ? []
          : [
              {
                id: 'behavior',
                label: 'Behavior',
                icon: Hand,
                content: (
                  <div className="reader-settings reader-behavior">
                    {' '}
                    <Switch
                      label="Tap sides to turn pages"
                      checked={preferences.tapToTurn !== false}
                      onChange={(tapToTurn) => patch({ tapToTurn })}
                    />
                    <Switch
                      label="Swipe to turn pages"
                      checked={preferences.swipeToTurn !== false}
                      onChange={(swipeToTurn) => patch({ swipeToTurn })}
                    />
                    {!fixedLayout && (
                      <Switch
                        label="Page animation"
                        checked={preferences.animated !== false}
                        onChange={(animated) => patch({ animated })}
                      />
                    )}
                    <button
                      onClick={() => onPreferences({ ...defaults.reader })}
                    >
                      Reset reading settings
                    </button>
                  </div>
                ),
              },
            ]),
      ]}
    />
  );
}
