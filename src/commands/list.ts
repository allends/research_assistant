import { loadConfig, configExists } from "../config.ts";
import * as vaultFs from "../integrations/vault-fs.ts";

export async function listCommand(options: { json: boolean }): Promise<void> {
  if (!configExists()) {
    console.error("No configuration found. Run 'ra init' first.");
    process.exit(1);
  }

  const config = await loadConfig();
  const notes = await vaultFs.listNotes(config.vault.path);

  if (options.json) {
    console.log(JSON.stringify(notes, null, 2));
  } else {
    console.log(`${notes.length} notes in vault:\n`);
    for (const note of notes) {
      console.log(`  ${note}`);
    }
  }
}
