import { join } from 'node:path';
import { addTester, readTesterFile, revokeTester, writeTesterFile } from './testers.js';

const path = process.env.TESTERS_FILE || join(process.cwd(), 'testers.json');
const [command, name, ...rest] = process.argv.slice(2);

function option(flag: string): number | undefined {
  const index = rest.indexOf(flag);
  if (index < 0) return undefined;
  const value = Number(rest[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} needs a positive whole number.`);
  return value;
}

function usage(): void {
  console.log(`Usage:
  npm run testers -- add <name> [--days 90] [--daily 5]   create a code (shown once)
  npm run testers -- revoke <name>                        disable a tester's code
  npm run testers -- list                                 show testers and status

File: ${path}`);
}

try {
  const file = readTesterFile(path);
  if (command === 'add' && name) {
    const result = addTester(file, name, { days: option('--days'), dailyLimit: option('--daily') });
    writeTesterFile(path, result.file);
    const entry = result.file.testers.at(-1)!;
    console.log(`Tester code for ${name} (expires ${entry.expiresAt.slice(0, 10)}, ${entry.dailyLimit} trusted reports/day):\n\n  ${result.token}\n\nIt is stored only as a hash - send it to the tester now; it cannot be shown again.`);
  } else if (command === 'revoke' && name) {
    writeTesterFile(path, revokeTester(file, name));
    console.log(`Revoked ${name}. The running server picks this up on the next report.`);
  } else if (command === 'list') {
    if (!file.testers.length) console.log('No testers yet.');
    const now = Date.now();
    for (const tester of file.testers) {
      const status = tester.revokedAt ? `revoked ${tester.revokedAt.slice(0, 10)}`
        : Date.parse(tester.expiresAt) <= now ? `expired ${tester.expiresAt.slice(0, 10)}`
        : `active until ${tester.expiresAt.slice(0, 10)}`;
      console.log(`${tester.name.padEnd(20)} ${status.padEnd(28)} ${tester.dailyLimit}/day`);
    }
  } else {
    usage();
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
