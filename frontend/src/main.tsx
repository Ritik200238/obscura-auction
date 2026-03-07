import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AleoWalletProvider } from '@provablehq/aleo-wallet-adaptor-react'
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield'
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core'
import { Network } from '@provablehq/aleo-types'
import { WalletModalProvider } from '@provablehq/aleo-wallet-adaptor-react-ui'
import '@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css'
import App from './App'
import './index.css'
import { config } from './lib/config'

const wallets = [new ShieldWalletAdapter()]

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AleoWalletProvider
      wallets={wallets}
      network={Network.TESTNET}
      autoConnect={true}
      decryptPermission={DecryptPermission.AutoDecrypt}
      programs={[
        config.programId,
        config.creditsProgram,
      ]}
    >
      <WalletModalProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </WalletModalProvider>
    </AleoWalletProvider>
  </React.StrictMode>
)
