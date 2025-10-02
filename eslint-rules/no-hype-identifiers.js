import { ESLintUtils } from "@typescript-eslint/utils";
const HYPE = /(enhanced|unified|better|new|next|final|copy|revamp|improved)/i;

export default ESLintUtils.RuleCreator(() => import.meta.url)({
  name: "no-hype-identifiers",
  meta: {
    type: "problem",
    docs: { description: "Disallow hype adjectives in identifiers" },
    messages: {
      hype: "Avoid '{{name}}' in identifiers; use purpose-first naming.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(ctx) {
    function checkName(id) {
      if (!id || !id.name) return;
      if (HYPE.test(id.name)) {
        ctx.report({ node: id, messageId: "hype", data: { name: id.name } });
      }
    }
    return {
      Identifier: checkName,
      "ExportNamedDeclaration > ExportSpecifier"(node) {
        checkName(node.exported);
      },
    };
  },
});
