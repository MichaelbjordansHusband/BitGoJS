/**
 * Zero Knowledge Range Proofs as described in (Two-party generation of DSA signatures)[1].
 * [1]: https://reitermk.github.io/papers/2004/IJIS.pdf
 */
import { createHash } from 'crypto';
import BaseCurve from '../../curves';
import { PublicKey } from 'paillier-bigint';
import { bitLength, primeSync, randBitsSync, randBetween } from 'bigint-crypto-utils';
import { gcd, modPow } from 'bigint-mod-arith';
import { NTilde, RangeProof, RangeProofWithCheck } from './types';
import { bigIntFromBufferBE, bigIntToBufferBE } from '../../util';

function generateModulus(bitlength: number): bigint {
  let n, p, q;
  do {
    p = primeSync(Math.floor(bitlength / 2) + 1);
    q = primeSync(Math.floor(bitlength / 2));
    n = p * q;
  } while (q === p || bitLength(n) !== bitlength);
  return n;
}

export function randomCoPrimeTo(x: bigint): bigint {
  while (true) {
    const y = bigIntFromBufferBE(Buffer.from(randBitsSync(bitLength(x), true)));
    if (y > BigInt(0) && gcd(x, y) === BigInt(1)) {
      return y;
    }
  }
}

/**
 * Generate "challenge" values for range proofs.
 * @param {number} bitlength The bit length of the modulus to generate. This should
 * be the same as the bit length of the paillier public keys used for MtA.
 * @returns {NTilde} The generated NTilde values.
 */
export function generateNTilde(bitlength: number): NTilde {
  const ntilde = generateModulus(bitlength);
  const f1 = randomCoPrimeTo(ntilde);
  const f2 = randomCoPrimeTo(ntilde);
  const h1 = modPow(f1, BigInt(2), ntilde);
  const h2 = modPow(f2, BigInt(2), ntilde);
  return { ntilde, h1, h2 };
}

/**
 * Generate a zero-knowledge range proof that an encrypted value is "small".
 * @param {BaseCurve} curve An elliptic curve to use for group operations.
 * @param {PublicKey} pk The prover's public key.
 * @param {NTilde} ntilde The verifier's NTilde values.
 * @param {bigint} c The ciphertext.
 * @param {bigint} m The plaintext.
 * @param {bigint} r The obfuscation value used to encrypt m.
 * @returns {RangeProof} The generated proof.
 */
export function prove(curve: BaseCurve, pk: PublicKey, ntilde: NTilde, c: bigint, m: bigint, r: bigint): RangeProof {
  const q = curve.order();
  const q3 = q ** BigInt(3);
  const qntilde = q * ntilde.ntilde;
  const q3ntilde = q3 * ntilde.ntilde;
  const alpha = randBetween(q3);
  const beta = randomCoPrimeTo(pk.n);
  const gamma = randBetween(q3ntilde);
  const rho = randBetween(qntilde);
  const z = (modPow(ntilde.h1, m, ntilde.ntilde) * modPow(ntilde.h2, rho, ntilde.ntilde)) % ntilde.ntilde;
  const u = (modPow(pk.g, alpha, pk._n2) * modPow(beta, pk.n, pk._n2)) % pk._n2;
  const w = (modPow(ntilde.h1, alpha, ntilde.ntilde) * modPow(ntilde.h2, gamma, ntilde.ntilde)) % ntilde.ntilde;
  const hash = createHash('sha256');
  hash.update('\x06\x00\x00\x00\x00\x00\x00\x00');
  hash.update(bigIntToBufferBE(pk.n));
  hash.update('$');
  hash.update(bigIntToBufferBE(pk.g));
  hash.update('$');
  hash.update(bigIntToBufferBE(c));
  hash.update('$');
  hash.update(bigIntToBufferBE(z));
  hash.update('$');
  hash.update(bigIntToBufferBE(u));
  hash.update('$');
  hash.update(bigIntToBufferBE(w));
  hash.update('$');
  const e = bigIntFromBufferBE(hash.digest()) % q;
  const s = (modPow(r, e, pk.n) * beta) % pk.n;
  const s1 = e * m + alpha;
  const s2 = e * rho + gamma;
  return { z, u, w, s, s1, s2 };
}

/**
 * Verify a zero-knowledge range proof that an encrypted value is "small".
 * @param {BaseCurve} curve An elliptic curve to use for group operations.
 * @param {PublicKey} pk The prover's public key.
 * @param {NTilde} ntilde The verifier's NTilde values.
 * @param {RangeProof} proof The range proof.
 * @param {bigint} c The ciphertext.
 * @returns {boolean} True if verification succeeds.
 */
