import { createLogger } from '@job-copilot/shared';
import { execa } from 'execa';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('credentials:provider');

export interface CredentialRef {
  id: string;
  provider: 'onepassword' | 'keychain' | 'vault';
  vaultName?: string;
  itemId?: string;
}

export interface StoredCredential {
  id: string;
  username: string;
  password: string;
  createdAt: Date;
  lastUsedAt?: Date;
}

export abstract class CredentialProvider {
  abstract name: string;

  abstract store(
    id: string,
    username: string,
    password: string
  ): Promise<CredentialRef>;

  abstract retrieve(ref: CredentialRef): Promise<{ username: string; password: string } | null>;

  abstract delete(ref: CredentialRef): Promise<void>;

  abstract generatePassword(): Promise<string>;
}

export class OnePasswordProvider extends CredentialProvider {
  name = '1Password';

  constructor(private serviceAccountToken: string) {
    super();
  }

  async store(id: string, username: string, password: string): Promise<CredentialRef> {
    logger.info({ id }, 'Storing credential in 1Password');

    try {
      // Create item in 1Password
      const itemName = `job-copilot-${id}`;
      const itemJson = {
        title: itemName,
        category: 'LOGIN',
        sections: [
          {
            fields: [
              {
                id: 'username',
                type: 'T',
                value: username,
              },
              {
                id: 'password',
                type: 'P',
                value: password,
              },
            ],
          },
        ],
      };

      // Use 1Password CLI if available
      try {
        await execa('op', ['item', 'create', JSON.stringify(itemJson)], {
          env: {
            OP_SERVICE_ACCOUNT_TOKEN: this.serviceAccountToken,
          },
        });

        logger.info({ id }, '1Password: Credential stored');

        return {
          id,
          provider: 'onepassword',
          vaultName: 'Private',
          itemId: itemName,
        };
      } catch (error) {
        logger.warn(
          { error },
          '1Password CLI not available, falling back to vault'
        );

        // Fallback to vault
        return this.fallbackToVault(id, username, password);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to store credential');
      throw error;
    }
  }

  async retrieve(
    ref: CredentialRef
  ): Promise<{ username: string; password: string } | null> {
    logger.info({ ref }, 'Retrieving credential from 1Password');

    try {
      if (!ref.itemId) {
        return null;
      }

      const result = await execa(
        'op',
        ['item', 'get', ref.itemId, '--format=json'],
        {
          env: {
            OP_SERVICE_ACCOUNT_TOKEN: this.serviceAccountToken,
          },
        }
      );

      const item = JSON.parse(result.stdout);
      const section = item.sections[0];

      const username = section.fields.find((f: any) => f.id === 'username')?.value;
      const password = section.fields.find((f: any) => f.id === 'password')?.value;

      if (!username || !password) {
        return null;
      }

      logger.info({ id: ref.id }, '1Password: Credential retrieved');

      return { username, password };
    } catch (error) {
      logger.error({ error }, 'Failed to retrieve credential');
      return null;
    }
  }

  async delete(ref: CredentialRef): Promise<void> {
    logger.info({ ref }, 'Deleting credential from 1Password');

    try {
      if (ref.itemId) {
        await execa('op', ['item', 'delete', ref.itemId], {
          env: {
            OP_SERVICE_ACCOUNT_TOKEN: this.serviceAccountToken,
          },
        });

        logger.info({ id: ref.id }, '1Password: Credential deleted');
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to delete credential from 1Password');
    }
  }

  async generatePassword(): Promise<string> {
    // Generate 16-character password with mixed case, numbers, symbols
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private async fallbackToVault(
    id: string,
    username: string,
    password: string
  ): Promise<CredentialRef> {
    const vaultDir = path.join(process.cwd(), '.credentials');
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true, mode: 0o700 });
    }

    const encryptionKey = process.env.ENCRYPTION_KEY || 'default-key';
    const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
    let encrypted = cipher.update(JSON.stringify({ username, password }), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const vaultPath = path.join(vaultDir, `${id}.enc`);
    fs.writeFileSync(vaultPath, encrypted, { mode: 0o600 });

    logger.info({ id, vaultPath }, 'Credential stored in vault');

    return {
      id,
      provider: 'vault',
      vaultName: vaultPath,
    };
  }
}

export class KeychainProvider extends CredentialProvider {
  name = 'macOS Keychain';

