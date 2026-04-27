import type { ReactNode } from 'react'

interface CatalogCrudSectionProps {
  title: string
  subtitle: string
  form: ReactNode
  children: ReactNode
}

export function CatalogCrudSection({
  title,
  subtitle,
  form,
  children,
}: CatalogCrudSectionProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <header>
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
        <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>
      </header>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">{form}</div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">{children}</div>
      </div>
    </section>
  )
}
