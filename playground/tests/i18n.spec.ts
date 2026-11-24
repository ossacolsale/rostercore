import { test, expect } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";

test("Italian catalogue covers UI keys and preserves interpolation parameters", async () => {
  const ts = await import("typescript");
  const catalogue = JSON.parse(
    await readFile(new URL("../src/locales/it.json", import.meta.url), "utf8"),
  ) as Record<string, string>;
  const directory = new URL("../src/", import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => /\.tsx?$/.test(name))) {
    const text = await readFile(new URL(name, directory), "utf8");
    const source = ts.createSourceFile(
      name,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node: import("typescript").Node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "t" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const key = node.arguments[0].text;
        expect(
          Object.hasOwn(catalogue, key),
          `Missing Italian UI key: ${key}`,
        ).toBe(true);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const parameters = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const [english, italian] of Object.entries(catalogue))
    expect(parameters(italian), english).toEqual(parameters(english));
});
