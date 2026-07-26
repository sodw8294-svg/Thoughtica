import { createClient } from '@blinkdotnew/sdk'

export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'thoughtica-pwa-app-6fceb4nw',
  publishableKey: import.meta.env.VITE_BLINK_PUBLISHABLE_KEY || 'blnk_pk_IfynL9sMTthQxhnna3OXl4a6rG504kQ2',
  authRequired: false,
  auth: { mode: 'managed' },
})
