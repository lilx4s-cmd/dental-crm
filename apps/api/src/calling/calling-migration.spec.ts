import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
describe('calling migration integrity', () => {
  it('applies additively and enforces one active call per staff member', async () => {
    const script = `
      const { PGlite } = require('@electric-sql/pglite');
      const assert = require('assert');
      const db = new PGlite();
      (async () => { try {
      await db.exec(\`CREATE TABLE users (id TEXT PRIMARY KEY); CREATE TABLE leads (id TEXT PRIMARY KEY); CREATE TABLE call_logs (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('staff'); INSERT INTO leads VALUES ('lead');\`);
      await db.exec(${JSON.stringify(readFileSync(join(__dirname, '../../prisma/migrations/20261007225000_telnyx_calling/migration.sql'), 'utf8'))});
      const insert = \`INSERT INTO voice_attempts (id, "userId", "leadId", "phoneNumber", "staffDestination", "activeUserId", "updatedAt") VALUES ($1, 'staff', 'lead', '+12025550100', 'sip:staff@sip.telnyx.com', 'staff', NOW())\`;
      await db.query(insert, ['first']);
      await db.exec(${JSON.stringify(readFileSync(join(__dirname, '../../prisma/migrations/20261007234500_call_recording/migration.sql'), 'utf8'))});
      assert.deepStrictEqual((await db.query('SELECT "recordingStatus", "recordingConsentAt" FROM voice_attempts WHERE id = $1', ['first'])).rows, [{ recordingStatus: 'NONE', recordingConsentAt: null }]);
      await assert.rejects(() => db.query(insert, ['second']));
      await db.exec(\`UPDATE voice_attempts SET "activeUserId" = NULL WHERE id = 'first'\`);
      await db.query(insert, ['second']);
      await db.exec(\`INSERT INTO voice_webhook_events (id) VALUES ('event')\`);
      await assert.rejects(() => db.exec(\`INSERT INTO voice_webhook_events (id) VALUES ('event')\`));
      assert.deepStrictEqual((await db.query('SELECT id FROM users')).rows, [{ id: 'staff' }]);
      } finally { await db.close(); } })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    execFileSync(process.execPath, ['-e', script], { cwd: join(__dirname, '../../../..'), timeout: 30000, stdio: 'pipe' });
  });
});
