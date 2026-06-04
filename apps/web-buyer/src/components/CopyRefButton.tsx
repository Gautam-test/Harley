import { useEffect, useState } from 'react';

/**
 * Tiny clipboard-copy button shown next to the formatted Reference ID
 * on the enquiry-success modals. Click writes the ref to the clipboard
 * via `navigator.clipboard.writeText` (with a `document.execCommand`
 * fallback for very old browsers / non-secure-context iframes) and
 * surfaces a brief "Copied" pill for 2s so the buyer gets visible
 * confirmation. Errors degrade silently — the worst case is the buyer
 * selects + Ctrl+C manually.
 *
 * Two `tone` presets so the button reads correctly against either the
 * white card (SellBikeModal) or the black confirmation block
 * (ListingSidebarCard).
 */
export function CopyRefButton({
  value,
  tone = 'on-light',
}: {
  value: string;
  tone?: 'on-light' | 'on-dark';
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Legacy fallback: a hidden textarea + execCommand. Modern
        // browsers in https contexts hit the clipboard API path above.
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
    } catch {
      // Swallow — buyer can still copy manually with text selection.
    }
  };

  const baseBtn =
    'inline-flex items-center justify-center w-6 h-6 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-hd-orange';
  const btnTone =
    tone === 'on-dark'
      ? 'text-hd-white/70 hover:text-hd-white'
      : 'text-gray-500 hover:text-hd-black';

  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy reference ID ${value}`}
        title="Copy reference ID"
        className={`${baseBtn} ${btnTone}`}
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          className="w-4 h-4"
          aria-hidden
        >
          <rect x="7" y="3" width="10" height="12" rx="1" />
          <path d="M13 7H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" />
        </svg>
      </button>
      {copied && (
        <span
          role="status"
          aria-live="polite"
          className={`font-subhead uppercase tracking-subhead text-[10px] px-1.5 py-0.5 ${
            tone === 'on-dark' ? 'bg-hd-white text-hd-black' : 'bg-hd-black text-hd-white'
          }`}
        >
          Copied
        </span>
      )}
    </span>
  );
}
