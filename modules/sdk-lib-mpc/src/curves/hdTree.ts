export type PublicKeychain = {
  // public key
  pk: bigint;
  chaincode: bigint;
};

export type PrivateKeychain = PublicKeychain & {
  // secret key
  sk: bigint;
  prefix?: bigint;
};

export interface HDTree {
  publicDerive(keychain: PublicKeychain, path: string): PublicKeychain;

  privateDerive(keychain: PrivateKeychain, path: string): PrivateKeychain;
}

export function pathToIndices(path: string): number[] {
  return path
    .replace(/^m?\//, '')
    .split('/')
    .map((index) => parseInt(index, 10));
}
