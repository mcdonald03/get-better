export type Case = { call: string; expect: unknown };
export type Result = { ok: boolean; got: string };
export type Review = { passed: boolean; bullets: string[]; lesson: string | null };

type Rule = [RegExp, string];

// shortcut: regex lint over source text, so it can be fooled by strings and comments.
// Upgrade: replace buildReview with a call to an /api/review route that returns the same Review shape.
const LINT: Record<string, { comment: RegExp; rules: Rule[]; list: string }> = {
  js: {
    comment: /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
    rules: [
      [/\bvar\s/, "Use `const`/`let` instead of `var`: block scope avoids hoisting surprises."],
      [/[^=!<>]==[^=]|!=[^=]/, "Use `===`/`!==`: loose equality coerces types and hides bugs."],
    ],
    list: "`var`, loose equality",
  },
  py: {
    comment: /#.*$/gm,
    rules: [
      [/[=!]=\s*None\b/, "Compare to `None` with `is None` / `is not None`, not `==`: `None` is a singleton."],
      [/==\s*(True|False)\b/, "Don't compare to `True`/`False`: write `if x:` or `if not x:`."],
      [/range\(len\(/, "Iterate directly (`for x in items`) or use `enumerate`, instead of `range(len(...))`."],
      [/def\s+\w+\([^)]*=\s*(\[\]|\{\})/, "A mutable default argument (`=[]`) is shared between calls; default to `None` instead."],
      [/except\s*:/, "A bare `except:` hides real bugs; catch the specific exception."],
    ],
    list: "`== None`, `range(len(...))`, bare `except`",
  },
};

export function buildReview(
  code: string,
  results: Result[] | null,
  cases: Case[],
  lesson: string | null,
  lang = "js",
): Review {
  const passed = results !== null && results.every((r) => r.ok);
  const failing = results ? cases.filter((_, i) => !results[i].ok).map((c) => `\`${c.call}\``) : [];

  const bullets = [
    !results
      ? "The code didn't finish running (error or timeout), so no test could be checked."
      : passed
        ? `All ${cases.length} cases pass, including the edge cases.`
        : `Failing: ${failing.join(", ")}. Trace these inputs by hand before changing code.`,
  ];

  const L = LINT[lang] ?? LINT.js;
  const src = code.replace(L.comment, ""); // ignore comments
  for (const [re, msg] of L.rules) if (re.test(src)) bullets.push(msg);
  if (bullets.length === 1) bullets.push(`No style issues flagged by the automated checks (${L.list}).`);

  return { passed, bullets: bullets.slice(0, 3), lesson };
}