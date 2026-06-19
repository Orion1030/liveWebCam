import ViewerApp from '@/components/ViewerApp'

export default async function ViewerPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams
  return <ViewerApp sessionId={s ?? ''} />
}
