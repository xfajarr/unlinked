import { CopyIcon } from './Icons'
import { useToast } from './Toast'

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const toast = useToast()
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label}
      onClick={() => navigator.clipboard.writeText(value).then(() => toast('Copied'), () => toast('Copy blocked by the browser', { error: true }))}
    >
      <CopyIcon size={16} />
    </button>
  )
}
