/* Calculator core — pure logic, no DOM, no globals mutated.
 *
 * Lives separately from app.js so it can be unit-tested in Node (see tests/). Loaded as a
 * plain <script> before app.js in the browser (its top-level declarations are visible to
 * app.js), and via require() in tests (see the module.exports at the bottom).
 *
 * State shape used by the transforms below:
 *   { expr, evaluated, lastResult, error }
 *     expr       — the expression as shown (uses × ÷ − glyphs)
 *     evaluated  — true right after '=' (expr greys on top, result shows big)
 *     lastResult — formatted result of the last '=', so an operator can continue from it
 *     error      — "Error" when the last '=' failed to parse, else null
 * Transforms are pure: they take a state (+ input) and return a NEW state; they never touch
 * the DOM. equals() may also attach `committed: {expression, result}` to signal the UI to
 * push a history entry.
 */

const OPERATORS = ["+", "−", "×", "÷"];
const isOperator = (c) => OPERATORS.includes(c);
const countChar = (s, ch) => s.split(ch).length - 1;
const unclosedParens = (s) => countChar(s, "(") - countChar(s, ")");

// Trailing number segment of an expression (for the one-dot-per-number check).
const trailingNumber = (expr) => {
  const m = expr.match(/[0-9.]+$/);
  return m ? m[0] : "";
};

// ---------- Math engine ----------
// Recursive-descent parser. Each grammar rule is one function that consumes part of the
// string via the shared cursor `i`. The recursion encodes operator precedence and parens,
// which a flat regex/eval approach can't do cleanly. Throws on malformed input — callers
// treat that as "no result yet".
//   expr   := term (('+'|'-') term)*       (lowest precedence: + -)
//   term   := factor (('*'|'/') factor)*   (higher: * /)
//   factor := '-'? primary '%'?            (unary sign, postfix percent)
//   primary:= number | '(' expr ')'
function evaluate(input) {
  const s = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  let i = 0; // shared cursor into `s`

  const peek = () => s[i];
  const eat = (c) => { if (s[i] === c) { i++; return true; } return false; };
  const skip = () => { while (s[i] === " ") i++; };

  function parseExpr() {
    let value = parseTerm();
    for (;;) {
      skip();
      if (eat("+")) value += parseTerm();
      else if (eat("-")) value -= parseTerm();
      else break;
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    for (;;) {
      skip();
      if (eat("*")) value *= parseFactor();
      else if (eat("/")) value /= parseFactor();
      else break;
    }
    return value;
  }

  function parseFactor() {
    skip();
    let sign = 1;
    while (peek() === "-" || peek() === "+") { if (eat("-")) sign = -sign; else eat("+"); skip(); }
    let value = sign * parsePrimary();
    skip();
    while (eat("%")) { value = value / 100; skip(); } // v1: simple percent (÷100)
    return value;
  }

  function parsePrimary() {
    skip();
    if (eat("(")) {
      const value = parseExpr();
      skip();
      eat(")");
      return value;
    }
    let num = "";
    while (i < s.length && /[0-9.]/.test(s[i])) num += s[i++];
    if (num === "" || num === ".") throw new Error("parse");
    return parseFloat(num);
  }

  const value = parseExpr();
  skip();
  if (i !== s.length) throw new Error("trailing");
  if (!isFinite(value)) throw new Error("infinite");
  return value;
}

// Format a result for display. JS doubles carry float noise (0.1+0.2 = 0.30000000000000004),
// so round to 12 significant digits — enough for a calculator, hides the noise. Trailing
// zeros are dropped; huge/tiny magnitudes fall back to compact exponential notation.
function formatNumber(n) {
  if (!isFinite(n)) return "";
  let str = parseFloat(n.toPrecision(12)).toString();
  if (str.includes("e")) return n.toExponential(6).replace(/\.?0+e/, "e");
  return str;
}

// Make a partial/in-progress expression evaluable: strip trailing operators/dots/open-parens
// and auto-close unclosed parens. Shared by equals() and getPreview().
function normalizeForEval(raw) {
  let s = raw.replace(/[+−×÷.(]+$/g, "");
  const missing = unclosedParens(s);
  if (missing > 0) s += ")".repeat(missing);
  return s;
}

// Live preview value for a (possibly incomplete) expression, or "" when there's nothing
// meaningful to show. Only previews a real computation, not a bare typed number.
function getPreview(raw) {
  const s = normalizeForEval(raw);
  if (s === "") return "";
  const isComputation = /[0-9)][+−×÷]/.test(s) || /%/.test(s);
  if (!isComputation) return "";
  try {
    const value = evaluate(s);
    if (!isFinite(value)) return "";
    const formatted = formatNumber(value);
    return formatted === raw ? "" : formatted;
  } catch (e) {
    return "";
  }
}

// Insert thousands separators into the integer part of every number in a display string.
// Display-only: it's applied when painting expr/result/history, never to the evaluable
// expression. Leaves decimals, operators, parens, and compact exponential notation alone.
function groupThousands(display) {
  if (display.includes("e")) return display; // exponential result — don't touch
  return display.replace(/\d+/g, (run, offset) => {
    if (display[offset - 1] === ".") return run; // fractional part — don't group
    return run.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  });
}

// Group thousands AND return a raw→display index map, so the UI can place the caret.
// map[k] is the display-string offset of raw char k; map has expr.length + 1 entries
// (the last is the position just past the end). Mirrors groupThousands' rules exactly:
// only integer runs (digits not preceded by '.') are grouped; exponential is left alone.
function groupWithMap(expr) {
  const map = new Array(expr.length + 1);
  if (expr.includes("e")) {
    for (let k = 0; k <= expr.length; k++) map[k] = k;
    return { text: expr, map };
  }
  let text = "";
  let r = 0;
  while (r < expr.length) {
    if (/[0-9]/.test(expr[r]) && expr[r - 1] !== ".") {
      const start = r;
      let run = "";
      while (r < expr.length && /[0-9]/.test(expr[r])) run += expr[r++];
      const grouped = run.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      let gi = 0;
      for (let k = 0; k < run.length; k++) {
        while (grouped[gi] === ",") gi++;     // skip inserted separators
        map[start + k] = text.length + gi++;
      }
      text += grouped;
    } else {
      map[r] = text.length;
      text += expr[r++];
    }
  }
  map[expr.length] = text.length;
  return { text, map };
}

// ---------- State transforms (pure) ----------
// `caret` is an index into `expr` (0..expr.length) marking the insertion point. Editing
// happens at the caret: each transform splits expr into `before`/`after`, applies the
// Android-style typing rules to the trailing edge of `before` (so existing end-anchored
// rules keep working), then stitches `before + after` and parks the caret after the edit.
const makeState = () => ({ expr: "", caret: 0, evaluated: false, lastResult: "", error: null });

// Clamp and move the caret (used by tap-to-position and arrow keys). No-op while evaluated.
function setCaret(state, pos) {
  if (state.evaluated || state.error) return state;
  const caret = Math.max(0, Math.min(state.expr.length, pos));
  return { ...state, caret };
}

// Type a digit, dot, percent, or operator glyph — inserted at the caret.
function inputValue(state, v) {
  let { expr, caret, evaluated, lastResult } = state;
  if (evaluated) {
    // operator/% continues from the result; a digit starts a fresh expression
    expr = (isOperator(v) || v === "%") ? lastResult : "";
    evaluated = false;
    caret = expr.length;
  }
  let before = expr.slice(0, caret);
  const after = expr.slice(caret);
  let last = before.slice(-1);
  const keep = () => ({ expr, caret, evaluated, lastResult, error: null });

  if (isOperator(v)) {
    if (before === "" && v !== "−") return keep();         // only − can lead
    if (isOperator(last)) before = before.slice(0, -1);    // replace the operator before the caret
    before += v;
  } else if (v === ".") {
    if (/\.\d*$/.test(trailingNumber(before))) return keep(); // one dot per number
    if (/[)%]/.test(last)) { before += "×"; last = "×"; }     // implied multiply: 50%. → 50%×0.
    if (before === "" || isOperator(last) || last === "(") before += "0"; // .5 → 0.5
    before += ".";
  } else {
    // digit (0-9) or '%'. A number right after ')' or '%' implies multiplication,
    // so 50%20 → 50%×20 (= 10) and (1+2)3 → (1+2)×3, instead of erroring.
    if (/[0-9]/.test(v) && /[)%]/.test(last)) before += "×";
    before += v;
  }
  return { expr: before + after, caret: before.length, evaluated, lastResult, error: null };
}

