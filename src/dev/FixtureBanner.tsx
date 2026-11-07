// DEV-ONLY. Loaded with React.lazy behind `import.meta.env.DEV`.
import { FlaskConical } from 'lucide-react'

export default function FixtureBanner({ name }: { name: string }) {
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm font-semibold text-warning"
    >
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Fixture (test data): {name}. The real service is not called and nothing is saved.</span>
    </div>
  )
}
