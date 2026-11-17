import assert from 'node:assert';
import { canWrite, isReadOnlyRole } from '../lib/roles.ts';

// Test known roles
const roles = [
  { role: 'admin', expectedReadOnly: false, expectedCanWrite: true },
  { role: 'ops_manager', expectedReadOnly: false, expectedCanWrite: true },
  { role: 'staff_executive', expectedReadOnly: false, expectedCanWrite: true },
  { role: 'nearbi_homes_supervisor', expectedReadOnly: false, expectedCanWrite: true },
  { role: 'kiosk', expectedReadOnly: false, expectedCanWrite: true },
  { role: 'staff', expectedReadOnly: false, expectedCanWrite: true },
  { role: 'daily_hr', expectedReadOnly: false, expectedCanWrite: true },
  { role: 'hyper_hr', expectedReadOnly: false, expectedCanWrite: true },
  { role: 'partner_viewer', expectedReadOnly: true, expectedCanWrite: false },
  { role: null, expectedReadOnly: false, expectedCanWrite: false },
  { role: undefined, expectedReadOnly: false, expectedCanWrite: false },
  { role: '', expectedReadOnly: false, expectedCanWrite: false },
];

console.log('--- Running canWrite / isReadOnlyRole unit tests ---');
let passed = 0;
for (const tc of roles) {
  const ro = isReadOnlyRole(tc.role);
  const cw = canWrite(tc.role);
  assert.strictEqual(ro, tc.expectedReadOnly, `isReadOnlyRole(${tc.role}) expected ${tc.expectedReadOnly}, got ${ro}`);
  assert.strictEqual(cw, tc.expectedCanWrite, `canWrite(${tc.role}) expected ${tc.expectedCanWrite}, got ${cw}`);
  console.log(`✓ role: ${String(tc.role).padEnd(25)} -> isReadOnly: ${String(ro).padEnd(5)} | canWrite: ${cw}`);
  passed++;
}

console.log(`All ${passed} test cases passed successfully!`);
