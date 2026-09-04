// Testes de `T-05.15` — `sha256Hex` contra os vetores PUBLICADOS de FIPS 180-4 (nao inventados
// aqui), mais os controles positivo/negativo que `ADR-008/DoD-2` exige de qualquer instrumento
// de fingerprint. A paridade byte-a-byte com o SHA-256 do backend real (Python `hashlib`) e
// coberta por `ingest-health-query-http.test.ts` ("CALA F-D6-1"/"MORDE F-D6-1"), que roda os
// dois lados sobre o MESMO estado — este arquivo prova o algoritmo isolado, sem servidor.
//
// Run with: npm --prefix frontend run test:s1 (ou node --test 'src/features/s1-console/*.test.ts')

import assert from "node:assert/strict";
import { test } from "node:test";

import { sha256Hex } from "./sha256.ts";

test("sha256Hex: string vazia bate o vetor publicado FIPS 180-4", () => {
  assert.equal(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("sha256Hex: \"abc\" bate o vetor publicado FIPS 180-4", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("sha256Hex: mensagem de 2 blocos (>= 56 bytes) bate o vetor publicado FIPS 180-4", () => {
  // NIST's "two-block message" sample, 56 ASCII bytes -- exercises the padding branch that
  // spills the length field into a SECOND 64-byte chunk (56 + 1 + 8 = 65 > 64).
  assert.equal(
    sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
});

test("sha256Hex: caracter nao-ASCII usa a codificacao UTF-8, nao UTF-16", () => {
  // "é" is 2 UTF-8 bytes (0xC3 0xA9) but 1 UTF-16 code unit -- a wrong encoding step would
  // silently hash the wrong bytes without throwing.
  assert.equal(
    sha256Hex("é"),
    "4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c",
  );
});

test("sha256Hex: MESMA entrada produz o MESMO digest, duas vezes", () => {
  assert.equal(sha256Hex("ingest_health_query"), sha256Hex("ingest_health_query"));
});

test("sha256Hex: entrada diferente MOVE o digest -- controle negativo, D7.17 nao e vacuo", () => {
  assert.notEqual(sha256Hex("a"), sha256Hex("b"));
});
