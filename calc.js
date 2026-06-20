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

// ---------- State transforms (pure) ----------
const makeState = () => ({ expr: "", evaluated: false, lastResult: "", error: null });

// Type a digit, dot, or operator glyph.
function inputValue(state, v) {
  let { expr, evaluated, lastResult } = state;
  if (evaluated) {
    // operator/% continues from the result; a digit starts a fresh expression
    expr = (isOperator(v) || v === "%") ? lastResult : "";
    evaluated = false;
  }
  const last = expr.slice(-1);

  if (isOperator(v)) {
    if (expr === "" && v !== "−") return { expr, evaluated, lastResult, error: null }; // only − can lead
    if (isOperator(last)) expr = expr.slice(0, -1);                                     // replace trailing op
    expr += v;
  } else if (v === ".") {
    if (/\.\d*$/.test(trailingNumber(expr))) return { expr, evaluated, lastResult, error: null }; // one dot/number
    if (expr === "" || isOperator(last) || last === "(") expr += "0";                              // .5 → 0.5
    expr += ".";
  } else {
    expr += v;
  }
  return { expr, evaluated, lastResult, error: null };
}

// Intelligent parenthesis: choose ( vs ), auto-prepend × where it's an implied multiply.
function inputParen(state) {
  let expr = state.expr;
  let evaluated = state.evaluated;
  if (evaluated) { expr = ""; evaluated = false; }
  const last = expr.slice(-1);

  const canClose = unclosedParens(expr) > 0 && /[0-9)%]/.test(last);
  if (canClose) {
    expr += ")";
  } else {
    if (/[0-9)%]/.test(last)) expr += "×"; // 16 → 16×(
    expr += "(";
  }
  return { expr, evaluated, lastResult: state.lastResult, error: null };
}

function backspace(state) {
  let expr = state.expr;
  let evaluated = state.evaluated;
  // After '=', backspace edits the result rather than the greyed expression
  if (evaluated) { expr = state.lastResult; evaluated = false; }
  expr = expr.slice(0, -1);
  return { expr, evaluated, lastResult: state.lastResult, error: null };
}

function clearAll(state) {
  return { expr: "", evaluated: false, lastResult: state.lastResult, error: null };
}

function equals(state) {
  if (state.expr === "" || state.evaluated) return state;
  const norm = normalizeForEval(state.expr);
  try {
    const formatted = formatNumber(evaluate(norm));
    return {
      expr: norm, evaluated: true, lastResult: formatted, error: null,
      committed: { expression: norm, result: formatted },
    };
  } catch (e) {
    return { ...state, error: "Error" };
  }
}

// Insert a past result (from history) into the current expression.
function appendResult(state, value) {
  let expr = state.expr;
  let evaluated = state.evaluated;
  if (evaluated) { expr = ""; evaluated = false; }
  if (/[0-9)%]/.test(expr.slice(-1))) expr += "×";
  expr += value;
  return { expr, evaluated, lastResult: state.lastResult, error: null };
}

// Export for Node tests; harmless in the browser (module is undefined there).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    OPERATORS, isOperator, countChar, unclosedParens, trailingNumber,
    evaluate, formatNumber, normalizeForEval, getPreview,
    makeState, inputValue, inputParen, backspace, clearAll, equals, appendResult,
  };
}
