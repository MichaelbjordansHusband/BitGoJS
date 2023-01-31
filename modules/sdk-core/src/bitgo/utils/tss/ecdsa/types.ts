import { ECDSA } from '../../../../account-lib/mpc/tss';
import { ECDSAMethodTypes } from '../../../tss/ecdsa';
import { BackupKeyShare, CreateKeychainParamsBase, backupGpgKey } from '../baseTypes';
import { Key } from 'openpgp';
import { BackupProvider } from '../../../wallet';

export type KeyShare = ECDSA.KeyShare;
export type DecryptableNShare = ECDSAMethodTypes.DecryptableNShare;

export type CreateEcdsaKeychainParams = CreateKeychainParamsBase & {
  userKeyShare: ECDSA.KeyShare;
  backupKeyShare: BackupKeyShare;
  isThirdPartyBackup?: boolean;
  backupProvider?: BackupProvider;
  bitgoPublicGpgKey: Key;
  backupGpgKey: backupGpgKey;
};

export type CreateEcdsaBitGoKeychainParams = Omit<CreateEcdsaKeychainParams, 'bitgoKeychain'>;
