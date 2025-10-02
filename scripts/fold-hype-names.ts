import { Project, SyntaxKind } from "ts-morph";
import fs from "node:fs";
import path from "node:path";

const HYPE = /(enhanced|unified|better|new|next|final|copy|revamp|improved)/i;
const project = new Project({
  tsConfigFilePath: "tsconfig.json",
  skipAddingFilesFromTsConfig: false,
});

// 1) Identifier renames
for (const sf of project.getSourceFiles()) {
  let changed = false;

  // Declarations: class/function/const
  sf.forEachDescendant((node) => {
    if (
      node.getKind() === SyntaxKind.ClassDeclaration ||
      node.getKind() === SyntaxKind.FunctionDeclaration ||
      node.getKind() === SyntaxKind.VariableDeclaration
    ) {
      // @ts-ignore
      const nameNode = node.getNameNode?.() || node.getName?.();
      const name = nameNode?.getText?.() || "";
      if (name && HYPE.test(name)) {
        const base = name.replace(HYPE, "").replace(/(^_|_$)/g, "");
        if (base && base !== name) {
          // rename symbol safely
          // @ts-ignore
          const id = node.getNameNode?.();
          if (id?.rename) {
            id.rename(base);
            changed = true;
          }
        }
      }
    }
  });

  if (changed) sf.saveSync();
}

// 2) File rename suggestions (report first; manual review recommended)
const byDir = new Map<string, string[]>();
for (const sf of project.getSourceFiles()) {
  const filePath = sf.getFilePath();
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  if (!byDir.has(dir)) byDir.set(dir, []);
  byDir.get(dir)!.push(base);
}

const report: string[] = [];
for (const [dir, files] of byDir) {
  for (const f of files) {
    if (HYPE.test(f)) {
      const suggested = f
        .replace(HYPE, "")
        .replace(/--+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+\./, ".");
      const existing = files.find(
        (x) => x.toLowerCase() === suggested.toLowerCase()
      );
      report.push(
        `${path.join(dir, f)} -> ${suggested} ${
          existing ? "(merge with existing)" : ""
        }`
      );
    }
  }
}

fs.writeFileSync("naming-codemod-report.txt", report.join("\n"));
console.log(
  "Wrote naming-codemod-report.txt. Review and perform merges with git mv + manual diff."
);
project.saveSync();
