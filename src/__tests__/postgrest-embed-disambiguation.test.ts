import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';

const REPO_ROOT = join(__dirname, '..', '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

/**
 * Parse migrations to find tables that have more than one FK to the same
 * child table. PostgREST cannot resolve a bare `child(...)` embed for those
 * tables — callers must use `child!column(...)` form.
 *
 * Returns map: { '<parent_table>': Set<'<child_table>'>, ... }
 */
function deriveMultiFkTables(): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();

  // Track per-parent FK counts to each child: counts[parent][child] = N
  const counts = new Map<string, Map<string, number>>();

  // Find current CREATE TABLE block to attribute REFERENCES rows to the right parent
  const sqlFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of sqlFiles) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    let currentTable: string | null = null;

    for (const rawLine of content.split('\n')) {
      const line = rawLine.replace(/--.*$/, '').trim();
      if (!line) continue;

      const createMatch = line.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/i);
      if (createMatch) {
        currentTable = createMatch[1];
        continue;
      }

      // End of CREATE TABLE
      if (currentTable && line.startsWith(')')) {
        currentTable = null;
        continue;
      }

      if (!currentTable) continue;

      // Match REFERENCES <child>(...)
      const refMatch = line.match(/REFERENCES\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/i);
      if (refMatch) {
        const child = refMatch[1];
        let perParent = counts.get(currentTable);
        if (!perParent) {
          perParent = new Map<string, number>();
          counts.set(currentTable, perParent);
        }
        perParent.set(child, (perParent.get(child) ?? 0) + 1);
      }
    }

    // Second pass: ALTER TABLE ... REFERENCES (multi-line statements supported)
    // Strip inline comments first, then split on `;` to get statements.
    const noLineComments = content
      .split('\n')
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n');

    for (const stmt of noLineComments.split(';')) {
      const alterMatch = stmt.match(/ALTER\s+TABLE\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/i);
      if (!alterMatch) continue;
      const parent = alterMatch[1];
      const refRe = /REFERENCES\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;
      let m: RegExpExecArray | null;
      while ((m = refRe.exec(stmt)) !== null) {
        const child = m[1];
        let perParent = counts.get(parent);
        if (!perParent) {
          perParent = new Map<string, number>();
          counts.set(parent, perParent);
        }
        perParent.set(child, (perParent.get(child) ?? 0) + 1);
      }
    }
  }

  for (const [parent, perChild] of counts) {
    for (const [child, n] of perChild) {
      if (n > 1) {
        let set = result.get(parent);
        if (!set) {
          set = new Set();
          result.set(parent, set);
        }
        set.add(child);
      }
    }
  }

  return result;
}

interface Violation {
  file: string;
  line: number;
  parent: string;
  child: string;
  snippet: string;
}

function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry.startsWith('.')) continue;
      out.push(...walkSourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function findViolations(
  filePath: string,
  multiFk: Map<string, Set<string>>,
): Violation[] {
  const source = readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  function findFromCalls(node: ts.Node) {
    // Look for chains: <expr>.from('<table>')
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'from' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const tableName = node.arguments[0].text;
      const childSet = multiFk.get(tableName);
      if (childSet) {
        // NOTE: Detection assumes .from('<table>') and .select(...) appear in the
        // same expression chain (the canonical Supabase usage). If a query is
        // destructured into a variable first (`const q = client.from('x'); q.select(...)`),
        // the .select call is in a different chain and won't be linked back to .from.
        // The codebase doesn't currently use that pattern, but be aware if violations
        // suddenly disappear after a refactor.
        // Walk up the chain to find the .select(...) sibling call
        let current: ts.Node = node.parent;
        while (current) {
          if (
            ts.isCallExpression(current) &&
            ts.isPropertyAccessExpression(current.expression) &&
            current.expression.name.text === 'select' &&
            current.arguments.length >= 1
          ) {
            const arg = current.arguments[0];
            let selectText = '';
            if (ts.isNoSubstitutionTemplateLiteral(arg) || ts.isStringLiteral(arg)) {
              selectText = arg.text;
            } else if (ts.isTemplateExpression(arg)) {
              selectText = arg.head.text + arg.templateSpans.map((s) => s.literal.text).join('');
            }
            if (selectText) {
              for (const child of childSet) {
                // Match `<child>(` not preceded by `!<word>` (i.e. bare embed).
                const re = new RegExp(`(?<![!\\w])${child}\\s*\\(`, 'g');
                let m: RegExpExecArray | null;
                while ((m = re.exec(selectText)) !== null) {
                  const lineNum =
                    sf.getLineAndCharacterOfPosition(arg.getStart(sf)).line + 1;
                  violations.push({
                    file: relative(REPO_ROOT, filePath),
                    line: lineNum,
                    parent: tableName,
                    child,
                    snippet: selectText.slice(Math.max(0, m.index - 20), m.index + 40).trim(),
                  });
                }
              }
            }
            break;
          }
          current = current.parent;
          if (!current) break;
        }
      }
    }
    ts.forEachChild(node, findFromCalls);
  }

  findFromCalls(sf);
  return violations;
}

describe('PostgREST embed disambiguation', () => {
  it('derives at least one multi-FK pair from migrations', () => {
    const multiFk = deriveMultiFkTables();
    // org_memberships and property_memberships both have 2 FKs to users.
    expect(multiFk.get('org_memberships')?.has('users')).toBe(true);
    expect(multiFk.get('property_memberships')?.has('users')).toBe(true);
  });

  it('has no bare embeds of multi-FK children in source', () => {
    const multiFk = deriveMultiFkTables();
    const files = walkSourceFiles(SRC_DIR);
    const allViolations: Violation[] = [];
    for (const f of files) {
      allViolations.push(...findViolations(f, multiFk));
    }

    if (allViolations.length > 0) {
      const formatted = allViolations
        .map(
          (v) =>
            `  ${v.file}:${v.line} — .from('${v.parent}').select(...) embeds bare '${v.child}(...)' — use '${v.child}!<column>(...)' instead. Near: "${v.snippet}"`,
        )
        .join('\n');
      throw new Error(
        `Found ${allViolations.length} ambiguous PostgREST embed(s):\n${formatted}\n\n` +
          `See docs/adr/0008-membership-data-relationships.md.`,
      );
    }

    expect(allViolations).toEqual([]);
  });
});
