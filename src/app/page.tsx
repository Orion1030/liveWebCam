export const dynamic = 'force-dynamic'

import store from '@/lib/store'
import SenderApp from '@/components/SenderApp'

export default function SenderPage() {
  return (
    <SenderApp
      initialPin={store.pin}
      initialSessionId={store.sessionId}
      pinFixed={!!process.env.STREAM_PIN}
    />
  )
}
