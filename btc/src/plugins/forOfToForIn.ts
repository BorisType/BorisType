import { PluginObj, PluginPass, types as t } from '@babel/core';

interface ForOfToForInState extends PluginPass {
}

export default function replaceForOfToForInPlugin(): PluginObj<ForOfToForInState> {
  return {
    name: 'replace-for-of-to-for-in',
    visitor: {
      ForOfStatement(path) {
        path.replaceWith(
          t.forInStatement(
            path.node.left,
            path.node.right,
            path.node.body
          )
        );
      },
    },
  };
}