"use strict";
// Math engine: evaluate(), formatNumber(), normalizeForEval(), getPreview().
// Run with `npm test` (or `node --test`). Pure logic — no DOM needed.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../calc.js");

// Helper: evaluate then format, the way '=' does.
const calc = (s) => C.formatNumber(C.evaluate(s));

test("evaluate: basic arithmetic", () => {
  const cases = [
    ["2+3", "5"],
    ["9−4", "5"],
    ["6×7", "42"],
    ["8÷2", "4"],
    ["10÷4", "2.5"],
  ];
  for (const [input, expected] of cases) assert.equal(calc(input), expected, input);
});

test("evaluate: operator precedence (× ÷ before + −)", () => {
  assert.equal(calc("2+3×4"), "14");
  assert.equal(calc("2×3+4"), "10");
  assert.equal(calc("20−2×5"), "10");
  assert.equal(calc("1+8÷2−1"), "4");
});

test("evaluate: parentheses override precedence", () => {
  assert.equal(calc("(2+3)×4"), "20");
  assert.equal(calc("16×(0.5+2.5)"), "48");
  assert.equal(calc("(1+2)×(3+4)"), "21");
  assert.equal(calc("((1+2))"), "3");
});

test("evaluate: unary minus / sign handling", () => {
  assert.equal(calc("−5+8"), "3");
  assert.equal(calc("2×−3"), "-6");
  assert.equal(calc("−(2+3)"), "-5");
});

test("evaluate: decimals", () => {
  assert.equal(calc("0.1+0.2"), "0.3"); // float noise hidden by formatNumber
  assert.equal(calc("1.5×2"), "3");
  assert.equal(calc("0.5+2.5"), "3");
});

test("evaluate: percent is ÷100 (v1 behavior)", () => {
  assert.equal(calc("50%"), "0.5");
  assert.equal(calc("100+10%"), "100.1"); // v2 will make this contextual (110)
  assert.equal(calc("200×10%"), "20");
});

test("evaluate: throws on malformed input", () => {
  for (const bad of ["", "+", "(", "1+", "()", "5+×"]) {
    assert.throws(() => C.evaluate(bad), undefined, `should throw: ${bad}`);
  }
});

test("evaluate: tolerates a unary sign after an operator (2++3 = 5)", () => {
  // The keypad can't produce this (typing an operator replaces a trailing one), but the
  // parser treats the second sign as unary rather than crashing.
  assert.equal(calc("2++3"), "5");
  assert.equal(calc("6−−2"), "8");
});

test("evaluate: division by zero is not finite → throws", () => {
  assert.throws(() => C.evaluate("5÷0"));
});

test("formatNumber: trims zeros, hides float noise, exponential fallback", () => {
  assert.equal(C.formatNumber(5), "5");
  assert.equal(C.formatNumber(2.5), "2.5");
  assert.equal(C.formatNumber(0.1 + 0.2), "0.3");
  assert.equal(C.formatNumber(Infinity), "");
  assert.equal(C.formatNumber(1e30).includes("e"), true);
});

test("normalizeForEval: strips trailing operators/dots/open-parens", () => {
  assert.equal(C.normalizeForEval("55+3−"), "55+3");
  assert.equal(C.normalizeForEval("12×"), "12");
  assert.equal(C.normalizeForEval("3."), "3");
  assert.equal(C.normalizeForEval("7+("), "7");
});

test("normalizeForEval: auto-closes unclosed parens", () => {
  assert.equal(C.normalizeForEval("16×(0.5"), "16×(0.5)");
  assert.equal(C.normalizeForEval("((1+2"), "((1+2))");
  assert.equal(C.normalizeForEval("(1+2)×(3"), "(1+2)×(3)");
});

test("getPreview: shows result for complete + incomplete expressions", () => {
  assert.equal(C.getPreview("55+3"), "58");
  assert.equal(C.getPreview("55+3−"), "58"); // keeps last value through trailing operator
  assert.equal(C.getPreview("16×(0.5+2.5)"), "48");
  assert.equal(C.getPreview("16×(0.5"), "8");
});

test("getPreview: empty for bare numbers / nothing to compute", () => {
  assert.equal(C.getPreview(""), "");
  assert.equal(C.getPreview("42"), ""); // no operation yet
  assert.equal(C.getPreview("7+"), ""); // strips to "7", a bare number
});
