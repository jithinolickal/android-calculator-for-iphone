"use strict";
// Input handling: the pure state transforms (inputValue, inputParen, backspace, clearAll,
// equals, appendResult). These encode the small but important Android-style typing rules.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../calc.js");

// Type a sequence of glyphs starting from a fresh (or given) state. Operators/parens are
// routed through the matching transform so we exercise the same paths the keypad does.
function type(seq, start) {
  let s = start || C.makeState();
  for (const ch of seq) {
    if (ch === "(" || ch === ")") s = C.inputParen(s);
    else s = C.inputValue(s, ch);
  }
  return s;
}

test("digits and operators build the expression", () => {
  assert.equal(type(["1", "2", "+", "3"]).expr, "12+3");
});

test("only minus may lead an expression", () => {
  assert.equal(type(["−", "5"]).expr, "−5");
  assert.equal(type(["+"]).expr, "");   // ignored
  assert.equal(type(["×"]).expr, "");   // ignored
});

test("a trailing operator is replaced, not stacked", () => {
  assert.equal(type(["5", "+", "−"]).expr, "5−");
  assert.equal(type(["5", "+", "×", "÷"]).expr, "5÷");
});

test("one decimal point per number", () => {
  assert.equal(type(["1", ".", "5"]).expr, "1.5");
  assert.equal(type(["1", ".", "5", "."]).expr, "1.5"); // second dot ignored
  assert.equal(type(["1", ".", "2", "+", "3", "."]).expr, "1.2+3."); // new number may have its own dot
});

test("dot auto-prepends a leading zero", () => {
  assert.equal(type(["."]).expr, "0.");
  assert.equal(type(["5", "+", "."]).expr, "5+0.");
  assert.equal(type(["(", "."]).expr, "(0.");
});

test("intelligent parens: open when empty or after an operator", () => {
  assert.equal(C.inputParen(C.makeState()).expr, "(");
  assert.equal(type(["5", "+", "("]).expr, "5+(");
});

test("intelligent parens: auto-× after a number/close/percent", () => {
  assert.equal(type(["1", "6", "("]).expr, "16×(");
  assert.equal(type(["(", "1", ")", "("]).expr, "(1)×(");
});

test("intelligent parens: close when there is an unclosed paren after a value", () => {
  assert.equal(type(["(", "1", "+", "2"]).expr, "(1+2");
  assert.equal(type(["(", "1", "+", "2", ")"]).expr, "(1+2)");
});

test("backspace removes the last character; AC clears", () => {
  assert.equal(C.backspace(type(["1", "2", "+"])).expr, "12");
  assert.equal(C.clearAll(type(["1", "2", "+", "3"])).expr, "");
});

test("equals: commits result, normalizes, sets evaluated + history payload", () => {
  const r = C.equals(type(["5", "5", "+", "3"]));
  assert.equal(r.evaluated, true);
  assert.equal(r.lastResult, "58");
  assert.equal(r.expr, "55+3");
  assert.deepEqual(r.committed, { expression: "55+3", result: "58" });
});

test("equals: trailing operator is normalized before computing", () => {
  const r = C.equals(type(["5", "5", "+", "3", "−"]));
  assert.equal(r.lastResult, "58");
  assert.equal(r.expr, "55+3");
});

test("equals: malformed expression yields an error, no crash", () => {
  const r = C.equals(type(["5", "÷", "0"]));
  assert.equal(r.error, "Error");
  assert.equal(r.evaluated, false);
});

test("after '=': operator continues from result, digit starts fresh", () => {
  const done = C.equals(type(["5", "+", "3"])); // lastResult "8", evaluated
  assert.equal(C.inputValue(done, "×").expr, "8×"); // continue
  assert.equal(C.inputValue(done, "7").expr, "7");  // fresh
});

test("after '=': backspace edits the result", () => {
  const done = C.equals(type(["5", "+", "3"])); // "8"
  assert.equal(C.backspace(done).expr, ""); // "8" → ""
  const done2 = C.equals(type(["5", "0", "+", "5"])); // "55"
  assert.equal(C.backspace(done2).expr, "5");
});

test("appendResult: inserts a history result, with implied × when needed", () => {
  assert.equal(C.appendResult(C.makeState(), "42").expr, "42");
  assert.equal(C.appendResult(type(["7"]), "42").expr, "7×42");        // after a digit
  const done = C.equals(type(["1", "+", "1"]));                         // evaluated state
  assert.equal(C.appendResult(done, "9").expr, "9");                    // starts fresh
});
