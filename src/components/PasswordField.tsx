import { useId, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import '../features/server/account.css';
export function PasswordField({
  label,
  id,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="password-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-input">
        <input {...props} id={inputId} type={revealed ? 'text' : 'password'} />
        <button
          type="button"
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
          aria-controls={inputId}
          onClick={() => setRevealed(!revealed)}
        >
          {revealed ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
