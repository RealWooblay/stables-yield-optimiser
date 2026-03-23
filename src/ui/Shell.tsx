import { StatusBar } from './StatusBar'
import { WalletButton } from '@/components/wallet/WalletButton'
import { ToastContainer } from '@/components/primitives/Toast'
import { ErrorBoundary } from '@/components/primitives/ErrorBoundary'
import { ActionDiffPanel } from '@/components/action/ActionDiffPanel'
import { AgentView } from '@/components/AgentView'
import { useUIStore } from '@/stores/ui-store'
import { getTenantConfig } from '@/config/tenant'

export function Shell() {
  const actionPanelOpen = useUIStore((s) => s.actionPanelOpen)
  const activeAction = useUIStore((s) => s.activeAction)
  const closeActionPanel = useUIStore((s) => s.closeActionPanel)
  const tenant = getTenantConfig()

  const brandName = tenant?.brandName ?? 'Yield'

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      <header className="h-14 bg-bg-secondary/90 backdrop-blur-xl border-b border-border-primary flex items-center justify-between px-5 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"
              style={{ backgroundColor: tenant?.brandColor ?? '#3b82f6' }}
            />
            <span className="text-lg font-bold tracking-tight text-text-primary">{brandName}</span>
          </div>
          <span className="text-[10px] font-medium text-text-muted bg-bg-tertiary/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
            {tenant ? 'Optimizer' : 'Intelligence'}
          </span>
        </div>
        <WalletButton />
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-6 relative">
        <ErrorBoundary>
          <AgentView />
        </ErrorBoundary>

        {actionPanelOpen && activeAction && (
          <>
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 transition-opacity"
              onClick={closeActionPanel}
            />
            <div className="fixed right-0 top-0 bottom-0 w-full max-w-[460px] z-40 bg-bg-primary/95 backdrop-blur-2xl border-l border-border-primary overflow-auto p-5 animate-in slide-in-from-right shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Action Preview</h2>
                <button
                  onClick={closeActionPanel}
                  className="btn-ghost text-text-muted hover:text-text-primary"
                >
                  Close
                </button>
              </div>
              <ActionDiffPanel
                diff={activeAction}
                onExecute={() => {
                  useUIStore.getState().addToast({
                    type: 'success',
                    title: 'Transaction Ready',
                    message: 'Review and approve the transaction in your wallet.',
                    duration: 5000,
                  })
                  closeActionPanel()
                }}
                onCancel={closeActionPanel}
              />
            </div>
          </>
        )}
      </main>

      <StatusBar />
      <ToastContainer />
    </div>
  )
}
