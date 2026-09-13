import type { Preferences } from '../../domain/models';
import { defaults } from '../../domain/models';
import { Modal } from '../../components/Modal';
import { ThemePicker, StepperControl, Switch, ColorControl } from '../../components/Controls';
export function Settings({ preferences: p, onChange, onClose }: { preferences: Preferences; onChange: (p: Preferences) => void; onClose: () => void }) {
  return <Modal title="Appearance" onClose={onClose}><div className="settings-body">
    <ThemePicker label="App theme" value={p.theme} options={['system','light','dark','onyx','contrast','custom']} onChange={theme=>onChange({...p,theme})} />
    {p.theme === 'custom' && <><ColorControl label="Background color" value={p.background} onChange={background=>onChange({...p,background})}/><ColorControl label="Text color" value={p.foreground} onChange={foreground=>onChange({...p,foreground})}/></>}
    {p.theme === 'contrast' ? <p className="settings-note">Your accent color is restored when you switch themes.</p> : <ColorControl label="Accent color" value={p.accent} onChange={accent=>onChange({...p,accent})} />}
    <StepperControl label="Cover size" min={110} max={210} step={10} value={p.coverSize} unit=" px" onChange={coverSize=>onChange({...p,coverSize})} />
    <Switch label="Group books into series" checked={p.groupSeries} onChange={groupSeries=>onChange({...p,groupSeries})} />
    <p className="muted">Reading themes and typography are available inside each book. Preferences are saved on this device.</p>
    <button className="text-action" onClick={() => onChange({ ...p, theme: defaults.theme, accent: defaults.accent, background: defaults.background, foreground: defaults.foreground, coverSize: defaults.coverSize, groupSeries: defaults.groupSeries })}>Reset appearance</button>
  </div></Modal>;
}
