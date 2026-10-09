import { execFileSync } from 'child_process';
import { join } from 'path';

describe('deal creation against PostgreSQL', () => {
  it('creates and links a WhatsApp deal, then reuses it without changing its value', () => {
    // Run outside Jest's VM, as in the migration tests, so PGlite can load its WASM.
    // Prisma talks to the in-memory database over the real PostgreSQL wire protocol.
    const script = `
      require('reflect-metadata');
      const assert = require('assert/strict');
      const { execFileSync } = require('child_process');
      const { PGlite } = require('@electric-sql/pglite');
      const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
      const { PrismaClient } = require('@prisma/client');
      const { LeadsService } = require('./src/leads/leads.service');
      (async () => {
        const db = await PGlite.create();
        const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 });
        let prisma;
        try {
          const sql = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' });
          await db.exec(sql);
          await server.start();
          prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgres@' + server.getServerConn() + '/postgres?connection_limit=1&sslmode=disable' } } });
          const staff = await prisma.user.create({ data: { email: 'fictional@example.org', passwordHash: 'unused-fixture', firstName: 'Fictional', lastName: 'Staff', role: 'SALES_CONSULTANT' } });
          const user = { sub: staff.id, email: staff.email, role: staff.role };
          const service = new LeadsService(prisma, {});
          const chat = await prisma.conversation.create({ data: { channel: 'WHATSAPP', externalThreadId: '447700900123@s.whatsapp.net', whatsappSessionId: 'user:' + staff.id, assignedToId: staff.id } });
          const input = { firstName: 'Fictional', source: 'WHATSAPP', currency: 'EUR', estimatedValue: 2500, conversationId: chat.id };
          const created = await service.create(input, user);
          assert.equal(created.reusedExisting, false);
          assert.equal(created.phone, '447700900123');
          assert.equal(created.whatsappNumber, '447700900123');
          assert.equal(created.assignedTo.id, staff.id);
          assert.equal(created.estimatedValue.toString(), '2500');
          assert.equal((await prisma.conversation.findUnique({ where: { id: chat.id } })).leadId, created.id);
          const reused = await service.create({ ...input, estimatedValue: 9999 }, user);
          assert.equal(reused.id, created.id);
          assert.equal(reused.reusedExisting, true);
          assert.equal(reused.estimatedValue.toString(), '2500');
          assert.equal(await prisma.lead.count(), 1);
          const manual = await service.create({ firstName: 'Manual', source: 'OTHER', currency: 'USD' }, user);
          assert.equal(manual.assignedTo.id, staff.id);
          assert.equal(manual.estimatedValue, null);
        } finally {
          if (prisma) await prisma.$disconnect();
          await server.stop();
          await db.close();
        }
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    execFileSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', script], {
      cwd: join(__dirname, '../..'),
      env: { ...process.env, TS_NODE_PROJECT: 'tsconfig.json' },
      timeout: 30000,
      stdio: 'pipe',
    });
  });
});
