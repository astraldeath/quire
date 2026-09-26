import { useState } from 'react';
import { ReadingControls } from './ReadingControls';
import { RsvpSettings } from './rsvp/RsvpSettings';
import {
  SavedReadingStyles,
  CustomFontSettings,
  type ReadingCustomization,
} from './ReadingCustomization';
import {
  readerPreferences,
  setBookReaderPreferences,
  resetBookReaderPreferences,
  fontFamily,
} from './customization';
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
  preferences: effectivePreferences,
  onPreferences: onEffectivePreferences,
  customization,
  comic = false,
  fixedLayout = false,
  onRsvp,
  previewing = false,
}: {
  customization?: ReadingCustomization;
  preferences: ReaderPreferences;
  onPreferences(value: ReaderPreferences): void;
  comic?: boolean;
  fixedLayout?: boolean;
  onRsvp?(): void;
  previewing?: boolean;
}) {
  const [scope, setScope] = useState<'global' | 'book'>(() =>
    customization?.preferences.bookReaderOverrides?.[customization.bookId]
      ? 'book'
      : 'global',
  );
  const preferences = customization
    ? scope === 'global'
      ? customization.preferences.reader
      : readerPreferences(customization.preferences, customization.bookId)
    : effectivePreferences;
  const onPreferences = (next: ReaderPreferences) => {
    if (!customization) return onEffectivePreferences(next);
    customization.onChange(
      scope === 'global'
        ? { ...customization.preferences, reader: next }
        : setBookReaderPreferences(
            customization.preferences,
            customization.bookId,
            next,
          ),
    );
  };
  const fonts =
    customization?.preferences.customFonts?.map((f) => ({
      value: f.id,
      label: f.name,
    })) ?? [];
  const patch = (value: Partial<ReaderPreferences>) =>
    onPreferences({ ...preferences, ...value });
  return (
    <>
      {customization && (
        <div className="reading-scope">
          <Segments<'global' | 'book'>
            label="Apply changes to"
            value={scope}
            options={[
              { value: 'global', label: 'All books' },
              { value: 'book', label: 'This book' },
            ]}
            onChange={setScope}
          />
          {scope === 'book' && (
            <button
              disabled={
                !customization.preferences.bookReaderOverrides?.[
                  customization.bookId
                ]
              }
              onClick={() =>
                customization.onChange(
                  resetBookReaderPreferences(
                    customization.preferences,
                    customization.bookId,
                  ),
                )
              }
            >
              Use global defaults
            </button>
          )}
        </div>
      )}
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
                          onChange={(comicDirection) =>
                            patch({ comicDirection })
                          }
                        />
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
                        <label>
                          Font
                          <select
                            aria-label="Font"
                            value={preferences.font}
                            onChange={(e) => patch({ font: e.target.value })}
                          >
                            <option value="publisher">Publisher</option>
                            <option value="Georgia">Serif</option>
                            <option value="sans-serif">Sans serif</option>
                            {fonts.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {customization && (
                          <CustomFontSettings customization={customization} />
                        )}
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
                        <StepperControl
                          label="Font weight"
                          min={100}
                          max={900}
                          step={100}
                          value={preferences.fontWeight ?? 400}
                          onChange={(fontWeight) => patch({ fontWeight })}
                        />
                        <p className="settings-note">
                          Available weights depend on the font.
                        </p>
                        <div
                          className="reading-style-preview"
                          aria-label="Typography preview"
                          style={{
                            fontFamily: fontFamily(preferences.font),
                            fontWeight: preferences.fontWeight,
                            fontSize: preferences.size,
                            lineHeight: preferences.lineHeight,
                          }}
                        >
                          The afternoon light fell across the open book. There
                          was still time for another chapter.
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
                            label="Maximum text width"
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
                        {preferences.flow === 'paginated' &&
                          preferences.columns === 'two' && (
                            <p className="settings-note">
                              Two pages appear when the screen has enough room.
                            </p>
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
          ...(!comic && !fixedLayout
            ? [
                {
                  id: 'rsvp',
                  label: 'RSVP',
                  icon: Play,
                  content: (
                    <RsvpSettings
                      preferences={preferences}
                      onPreferences={onPreferences}
                      onRsvp={onRsvp}
                      previewing={previewing}
                      fonts={fonts}
                    />
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
                  options={[
                    'app',
                    'light',
                    'dark',
                    'onyx',
                    'contrast',
                    'custom',
                  ]}
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
                      label="Link color"
                      value={preferences.linkColor ?? preferences.foreground}
                      onChange={(linkColor) => patch({ linkColor })}
                    />
                    <ColorControl
                      label="Page color"
                      value={preferences.background}
                      onChange={(background) => patch({ background })}
                    />
                    {customization && (
                      <SavedReadingStyles
                        kind="theme"
                        customization={customization}
                        reader={preferences}
                        onApply={onPreferences}
                      />
                    )}
                  </>
                )}
              </div>
            ),
          },
          ...[
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
                  <ReadingControls
                    preferences={preferences}
                    onPreferences={onPreferences}
                  />
                  <button onClick={() => onPreferences({ ...defaults.reader })}>
                    Reset reading settings
                  </button>
                </div>
              ),
            },
          ],
          ...(customization
            ? [
                {
                  id: 'presets',
                  label: 'Presets',
                  icon: BookOpen,
                  content: (
                    <div className="reader-settings">
                      <SavedReadingStyles
                        kind="preset"
                        customization={customization}
                        reader={preferences}
                        onApply={onPreferences}
                      />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
