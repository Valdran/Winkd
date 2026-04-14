import { AeroWindow } from '../components/AeroWindow'
import { Sidebar } from '../components/Sidebar'
import { ChatWindow } from '../components/ChatWindow'
import { useSocket } from '../hooks/useSocket'

export function BuddyListPage() {
  const { send } = useSocket()

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(ellipse at 30% 60%, #1a4a9a 0%, #0a1530 100%)',
        overflow: 'hidden',
      }}
    >
      <AeroWindow
        title="Winkd Messenger"
        icon="https://i.imgur.com/cg6eejI.png"
        style={{
          width: '100%',
          maxWidth: 900,
          height: '100%',
          maxHeight: 690,
        }}
      >
        <Sidebar send={send} />
        <ChatWindow send={send} />
      </AeroWindow>
    </div>
  )
}
