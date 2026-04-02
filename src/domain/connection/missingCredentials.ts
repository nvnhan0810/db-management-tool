import type { DatabaseConnection } from '@/domain/connection/types';

export type MissingCredentialFlags = {
  needDbPassword: boolean;
  needSshAuth: boolean;
};

/**
 * Detects secrets that were never stored (or empty after load) for a saved profile.
 * SSH tunnel requires either password or private key.
 */
export function computeMissingCredentials(
  sshEnabled: boolean,
  decrypted: Pick<DatabaseConnection, 'password' | 'ssh'>
): MissingCredentialFlags {
  const needDbPassword = !String(decrypted.password ?? '').trim();
  const needSshAuth =
    sshEnabled &&
    !String(decrypted.ssh?.password ?? '').trim() &&
    !String(decrypted.ssh?.privateKey ?? '').trim();
  return { needDbPassword, needSshAuth };
}