export function verify(curve: BaseCurve, pk: PublicKey, ntilde: NTilde, proof: RangeProof, c: bigint): boolean {
  const q = curve.order();
  const q3 = q ** BigInt(3);
  if (proof.s1 == q3) {
    return false;
  }
  const hash = createHash('sha256');
  hash.update('\x06\x00\x00\x00\x00\x00\x00\x00');
  hash.update(bigIntToBufferBE(pk.n));
  hash.update('$');
  hash.update(bigIntToBufferBE(pk.g));
  hash.update('$');
  hash.update(bigIntToBufferBE(c));
  hash.update('$');
  hash.update(bigIntToBufferBE(proof.z));
  hash.update('$');
  hash.update(bigIntToBufferBE(proof.u));
  hash.update('$');
  hash.update(bigIntToBufferBE(proof.w));
  hash.update('$');
  const e = bigIntFromBufferBE(hash.digest()) % q;
  let products: bigint;
  products = (modPow(pk.g, proof.s1, pk._n2) * modPow(proof.s, pk.n, pk._n2) * modPow(c, -e, pk._n2)) % pk._n2;
  if (proof.u !== products) {
    return false;
  }
  products =
    (((modPow(ntilde.h1, proof.s1, ntilde.ntilde) * modPow(ntilde.h2, proof.s2, ntilde.ntilde)) % ntilde.ntilde) *
      modPow(proof.z, -e, ntilde.ntilde)) %
    ntilde.ntilde;
  if (proof.w !== products) {
    return false;
  }
  return true;
}

/**
 * Generate a zero-knowledge range proof that a homomorphically manipulated value is "small".
 * @param {BaseCurve} curve An elliptic curve to use for group operations.
 * @param {PublicKey} pk The prover's public key.
 * @param {NTilde} ntilde The verifier's NTilde values.
 * @param {bigint} c1 The original ciphertext.
 * @param {bigint} c2 The manipulated ciphertext.
 * @param {bigint} x The plaintext value multiplied by the original plaintext.
 * @param {bigint} y The plaintext value that is added to x.
 * @param {bigint} r The obfuscation value used to encrypt x.
 * @param {bigint} X The curve's base point raised to x.
 * @returns {RangeProofWithCheck} The generated proof.
 */
export function proveWithCheck(
  curve: BaseCurve,
  pk: PublicKey,
  ntilde: NTilde,
  c1: bigint,
  c2: bigint,
  x: bigint,
  y: bigint,
  r: bigint,
  X: bigint
): RangeProofWithCheck {
  const q = curve.order();
  const q3 = q ** BigInt(3);
  const qntilde = q * ntilde.ntilde;
  const q3ntilde = q3 * ntilde.ntilde;
  const alpha = randBetween(q3);
  const rho = randBetween(qntilde);
  const sigma = randBetween(qntilde);
  const tau = randBetween(qntilde);
  const rhoprm = randBetween(q3ntilde);
  const beta = randomCoPrimeTo(pk.n);
  const gamma = randBetween(q3ntilde);
  const u = curve.basePointMult(curve.scalarReduce(alpha));
  const z = (modPow(ntilde.h1, x, ntilde.ntilde) * modPow(ntilde.h2, rho, ntilde.ntilde)) % ntilde.ntilde;
  const zprm = (modPow(ntilde.h1, alpha, ntilde.ntilde) * modPow(ntilde.h2, rhoprm, ntilde.ntilde)) % ntilde.ntilde;
  const t = (modPow(ntilde.h1, y, ntilde.ntilde) * modPow(ntilde.h2, sigma, ntilde.ntilde)) % ntilde.ntilde;
  const v =
    (((modPow(c1, alpha, pk._n2) * modPow(pk.g, gamma, pk._n2)) % pk._n2) * modPow(beta, pk.n, pk._n2)) % pk._n2;
  const w = (modPow(ntilde.h1, gamma, ntilde.ntilde) * modPow(ntilde.h2, tau, ntilde.ntilde)) % ntilde.ntilde;
  const hash = createHash('sha256');
  hash.update('\x0d\x00\x00\x00\x00\x00\x00\x00');
  hash.update(bigIntToBufferBE(pk.n));
  hash.update('$');
  hash.update(bigIntToBufferBE(pk.g));
  hash.update('$');
  hash.update(bigIntToBufferBE(X));
  hash.update('$');
  hash.update(bigIntToBufferBE(c1));
  hash.update('$');
  hash.update(bigIntToBufferBE(c2));
  hash.update('$');
  hash.update(bigIntToBufferBE(u));
  hash.update('$');
  hash.update(bigIntToBufferBE(z));
  hash.update('$');
  hash.update(bigIntToBufferBE(zprm));
  hash.update('$');
  hash.update(bigIntToBufferBE(t));
  hash.update('$');
  hash.update(bigIntToBufferBE(v));
  hash.update('$');
  hash.update(bigIntToBufferBE(w));
  hash.update('$');
  const e = bigIntFromBufferBE(hash.digest()) % q;
  const s = (modPow(r, e, pk.n) * beta) % pk.n;
  const s1 = e * x + alpha;
  const s2 = e * rho + rhoprm;
  const t1 = e * y + gamma;
  const t2 = e * sigma + tau;
  return { z, zprm, t, v, w, s, s1, s2, t1, t2, u };
}

