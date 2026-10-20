import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { isEmail, isValidCnpj, isValidCpf, onlyDigits } from "./br.ts";

Deno.test("onlyDigits", () => {
  assertEquals(onlyDigits("046.305.964-61"), "04630596461");
  assertEquals(onlyDigits(undefined), "");
});

Deno.test("CPF", () => {
  assert(isValidCpf("046.305.964-61"));
  assert(isValidCpf("52601815906"));
  assertFalse(isValidCpf("12345678900"));
  assertFalse(isValidCpf("11111111111"));
  assertFalse(isValidCpf("0463059646"));
});

Deno.test("CNPJ", () => {
  assert(isValidCnpj("62.527.601/0001-04"));
  assert(isValidCnpj("55597971000152"));
  assertFalse(isValidCnpj("62.527.601/0001-00"));
  assertFalse(isValidCnpj("00000000000000"));
});

Deno.test("e-mail", () => {
  assert(isEmail("lucio@labvie.health"));
  assertFalse(isEmail("sem-arroba"));
  assertFalse(isEmail(42));
});
