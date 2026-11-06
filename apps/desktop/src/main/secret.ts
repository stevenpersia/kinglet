import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { safeStorage } from 'electron';

interface Stored {
  value: string;
  encrypted: boolean;
}

/** A secret in a file readable by you only, encrypted by the system keyring when there is one (like the GitHub token). */
export const secretFile = {
  read(file: string): string | null {
    if (!existsSync(file)) return null;
    const s = JSON.parse(readFileSync(file, 'utf8')) as Stored;
    return s.encrypted ? safeStorage.decryptString(Buffer.from(s.value, 'base64')) : s.value;
  },
  write(file: string, value: string) {
    const encrypted = safeStorage.isEncryptionAvailable();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ value: encrypted ? safeStorage.encryptString(value).toString('base64') : value, encrypted } satisfies Stored), { mode: 0o600 });
    chmodSync(file, 0o600);
  },
  remove(file: string) {
    rmSync(file, { force: true });
  },
};
