export interface NoteFrontmatter {
  title?: string;
  tags?: string[];
  aliases?: string[];
  created?: string;
  modified?: string;
  [key: string]: unknown;
}

export interface Note {
  path: string;
  content: string;
  frontmatter: NoteFrontmatter;
  body: string;
}

export interface VaultStats {
  totalNotes: number;
  totalFolders: number;
  vaultPath: string;
}