/**
 * Verify a zero-knowledge range proof that a homomorphically manipulated value is "small".
 * @param {BaseCurve} curve An elliptic curve to use for group operations.
 * @param {PublicKey} pk The prover's public key.
 * @param {NTilde} ntilde The verifier's NTilde values.
 * @param {RangeProofWithCheck} proof The range proof.
 * @param {bigint} c1 The original ciphertext.
 * @param {bigint} c2 The manipulated ciphertext.
 * @param {bigint} X The curve's base point raised to x.
 * @returns {boolean} True if verification succeeds.
 */
export function verifyWithCheck(
  curve: BaseCurve,
  pk: PublicKey,
  ntilde: NTilde,
  proof: RangeProofWithCheck,
  c1: bigint,
  c2: bigint,
  X: bigint
): boolean {
  const q = curve.order();
  const q3 = q ** BigInt(3);
  if (proof.s1 == q3) {
    return false;
  }
  const hash = createHash('sha256');
  hash.update('\x0d\x00\x00\x00\x00\x00\x00\x00');
  hash.update(bigIntToBufferBE(pk.n));
  hash.update('$');
  hash.update(bigIntToBufferBE(pk.g));
  hash.update('$');
  hash.update(bigIntToBufferBE(X));
  hash.update('$');
  hash.update(bigIntToBufferBE(c1));
  hash.update('$');
  hash.update(bigIntToBufferBE(c2));
  hash.update('$');
  hash.update(bigIntToBufferBE(proof.u));
  hash.update('$');
  hash.update(bigIntToBufferBE(proof.z));
  hash.update('$');
  hash.update(bigIntToBufferBE(proof.zprm));
  hash.update('$');
  hash.update(bigIntToBufferBE(proof.t));
  hash.update('$');
  hash.update(bigIntToBufferBE(proof.v));
  hash.update('$');
  hash.update(bigIntToBufferBE(proof.w));
  hash.update('$');
  const e = bigIntFromBufferBE(hash.digest()) % q;
  const gS1 = curve.basePointMult(curve.scalarReduce(proof.s1));
  const xEU = curve.pointAdd(curve.pointMultiply(X, e), proof.u);
  if (gS1 != xEU) {
    return false;
  }
  let left, right;
  const h1ExpS1 = modPow(ntilde.h1, proof.s1, ntilde.ntilde);
  const h2ExpS2 = modPow(ntilde.h2, proof.s2, ntilde.ntilde);
  left = (h1ExpS1 * h2ExpS2) % ntilde.ntilde;
  const zExpE = modPow(proof.z, e, ntilde.ntilde);
  right = (zExpE * proof.zprm) % ntilde.ntilde;
  if (left !== right) {
    return false;
  }
  const h1ExpT1 = modPow(ntilde.h1, proof.t1, ntilde.ntilde);
  const h2ExpT2 = modPow(ntilde.h2, proof.t2, ntilde.ntilde);
  left = (h1ExpT1 * h2ExpT2) % ntilde.ntilde;
  const tExpE = modPow(proof.t, e, ntilde.ntilde);
  right = (tExpE * proof.w) % ntilde.ntilde;
  if (left !== right) {
    return false;
  }
  const c1ExpS1 = modPow(c1, proof.s1, pk._n2);
  const sExpN = modPow(proof.s, pk.n, pk._n2);
  const gammaExpT1 = modPow(pk.g, proof.t1, pk._n2);
  left = (((c1ExpS1 * sExpN) % pk._n2) * gammaExpT1) % pk._n2;
  const c2ExpE = modPow(c2, e, pk._n2);
  right = (c2ExpE * proof.v) % pk._n2;
  if (left !== right) {
    return false;
  }
  return true;
}