// Intelligent parenthesis: choose ( vs ), auto-prepend × where it's an implied multiply.
function inputParen(state) {
  let { expr, caret, evaluated } = state;
  if (evaluated) { expr = ""; evaluated = false; caret = 0; }
  let before = expr.slice(0, caret);
  const after = expr.slice(caret);
  const last = before.slice(-1);

  const canClose = unclosedParens(before) > 0 && /[0-9)%]/.test(last);
  if (canClose) {
    before += ")";
  } else {
    if (/[0-9)%]/.test(last)) before += "×"; // 16 → 16×(
    before += "(";
  }
  return { expr: before + after, caret: before.length, evaluated, lastResult: state.lastResult, error: null };
}

function backspace(state) {
  let { expr, caret, evaluated } = state;
  // After '=', backspace edits the result rather than the greyed expression
  if (evaluated) { expr = state.lastResult; evaluated = false; caret = expr.length; }
  const before = expr.slice(0, caret).slice(0, -1); // delete the char just before the caret
  const after = expr.slice(caret);
  return { expr: before + after, caret: before.length, evaluated, lastResult: state.lastResult, error: null };
}

function clearAll(state) {
  return { expr: "", caret: 0, evaluated: false, lastResult: state.lastResult, error: null };
}

function equals(state) {
  if (state.expr === "" || state.evaluated) return state;
  const norm = normalizeForEval(state.expr);
  try {
    const formatted = formatNumber(evaluate(norm));
    return {
      expr: norm, caret: norm.length, evaluated: true, lastResult: formatted, error: null,
      committed: { expression: norm, result: formatted },
    };
  } catch (e) {
    return { ...state, error: "Error" };
  }
}

// Insert a past result (from history) into the current expression at the caret.
function appendResult(state, value) {
  let { expr, caret, evaluated } = state;
  if (evaluated) { expr = ""; evaluated = false; caret = 0; }
  let before = expr.slice(0, caret);
  const after = expr.slice(caret);
  if (/[0-9)%]/.test(before.slice(-1))) before += "×";
  before += value;
  return { expr: before + after, caret: before.length, evaluated, lastResult: state.lastResult, error: null };
}

// Export for Node tests; harmless in the browser (module is undefined there).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    OPERATORS, isOperator, countChar, unclosedParens, trailingNumber,
    evaluate, formatNumber, normalizeForEval, getPreview, groupThousands, groupWithMap,
    makeState, setCaret, inputValue, inputParen, backspace, clearAll, equals, appendResult,
  };
}
