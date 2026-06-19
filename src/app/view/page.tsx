import ViewerApp from '@/components/ViewerApp'

export default async function ViewerPage({ searchParams }: { searchParams: Promise<{ s?: string; t?: string }> }) {
  const { s, t } = await searchParams
  return <ViewerApp sessionId={s ?? ''} sessionToken={t ?? ''} />
}