  async store(id: string, username: string, password: string): Promise<CredentialRef> {
    logger.info({ id }, 'Storing credential in Keychain');

    try {
      // Use security command on macOS
      const service = `job-copilot-${id}`;

      await execa('security', [
        'add-generic-password',
        '-s',
        service,
        '-a',
        username,
        '-p',
        password,
        '-w',
        '-',
      ]);

      logger.info({ id }, 'Keychain: Credential stored');

      return {
        id,
        provider: 'keychain',
        itemId: service,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to store in Keychain');
      throw error;
    }
  }

  async retrieve(
    ref: CredentialRef
  ): Promise<{ username: string; password: string } | null> {
    logger.info({ ref }, 'Retrieving credential from Keychain');

    try {
      if (!ref.itemId) {
        return null;
      }

      // Get password
      const passwordResult = await execa('security', [
        'find-generic-password',
        '-s',
        ref.itemId,
        '-w',
      ]);

      const password = passwordResult.stdout.trim();

      // Get username
      const usernameResult = await execa('security', [
        'find-generic-password',
        '-s',
        ref.itemId,
        '-g',
      ]);

      const match = usernameResult.stderr.match(/acct<blob>="(.+?)"/);
      const username = match ? match[1] : '';

      if (!username || !password) {
        return null;
      }

      logger.info({ id: ref.id }, 'Keychain: Credential retrieved');

      return { username, password };
    } catch (error) {
      logger.error({ error }, 'Failed to retrieve from Keychain');
      return null;
    }
  }

  async delete(ref: CredentialRef): Promise<void> {
    logger.info({ ref }, 'Deleting credential from Keychain');

    try {
      if (ref.itemId) {
        await execa('security', ['delete-generic-password', '-s', ref.itemId]);

        logger.info({ id: ref.id }, 'Keychain: Credential deleted');
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to delete from Keychain');
    }
  }

  async generatePassword(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}

export class VaultProvider extends CredentialProvider {
  name = 'Encrypted Local Vault';

  constructor(private encryptionKey: string = process.env.ENCRYPTION_KEY || 'default-key') {
    super();
  }

  async store(id: string, username: string, password: string): Promise<CredentialRef> {
    logger.info({ id }, 'Storing credential in vault');

    const vaultDir = path.join(process.cwd(), '.credentials');
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true, mode: 0o700 });
    }

    try {
      const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
      let encrypted = cipher.update(
        JSON.stringify({ username, password }),
        'utf8',
        'hex'
      );
      encrypted += cipher.final('hex');

      const vaultPath = path.join(vaultDir, `${id}.enc`);
      fs.writeFileSync(vaultPath, encrypted, { mode: 0o600 });

      logger.info({ id, vaultPath }, 'Vault: Credential stored');

      return {
        id,
        provider: 'vault',
        vaultName: vaultPath,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to store in vault');
      throw error;
    }
  }

  async retrieve(
    ref: CredentialRef
  ): Promise<{ username: string; password: string } | null> {
    logger.info({ ref }, 'Retrieving credential from vault');

    try {
      if (!ref.vaultName) {
        return null;
      }

      if (!fs.existsSync(ref.vaultName)) {
        logger.warn({ path: ref.vaultName }, 'Vault file not found');
        return null;
      }

      const encrypted = fs.readFileSync(ref.vaultName, 'utf8');
      const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const { username, password } = JSON.parse(decrypted);

      logger.info({ id: ref.id }, 'Vault: Credential retrieved');

      return { username, password };
    } catch (error) {
      logger.error({ error }, 'Failed to retrieve from vault');
      return null;
    }
  }

  async delete(ref: CredentialRef): Promise<void> {
    logger.info({ ref }, 'Deleting credential from vault');

    try {
      if (ref.vaultName && fs.existsSync(ref.vaultName)) {
        fs.unlinkSync(ref.vaultName);
        logger.info({ id: ref.id }, 'Vault: Credential deleted');
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to delete from vault');
    }
  }

  async generatePassword(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}

export class CredentialProviderFactory {
  static create(provider: string): CredentialProvider {
    switch (provider) {
      case '1password':
        return new OnePasswordProvider(process.env.ONEPASSWORD_SERVICE_ACCOUNT_TOKEN || '');
      case 'keychain':
        return new KeychainProvider();
      case 'vault':
      default:
        return new VaultProvider();
    }
  }
}
