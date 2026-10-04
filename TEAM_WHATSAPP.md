# Team WhatsApp and manager supervision

Management (SUPER_ADMIN and CLINIC_MANAGER) uses Work WhatsApp to see each active work account, connection status, assigned lead count, captured-contact count, and conversations. Manager conversation views do not mark staff messages read and cannot send or retry messages. Staff (SALES_CONSULTANT and RECEPTION) pair their own dedicated work number and can send text from Conversations. Other staff cannot access another person's work-account threads, even through a direct URL.

Contacted counts are currently assigned leads with a successful outgoing message captured on that person's account. They do not prove that the patient read the message, do not identify which linked device typed it, and do not count messages sent while tracking was disconnected. Phone and linked-device outgoing messages are captured as outbound; incoming replies remain inbound. Media is represented by a caption or placeholder; files must be sent/viewed on work WhatsApp. Existing saved attachments remain readable. Opening WhatsApp alone never counts as contact.

## Deployment

1. Deploy the backend changes on Render with the existing migration-first start command. The additive migration creates whatsapp_accounts and adds a session identifier to conversations; existing conversations remain in the default clinic session. Do not reset the production database.
2. Enable WHATSAPP_WEB_ENABLED=true in the Render service. This is an existing optional flag. Persistent authentication keys remain in the existing database-backed WhatsAppSession store, with one namespace per account.
3. Deploy the matching frontend to Vercel after the backend is healthy. Keep NEXT_PUBLIC_API_URL pointed at the actual Render backend.
4. Each salesperson opens Work WhatsApp and scans their own QR from their work phone's Linked devices menu. Never use personal numbers: the linked account's individual chats are visible to management.
5. Verify with an internal test contact: assign a test lead, send staff CRM text, reply from the test phone, send direct work-phone text, inspect manager conversation and contact count, then disconnect and verify sending is disabled. No real patient messages should be sent for testing.

A disconnected account retains its captured history and last capture time. Reconnection backs off automatically for transient failures and requires a fresh QR when credentials are rejected. Reconnect never switches sending to another number. Live disconnection and contact counts poll every 15 seconds; conversation sending availability polls every 10 seconds.

The backend health endpoint checks process availability, not WhatsApp message delivery. Render must remain awake for live capture; a sleeping service creates tracking gaps. Existing shared clinic gateways remain available for historic default threads.
