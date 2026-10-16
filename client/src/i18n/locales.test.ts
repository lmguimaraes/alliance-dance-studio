import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [`${prefix}${key}`]
      : flatten(value, `${prefix}${key}.`)
  );
}

/** "cart.count_one" and "cart.count_other" both become "cart.count". */
function baseKeys(tree: Tree): Set<string> {
  return new Set(
    flatten(tree).map(key => key.replace(/_(zero|one|two|few|many|other)$/, ""))
  );
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("translations", () => {
  const english = baseKeys(en as Tree);

  it.each([
    ["French", fr],
    ["Spanish", es],
  ])("%s has every English key", (_name, locale) => {
    const translated = baseKeys(locale as Tree);
    expect([...english].filter(key => !translated.has(key))).toEqual([]);
    expect([...translated].filter(key => !english.has(key))).toEqual([]);
  });

  it("has no empty strings", () => {
    for (const locale of [en, fr, es]) {
      const empty = flatten(locale as Tree).filter(key => {
        const value = key
          .split(".")
          .reduce<unknown>((node, part) => (node as Tree)[part], locale);
        return typeof value === "string" && value.trim() === "";
      });
      expect(empty).toEqual([]);
    }
  });

  it("defines every literal key used in the interface", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const used = new Set<string>();
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g))
        used.add(match[1]);
    }
    expect([...used].filter(key => !english.has(key)).sort()).toEqual([]);
  });
});
