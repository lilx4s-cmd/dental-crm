# Telnyx patient calling

The Calling page is available to the owner, manager, sales, and reception profiles. Only sales/reception staff with `calls.place`, `calls.read`, and lead read access can dial. The queue includes assigned active leads with valid US or Canadian phone numbers. Management can inspect history under existing lead visibility rules. WhatsApp stays on its current connection.

## Activate the clinic account

1. Register and verify the clinic account at https://portal.telnyx.com/. Add billing and obtain an eligible US/Canadian voice number. Account approval and the exact Canadian destination rate must be confirmed with Telnyx.
2. Create a **Credential Connection** for browser staff. Enable WebRTC, SIP URI dialing, and TLS/SRTP as recommended by Telnyx. Keep this connection **inbound-only**: staff JWTs must not permit direct PSTN dialing. Do not attach an unrestricted outbound voice profile to it.
3. Create a **Voice API / Call Control application** with an outbound voice profile. Allow US/Canada destinations only, deny premium destinations, set one concurrent call per staff where supported, and configure spend alerts/limits in Telnyx. Ensure calls to the credential SIP URIs are allowed. Use the clinic number as the caller ID.
4. Configure the Call Control application's HTTPS webhook at `https://dental-crm-qaz2.onrender.com/api/calling/webhook`. Obtain the account Ed25519 public signing key.
5. Add these **API server environment variables** through the hosting secret settings, never frontend variables, chat messages, or Git:

```
TELNYX_API_KEY=<clinic secret API key>
TELNYX_PUBLIC_KEY=<account Ed25519 public key, base64 or PEM>
TELNYX_CALL_CONTROL_CONNECTION_ID=<Voice API application ID>
TELNYX_CREDENTIAL_CONNECTION_ID=<browser Credential Connection ID>
TELNYX_CALLER_NUMBER=<eligible +1 caller number>
TELNYX_WEBHOOK_URL=https://dental-crm-qaz2.onrender.com/api/calling/webhook
TELNYX_ENABLED=false
```

6. Redeploy the API. Review Calling activation status. Set `TELNYX_ENABLED=true` only after configuration and provider restrictions are verified. Make the first authorized test to a clinic-owned number, not an actual patient.

## Staff workflow

Connect headset explicitly and allow microphone access. Select an assigned patient and press Call patient. The server rings that staff member's browser; **the patient is not dialed until staff answers**. The patient leg bridges on answer. End call, save outcome/notes, and optionally schedule a follow-up. “Call next patient after saving” starts the next staff-first attempt. The WhatsApp link opens a separate chat; it does not transfer live call audio.

Only one active attempt per staff member is allowed across tabs. Unmounting the page disconnects the SDK and requests cancellation. Provider call legs are capped at 15 minutes; unanswered legs time out after 25 seconds. Signed webhooks update durable attempt and call-log records. Duplicate commands use deterministic identifiers. Unknown dial responses retain the staff reservation rather than allowing another patient to be called. A reconciliation job checks stale reservations after 16 minutes.

## Verification limits

Automated tests use example numbers and mocked provider calls. A real audio bridge, billing, caller-ID display, webhook delivery, and mobile-browser behavior require the configured account and an explicitly authorized clinic-owned test number. No live patient calls are part of deployment verification.

## Official references

- https://developers.telnyx.com/docs/voice/webrtc/use-cases/contact-center
- https://developers.telnyx.com/docs/voice/webrtc/use-cases/outbound-dialer
- https://developers.telnyx.com/docs/development/api-fundamentals/webhooks/receiving-webhooks
- https://telnyx.com/pricing/voice-api
