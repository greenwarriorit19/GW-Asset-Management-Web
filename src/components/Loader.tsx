/** Bouncing-dots loading indicator (plain CSS, no styled-components). `size` scales it; `label` adds text underneath. */
export function Loader({ size = 1, label, inline }: { size?: number; label?: string; inline?: boolean }) {
  return (
    <div className={`loader ${inline ? 'inline' : ''}`} role="status" aria-live="polite" aria-label={label ?? 'Loading'}>
      <div className="typing-indicator" style={{ transform: `scale(${size})` }}>
        <div className="typing-circle" /><div className="typing-circle" /><div className="typing-circle" />
        <div className="typing-shadow" /><div className="typing-shadow" /><div className="typing-shadow" />
      </div>
      {label && <div className="loader-label">{label}</div>}
    </div>
  );
}

/** Full-page loading screen (initial connection, sign-in transitions). */
export function LoadingScreen({ label }: { label: string }) {
  return <div className="login-wrap"><div className="loading-card"><Loader size={1.4} /><div className="loader-label">{label}</div></div></div>;
}
