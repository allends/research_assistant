import { loadConfig, configExists } from "../config.ts";

export async function serveCommand(options: { port?: number }): Promise<void> {
  if (!configExists()) {
    console.error("No configuration found. Run 'ra init' first.");
    process.exit(1);
  }

  const config = await loadConfig();
  const { startServer } = await import("@ra/server");
  await startServer(config, { port: options.port ?? 3117 });
}
