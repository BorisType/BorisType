export interface PackageObjectEntry {
  id: string;
  type: string;
  name: string;
}

export interface PackageArchivePart {
  id: string;
  type: string;
  url: string;
  baseUrl?: string;
  serverVersion?: string;
  objects: PackageObjectEntry[];
  hasCustomTemplates: boolean;
  hasAccessRoles: boolean;
  hasLists: boolean;
  deletedObjectIds: string[];
}

export interface PackageArchiveInspection {
  packages: PackageArchivePart[];
  totalEntries: number;
  expandedBytes: number;
}
