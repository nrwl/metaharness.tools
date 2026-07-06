import { type CSSProperties } from 'react';

/**
 * Toggle switch shared by the before/after morph animations
 * (CrossRepoFlow / SessionMemory). Neutral borders, accent track + knob when
 * on; deliberately restrained. Reports `role="switch"` and slides its knob.
 */
export interface MorphSwitchProps {
  /** Current side (true = "after"/on). */
  after: boolean;
  /** Pinned (non-interactive) modes render it disabled but still reflect side. */
  disabled: boolean;
  onToggle: () => void;
  /** Label shown left of the switch (the "before" side). */
  offLabel: string;
  /** Label shown right of the switch (the "after" side). */
  onLabel: string;
}

const LABEL_STYLE: CSSProperties = {
  fontSize: 10,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  userSelect: 'none',
  transition: 'color 0.3s',
};

export function MorphSwitch({
  after,
  disabled,
  onToggle,
  offLabel,
  onLabel,
}: MorphSwitchProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 14,
      }}
    >
      <span style={{ ...LABEL_STYLE, color: after ? '#525252' : '#a3a3a3' }}>
        {offLabel}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={after}
        aria-label={`${offLabel} / ${onLabel}`}
        disabled={disabled}
        onClick={onToggle}
        style={{
          position: 'relative',
          width: 40,
          height: 20,
          padding: 0,
          borderRadius: 999,
          border: `1px solid ${after ? '#d4b483' : '#404040'}`,
          background: after ? 'rgba(212, 180, 131, 0.18)' : 'transparent',
          cursor: disabled ? 'default' : 'pointer',
          transition: 'background 0.3s, border-color 0.3s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '50%',
            left: 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: after ? '#d4b483' : '#525252',
            transform: `translate(${after ? 18 : 0}px, -50%)`,
            transition: 'transform 0.3s, background 0.3s',
          }}
        />
      </button>
      <span style={{ ...LABEL_STYLE, color: after ? '#a3a3a3' : '#525252' }}>
        {onLabel}
      </span>
    </div>
  );
}
