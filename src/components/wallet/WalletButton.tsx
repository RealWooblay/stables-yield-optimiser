import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useWalletStore } from '@/stores/wallet-store'
import { useEffect, useRef } from 'react'
import { upsertWallet } from '@/db/repositories/wallets'
import { startDataSync, stopDataSync } from '@/data/sync'

export function WalletButton() {
  const { publicKey, connected, disconnect, connecting } = useWallet()
  const { setVisible } = useWalletModal()
  const { setAddress, setConnected } = useWalletStore()
  const prevConnected = useRef(false)

  useEffect(() => {
    if (connected && publicKey) {
      const address = publicKey.toBase58()
      setAddress(address)
      setConnected(true)

      if (!prevConnected.current) {
        upsertWallet(address).catch(console.error)
        startDataSync(address)
      }
      prevConnected.current = true
    } else {
      if (prevConnected.current) {
        stopDataSync()
      }
      setAddress(null)
      setConnected(false)
      prevConnected.current = false
    }
  }, [connected, publicKey, setAddress, setConnected])

  if (connecting) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-bg-tertiary/80 border border-border-primary/60 text-sm">
        <div className="w-3 h-3 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
        <span className="text-text-muted text-xs">Connecting...</span>
      </div>
    )
  }

  if (connected && publicKey) {
    const address = publicKey.toBase58()
    const short = `${address.slice(0, 4)}...${address.slice(-4)}`

    return (
      <button
        onClick={() => disconnect()}
        className="btn-press flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-bg-tertiary/80 hover:bg-bg-elevated border border-border-primary/60 transition-all duration-200 text-sm group"
      >
        <div className="relative">
          <div className="w-2 h-2 rounded-full bg-accent-green" />
          <div className="absolute inset-0 w-2 h-2 rounded-full bg-accent-green animate-ping opacity-40" />
        </div>
        <span className="font-mono text-text-primary text-xs tracking-wide">{short}</span>
        <span className="text-[10px] text-text-muted group-hover:text-accent-red transition-colors">disconnect</span>
      </button>
    )
  }

  return (
    <button
      onClick={() => setVisible(true)}
      className="btn-primary"
    >
      Connect Wallet
    </button>
  )
}
