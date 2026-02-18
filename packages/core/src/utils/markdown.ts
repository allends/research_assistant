import matter from "gray-matter";
import type { NoteFrontmatter } from "../types/vault.ts";

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

export function extractTags(content: string): string[] {
  const regex = /(?:^|\s)#([a-zA-Z][\w/-]*)/g;
  const tags: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match[1]) tags.push(match[1]);
  }

  return [...new Set(tags)];
}

export function extractHeadings(
  content: string,
): { level: number; text: string }[] {
  const regex = /^(#{1,6})\s+(.+)$/gm;
  const headings: { level: number; text: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match[1] && match[2]) {
      headings.push({ level: match[1].length, text: match[2].trim() });
    }
  }

  return headings;
}
