import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";

// Content-validation tests for the governance knowledge base + FAQ collection.
// Validates: Requirements 10.1, 10.2, 10.3, 11.1, 11.2

const __dirname = dirname(fileURLToPath(import.meta.url));
const kbPath = join(__dirname, "governance-baseline-framework.md");
const faqPath = join(__dirname, "faq.json");

const kb = readFileSync(kbPath, "utf8");
const faqRaw = readFileSync(faqPath, "utf8");

/** The five governance categories the advisor assesses. */
const CATEGORIES = ["networking", "storage", "identity", "compute", "logging"] as const;

/**
 * Returns the markdown body of a top-level category section (a `## N. <Name>`
 * heading), spanning from that heading up to the next `## ` heading or EOF.
 */
function categorySection(markdown: string, category: string): string {
  const lines = markdown.split(/\r?\n/);
  const headingIdx = lines.findIndex(
    (line) =>
      /^##\s+\d+\.\s+/.test(line) &&
      line.toLowerCase().includes(category.toLowerCase()),
  );
  if (headingIdx === -1) return "";
  let end = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(headingIdx, end).join("\n");
}

describe("Knowledge base: governance baseline framework (Req 10.1, 10.2, 10.3)", () => {
  it("covers all five categories with a dedicated section (Req 10.1)", () => {
    for (const category of CATEGORIES) {
      const section = categorySection(kb, category);
      expect(section, `expected a section for category "${category}"`).not.toBe("");
    }
  });

  it("provides key controls, common violations, and remediation for each category (Req 10.2)", () => {
    for (const category of CATEGORIES) {
      const section = categorySection(kb, category).toLowerCase();
      expect(section, `"${category}" missing key controls`).toContain("key controls");
      expect(section, `"${category}" missing common violations`).toContain(
        "common violations",
      );
      expect(section, `"${category}" missing remediation`).toContain("remediation");
    }
  });

  it("defines a three-tier prioritization framework mapped to high/medium/low (Req 10.3)", () => {
    expect(kb.toLowerCase()).toContain("prioritization framework");

    const tierMatches = kb.match(/^###\s+Tier\s+\d+/gim) ?? [];
    expect(tierMatches.length, "expected exactly three remediation tiers").toBe(3);

    const lower = kb.toLowerCase();
    for (const severity of ["high", "medium", "low"]) {
      expect(lower, `framework missing "${severity}" tier`).toContain(severity);
    }
  });
});

describe("FAQ collection (Req 11.1, 11.2)", () => {
  const parsed = JSON.parse(faqRaw) as { faqs: Array<Record<string, unknown>> };
  const faqs = parsed.faqs;

  // The four required FAQ topics, each matched by representative keywords.
  const REQUIRED_TOPICS: Array<{ name: string; match: (q: string) => boolean }> = [
    { name: "what Azure Policy is", match: (q) => /what is azure policy/.test(q) },
    { name: "what a policy baseline is", match: (q) => /policy baseline/.test(q) },
    {
      name: "how often Azure evaluates compliance",
      match: (q) => /how often.*evaluate.*complian/.test(q),
    },
    {
      name: "the difference between audit and deny mode",
      match: (q) => /audit and deny|audit.*deny mode/.test(q),
    },
  ];

  it("is a well-formed array of entries", () => {
    expect(Array.isArray(faqs)).toBe(true);
    expect(faqs.length).toBeGreaterThanOrEqual(REQUIRED_TOPICS.length);
  });

  it("contains an entry for each of the four required questions (Req 11.1)", () => {
    const questions = faqs.map((f) => String(f.question ?? "").toLowerCase());
    for (const topic of REQUIRED_TOPICS) {
      const found = questions.some((q) => topic.match(q));
      expect(found, `missing required FAQ entry: ${topic.name}`).toBe(true);
    }
  });

  it("pairs each entry with exactly one question and exactly one defined answer (Req 11.2)", () => {
    for (const entry of faqs) {
      const keys = Object.keys(entry);
      expect(keys, "entry must have exactly one question key").toContain("question");
      expect(keys, "entry must have exactly one answer key").toContain("answer");
      // Exactly one question and one answer field — no arrays, no duplicates, no extras.
      expect(keys.length, `entry has unexpected fields: ${keys.join(", ")}`).toBe(2);

      expect(typeof entry.question, "question must be a single string").toBe("string");
      expect(typeof entry.answer, "answer must be a single string").toBe("string");
      expect(String(entry.question).trim().length).toBeGreaterThan(0);
      expect(String(entry.answer).trim().length).toBeGreaterThan(0);
    }
  });
});
