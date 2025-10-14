import { PluginObj, types as t } from '@babel/core';

interface RemoveImportExportState {
  // No additional state needed
}

export default function removeImportExportPlugin(): PluginObj<RemoveImportExportState> {
  return {
    name: 'remove-import-export',
    visitor: {
      // Handle import declarations
      ImportDeclaration(path) {
        path.remove();
      },
      // Handle export declarations (named and default)
      ExportNamedDeclaration(path) {
        path.remove();
      },
      ExportDefaultDeclaration(path) {
        path.remove();
      },
      // Handle export all declarations
      ExportAllDeclaration(path) {
        path.remove();
      },
    },
  };
}