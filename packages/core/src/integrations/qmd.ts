import type {
  QmdSearchResult,
  QmdSearchResponse,
  QmdStatusResponse,
  SearchMode,
} from "../types/search.ts";

// Resolve the qmd entry point once — run via node (not bun) because
// Bun's built-in SQLite on macOS uses Apple's SQLite which doesn't
// support loadExtension(), breaking sqlite-vec for vector search.
const QMD_ENTRY = new URL(
  import.meta.resolve("@tobilu/qmd/dist/qmd.js"),
).pathname;

async function run(
  args: string[],
): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(["node", QMD_ENTRY, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Read both streams concurrently to avoid deadlock when stderr buffer fills
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`qmd ${args.join(" ")} failed (exit ${exitCode}): ${stderr}`);
  }

  return { stdout: stdout.trim(), exitCode };
}

function parseJsonOutput<T>(stdout: string): T {
  return JSON.parse(stdout) as T;
}

export async function search(
  query: string,
  options: { limit?: number; minScore?: number } = {},
): Promise<QmdSearchResult[]> {
  const args = ["search", query, "--json"];
  if (options.limit) args.push("-n", String(options.limit));
  if (options.minScore) args.push("--min-score", String(options.minScore));

  const { stdout } = await run(args);
  return parseJsonOutput<QmdSearchResult[]>(stdout);
}

export async function vsearch(
  query: string,
  options: { limit?: number; minScore?: number } = {},
): Promise<QmdSearchResult[]> {
  const args = ["vsearch", query, "--json"];
  if (options.limit) args.push("-n", String(options.limit));
  if (options.minScore) args.push("--min-score", String(options.minScore));

  const { stdout } = await run(args);
  return parseJsonOutput<QmdSearchResult[]>(stdout);
}

export async function query(
  queryStr: string,
  options: { limit?: number; minScore?: number } = {},
): Promise<QmdSearchResult[]> {
  const args = ["query", queryStr, "--json"];
  if (options.limit) args.push("-n", String(options.limit));
  if (options.minScore) args.push("--min-score", String(options.minScore));

  const { stdout } = await run(args);
  return parseJsonOutput<QmdSearchResult[]>(stdout);
}

export async function hybridSearch(
  queryStr: string,
  mode: SearchMode = "hybrid",
  options: { limit?: number; minScore?: number } = {},
): Promise<QmdSearchResult[]> {
  switch (mode) {
    case "keyword":
      return search(queryStr, options);
    case "semantic":
      return vsearch(queryStr, options);
    case "hybrid":
      return query(queryStr, options);
  }
}

export async function get(
  ref: string,
  options: { lineNumbers?: boolean } = {},
): Promise<string> {
  const args = ["get", ref];
  if (options.lineNumbers) args.push("--line-numbers");

  const { stdout } = await run(args);
  return stdout;
}

export async function multiGet(refs: string[]): Promise<string[]> {
  return Promise.all(refs.map((ref) => get(ref)));
}

export async function status(): Promise<QmdStatusResponse> {
  const { stdout } = await run(["status", "--json"]);
  return parseJsonOutput<QmdStatusResponse>(stdout);
}

export async function collectionAdd(
  path: string,
  name: string,
): Promise<void> {
  await run(["collection", "add", path, "--name", name]);
}

export async function contextAdd(
  uri: string,
  description: string,
): Promise<void> {
  await run(["context", "add", uri, description]);
}

export async function embed(): Promise<void> {
  await run(["embed"]);
}

export async function update(): Promise<void> {
  await run(["update"]);
}

export async function isAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["node", QMD_ENTRY, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}
