import { join, relative, extname } from "path";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import matter from "gray-matter";
import type { Note, NoteFrontmatter, VaultStats } from "../types/vault.ts";

export async function readNote(
  filePath: string,
  vaultPath: string,
): Promise<Note> {
  const fullPath = filePath.startsWith("/")
    ? filePath
    : join(vaultPath, filePath);

  const raw = await Bun.file(fullPath).text();
  const { data, content } = matter(raw);

  return {
    path: relative(vaultPath, fullPath),
    content: raw,
    frontmatter: data as NoteFrontmatter,
    body: content,
  };
}

export async function writeNote(
  filePath: string,
  content: string,
  vaultPath: string,
): Promise<void> {
  const fullPath = filePath.startsWith("/")
    ? filePath
    : join(vaultPath, filePath);

  await Bun.write(fullPath, content);
}

export async function listNotes(
  vaultPath: string,
  options: { recursive?: boolean; extension?: string } = {},
): Promise<string[]> {
  const ext = options.extension ?? ".md";
  const notes: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.name.startsWith(".")) continue;

      if (entry.isDirectory() && options.recursive !== false) {
        await walk(fullPath);
      } else if (entry.isFile() && extname(entry.name) === ext) {
        notes.push(relative(vaultPath, fullPath));
      }
    }
  }

  await walk(vaultPath);
  return notes.sort();
}

export function parseFrontmatter(content: string): {
  data: NoteFrontmatter;
  body: string;
} {
  const { data, content: body } = matter(content);
  return { data: data as NoteFrontmatter, body };
}

export function extractWikilinks(content: string): string[] {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match[1]) links.push(match[1]);
  }

  return [...new Set(links)];
}

export async function getVaultStats(vaultPath: string): Promise<VaultStats> {
  const notes = await listNotes(vaultPath);
  const folders = new Set(
    notes.map((n) => n.split("/").slice(0, -1).join("/")),
  );

  return {
    totalNotes: notes.length,
    totalFolders: folders.size,
    vaultPath,
  };
}

export function isObsidianVault(path: string): boolean {
  return existsSync(join(path, ".obsidian"));
}

export async function getRecentNotes(
  vaultPath: string,
  days: number,
): Promise<{ path: string; mtime: Date }[]> {
  const notes = await listNotes(vaultPath);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const results: { path: string; mtime: Date }[] = [];

  for (const note of notes) {
    const fullPath = join(vaultPath, note);
    const file = Bun.file(fullPath);
    const stat = await file.stat();
    if (stat.mtime.getTime() >= cutoff) {
      results.push({ path: note, mtime: stat.mtime });
    }
  }

  return results.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}
