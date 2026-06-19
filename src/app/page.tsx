export const dynamic = 'force-dynamic'

import store from '@/lib/store'
import { encryptSession } from '@/lib/auth'
import SenderApp from '@/components/SenderApp'

export default async function SenderPage() {
  const initialSessionToken = await encryptSession(store.pin, store.sessionId)
  return (
    <SenderApp
      initialPin={store.pin}
      initialSessionId={store.sessionId}
      initialSessionToken={initialSessionToken}
      pinFixed={!!process.env.STREAM_PIN}
    />
  )
}
