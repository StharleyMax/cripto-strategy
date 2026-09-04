/**
 * `T-05.15` — a dependency-free, synchronous SHA-256 (FIPS 180-4), so `fingerprint()`
 * (`ingest-health-query.ts`) never needs `node:crypto`'s `createHash` — the ONLY reason that
 * import existed in this module. `DoD D5.15` requires ZERO `node:`-prefixed imports under
 * `frontend/src/` (except `app/threshold-spec-bundle.ts`, out of this task's scope), and
 * `ADR-005/D6.4` (fixed forward by `T-05.16`) requires `fingerprint` to STAY SYNCHRONOUS —
 * ruling out `crypto.subtle.digest`, which is `Promise`-returning BY SPEC (the Web Crypto API
 * has no synchronous digest, in Node or in the browser). A hand-rolled, pure-JS
 * implementation is synchronous BY CONSTRUCTION in both runtimes, so it satisfies both
 * constraints at once instead of trading one for the other.
 *
 * Correctness is NOT asserted here in prose — `sha256.test.ts` pins the two published FIPS
 * 180-4 test vectors (`sha256("")`, `sha256("abc")`), and `ingest-health-query-http.test.ts`'s
 * "CALA F-D6-1"/"MORDE F-D6-1" pair independently cross-checks this module's `fingerprint()`
 * output against `IngestHealthReport.fingerprint()` computed by the REAL backend process over
 * the SAME bytes (`ADR-008/DoD-2`) — a wrong digit here fails that comparison, not just a
 * unit test in isolation.
 */

const ROUND_CONSTANTS: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const INITIAL_HASH: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

function rightRotate(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/**
 * Pad the UTF-8 bytes per FIPS 180-4 §5.1.1: a single `1` bit, `0` bits until the length is
 * 448 mod 512 (56 mod 64 bytes), then the ORIGINAL bit-length as a 64-bit big-endian integer.
 * `bitLength` never exceeds `Number.MAX_SAFE_INTEGER` for any payload this module handles
 * (`ingest_health_query`'s canonical projection is at most a few MB of JSON), so the high 32
 * bits of the length are always `0` here — correct for this module's inputs, not a claim of
 * general-purpose 64-bit support.
 */
function padMessage(bytes: Uint8Array): Uint8Array {
  const bitLength = bytes.length * 8;
  const withHeaderAndLength = bytes.length + 1 + 8; // the `0x80` byte + the 8-byte length field
  const paddedLength = Math.ceil(withHeaderAndLength / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  return padded;
}

/**
 * SHA-256 over the UTF-8 encoding of `input`, as a lowercase 64-character hex string — the
 * exact shape `createHash("sha256").update(input, "utf8").digest("hex")` used to produce.
 */
export function sha256Hex(input: string): string {
  const padded = padMessage(new TextEncoder().encode(input));
  const view = new DataView(padded.buffer);

  const hash = INITIAL_HASH.slice();
  const w = new Array<number>(64).fill(0);

  for (let chunkStart = 0; chunkStart < padded.length; chunkStart += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(chunkStart + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (let i = 0; i < 64; i += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + ROUND_CONSTANTS[i] + w[i]) >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}
