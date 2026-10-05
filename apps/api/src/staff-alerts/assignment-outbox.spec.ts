import { execFileSync } from 'child_process';
import { join } from 'path';
it('verifies real PostgreSQL assignment triggers and document migrations in an isolated database', () => {
  expect(
    execFileSync(
      process.execPath,
      [join(__dirname, '../../scripts/verify-assignment-outbox.cjs')],
      { timeout: 30000, encoding: 'utf8' },
    ),
  ).toContain('outbox checks passed');
}, 35000);
