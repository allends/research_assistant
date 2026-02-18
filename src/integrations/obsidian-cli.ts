async function run(
  args: string[],
): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(["obsidian", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(
      `obsidian ${args.join(" ")} failed (exit ${exitCode}): ${stderr}`,
    );
  }

  return { stdout: stdout.trim(), exitCode };
}

export async function isAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["obsidian", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

export async function evalCode(code: string): Promise<string> {
  const { stdout } = await run(["eval", `code=${code}`]);
  return stdout;
}

export async function listFiles(
  options: { vault?: string } = {},
): Promise<string[]> {
  const args = ["files", "list"];
  if (options.vault) args.push(`--vault=${options.vault}`);
  args.push("--json");

  const { stdout } = await run(args);
  return JSON.parse(stdout) as string[];
}

export async function readFile(
  path: string,
  options: { vault?: string } = {},
): Promise<string> {
  const args = ["files", "read", path];
  if (options.vault) args.push(`--vault=${options.vault}`);

  const { stdout } = await run(args);
  return stdout;
}

export async function searchContent(
  query: string,
  options: { vault?: string } = {},
): Promise<string> {
  const args = ["search", "content", query];
  if (options.vault) args.push(`--vault=${options.vault}`);
  args.push("--json");

  const { stdout } = await run(args);
  return stdout;
}

export async function readProperty(
  property: string,
  options: { vault?: string; file?: string } = {},
): Promise<string> {
  const args = ["property:read", property];
  if (options.vault) args.push(`--vault=${options.vault}`);
  if (options.file) args.push(`--file=${options.file}`);
  args.push("--json");

  const { stdout } = await run(args);
  return stdout;
}

export async function getVersion(): Promise<string | null> {
  try {
    const { stdout } = await run(["--version"]);
    return stdout;
  } catch {
    return null;
  }
}
