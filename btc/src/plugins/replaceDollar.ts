import { PluginObj, PluginPass, types as t } from '@babel/core';

interface ReplaceDollarState extends PluginPass {
  
}

export default function replaceDollarPlugin(): PluginObj<ReplaceDollarState> {
  return {
    name: 'replace-dollar',
    visitor: {
      Identifier(path) {
        if (path.node.name.includes('$')) {
          const newName = path.node.name.replace(/\$/g, '_24_');
          path.node.name = newName;
        }
      },
    },
  };
}