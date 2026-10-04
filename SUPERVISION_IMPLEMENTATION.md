# Sales supervision implementation map

Existing — reuse: Lead/Patient relationships; existing pipeline stages; Message and Conversation transports; successful outbound delivery states; CallLog; LeadTask; LeadActivity timeline; AccessProfile permission overrides; Notification; TreatmentPlan and items; Appointment; Invoice/Payment; Campaign; Nest scheduler and Prisma.

Partial — improve: My Day stage cadence and reply preview; supervisor correction queue; task date changes without reasons; free-text lost reasons; normalized phone duplicate checks; reports without SLA history; treatment plans without immutable sent versions.

Missing — build: CoachingIssue/SalesRule; serialized idempotent evaluation; durable transactional dirty-lead queue; escalation and issue events; supervisor instructions; assessment requirements and doctor responsibility; waiting/payment promises; SLA contact evidence and metrics.

Remove/avoid: No replacement CRM, inbox, pipeline, or treatment planner. No new messaging transport. No automatic patient sends, medical decisions, discounts, or payments. No model-dependent business rules.

Implementation order: persistence/rules → core contact/follow-up rules → My Day/coach/settings → supervision/instructions → assessments/quote snapshots/payment promises → reports/acceptance tests.

Deployment: apply additive Prisma migrations before deploying the API/web. Source publishing is blocked until explicitly authorized for the public remote. Production patient data must not be used in local acceptance tests.

Verification: API unit tests, web unit tests, additive migrations applied to an isolated PostgreSQL-compatible database, and authenticated API acceptance tests using a fake WhatsApp transport. The acceptance test must run only against a disposable database with migrations applied:

`COACHING_TEST_DB=1 DATABASE_URL=<disposable-test-database> npm exec --workspace=apps/api -- jest --config ./test/jest-e2e.json --runInBand coaching.e2e`

Existing assignment timestamps are backfilled from lead creation because historical assignment times were not stored; future assignments have exact timestamps. Assessment checklist items are verified by the responsible user; uploading an arbitrary attachment does not certify that it meets a medical requirement. Sent quote versions snapshot the existing treatment plan; recording a sent version does not dispatch messages. No live WhatsApp delivery or production migration was attempted. Browser verification could not start because Chrome download certificate verification failed.
