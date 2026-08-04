import { AUDIT_RULES, actionFor, redact, ruleFor } from './audit.registry';

describe('ruleFor', () => {
  it('covers the clinical record', () => {
    expect(ruleFor('patients/:id', 'PATCH')?.entityType).toBe('Patient');
    expect(ruleFor('treatment-plans/:id', 'PATCH')?.entityType).toBe('TreatmentPlan');
    expect(ruleFor('appointments/:id', 'DELETE')?.entityType).toBe('Appointment');
    expect(ruleFor('lab-orders', 'POST')?.entityType).toBe('LabOrder');
  });

  it('covers money and access', () => {
    expect(ruleFor('invoices/:id', 'PATCH')?.entityType).toBe('Invoice');
    // A role change is the most consequential edit in the system.
    expect(ruleFor('users/:id', 'PATCH')?.entityType).toBe('User');
    expect(ruleFor('settings', 'PATCH')?.entityType).toBe('ClinicSettings');
  });

  it('covers file deletion, which is a radiograph leaving the record', () => {
    expect(ruleFor('files/:id', 'DELETE')?.entityType).toBe('File');
  });

  it('ignores reads', () => {
    // A trail that records every page view is one nobody can search.
    expect(ruleFor('patients/:id', 'GET')).toBeUndefined();
    expect(ruleFor('treatment-plans', 'GET')).toBeUndefined();
  });

  it('ignores the routes that are audited elsewhere or have no actor', () => {
    // AuthService writes its own rows — it has the user before the guard does.
    expect(ruleFor('auth/login', 'POST')).toBeUndefined();
    // Public and unauthenticated: nobody to attribute the change to.
    expect(ruleFor('intake', 'POST')).toBeUndefined();
    expect(ruleFor('portal/:token/approve', 'POST')).toBeUndefined();
    // Drafts. Nothing is persisted until a human saves it on an audited route.
    expect(ruleFor('ai/assistant', 'POST')).toBeUndefined();
    // Already a durable row carrying its own sender.
    expect(ruleFor('conversations/:id/messages', 'POST')).toBeUndefined();
  });

  it('matches whether or not the path carries the global prefix', () => {
    // Nest reports `req.route.path` without the prefix and `req.path` with it.
    expect(ruleFor('/api/patients/:id', 'PATCH')?.entityType).toBe('Patient');
    expect(ruleFor('patients/:id', 'PATCH')?.entityType).toBe('Patient');
    expect(ruleFor('/patients/:id/', 'PATCH')?.entityType).toBe('Patient');
  });

  it('does not match a route that merely starts with an audited word', () => {
    // `patients-export` is not `patients`.
    expect(ruleFor('patients-export', 'POST')).toBeUndefined();
  });
});

describe('actionFor', () => {
  it('maps the verb to the enum', () => {
    expect(actionFor('POST')).toBe('CREATE');
    expect(actionFor('PATCH')).toBe('UPDATE');
    expect(actionFor('PUT')).toBe('UPDATE');
    expect(actionFor('DELETE')).toBe('DELETE');
  });

  it('lets a rule override the verb, for POSTs that are commands not creations', () => {
    const rule = ruleFor('users/:id/reset-password', 'POST');
    expect(actionFor('POST', rule)).toBe('UPDATE');
  });
});

describe('command routes are not recorded as creations', () => {
  // Found in production: the first seven real password resets were written to the trail as
  // "CREATE User", because the action was derived from the HTTP verb alone. An audit trail that
  // describes the wrong thing is worse than one with a gap — a gap is visibly a gap.
  const commands: Array<[string, string]> = [
    ['users/:id/reset-password', 'POST'],
    ['users/:id/revoke-sessions', 'POST'],
    ['users/:id/activate', 'PATCH'],
    ['leads/duplicates/merge', 'POST'],
    ['leads/:id/convert', 'POST'],
    ['invoices/:id/payments', 'POST'],
    ['treatment-plans/:id/share-link', 'POST'],
  ];

  it.each(commands)('%s %s is an UPDATE', (path, method) => {
    const rule = ruleFor(path, method);
    expect(rule).toBeDefined();
    expect(actionFor(method, rule)).toBe('UPDATE');
  });

  it('still records a genuine creation as CREATE', () => {
    // The override must not swallow the ordinary case — these sit above the entity-wide rules in
    // the list, and `ruleFor` takes the first match.
    expect(actionFor('POST', ruleFor('users', 'POST'))).toBe('CREATE');
    expect(actionFor('POST', ruleFor('treatment-plans', 'POST'))).toBe('CREATE');
    expect(actionFor('POST', ruleFor('invoices', 'POST'))).toBe('CREATE');
    expect(actionFor('POST', ruleFor('leads', 'POST'))).toBe('CREATE');
  });

  it('still records a deletion as DELETE', () => {
    expect(actionFor('DELETE', ruleFor('files/:id', 'DELETE'))).toBe('DELETE');
    expect(actionFor('DELETE', ruleFor('users/:id', 'DELETE'))).toBe('DELETE');
  });

  it('keeps the entity id, so the row names which account was reset', () => {
    expect(ruleFor('users/:id/reset-password', 'POST')?.idParam).toBe(':id');
  });
});

describe('redact', () => {
  it('removes a password so it is not stored a second time in clear', () => {
    // POST /users carries a plaintext password that is bcrypt-hashed before storage. Copying it
    // into an audit row — a table read by more people than `users` — would undo that entirely.
    expect(redact({ email: 'a@b.com', password: 'hunter2' })).toEqual({
      email: 'a@b.com',
      password: '[redacted]',
    });
  });

  it('matches the key however it is cased', () => {
    expect(redact({ newPassword: 'x', RefreshToken: 'y' })).toEqual({
      newPassword: '[redacted]',
      RefreshToken: '[redacted]',
    });
  });

  it('reaches into nested objects and arrays', () => {
    expect(redact({ users: [{ name: 'A', password: 'p' }] })).toEqual({
      users: [{ name: 'A', password: '[redacted]' }],
    });
  });

  it('keeps everything else, because the change is the point of the row', () => {
    const body = { totalCost: 12000, currency: 'USD', items: [{ tooth: 11 }] };
    expect(redact(body)).toEqual(body);
  });

  it('truncates rather than recursing forever on a deeply nested body', () => {
    // Request bodies are user input. A pathological one should cost a truncated audit row, not a
    // stack overflow inside an interceptor that runs on every write.
    let deep: Record<string, unknown> = { end: true };
    for (let i = 0; i < 50; i++) deep = { nested: deep };
    expect(() => redact(deep)).not.toThrow();
    expect(JSON.stringify(redact(deep))).toContain('[truncated]');
  });

  it('handles the empty and primitive cases', () => {
    expect(redact(undefined)).toBeUndefined();
    expect(redact(null)).toBeNull();
    expect(redact('plain')).toBe('plain');
  });
});

describe('AUDIT_RULES', () => {
  it('names an entity type for every rule, since that is what the trail is searched by', () => {
    for (const rule of AUDIT_RULES) {
      expect(rule.entityType).toBeTruthy();
      expect(rule.methods.length).toBeGreaterThan(0);
      expect(rule.methods).not.toContain('GET');
    }
  });
});
