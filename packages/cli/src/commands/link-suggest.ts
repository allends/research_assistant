import { askStream, AuthError, linkSuggestSystemPrompt, vaultFs, extractWikilinks } from "@ra/core";
import { loadConfig, configExists } from "../config.ts";

export async function linkSuggestCommand(
  file: string,
  options: { apply?: boolean; model?: string },
): Promise<void> {
  if (!configExists()) {
    console.error("No configuration found. Run 'ra init' first.");
    process.exit(1);
  }

  const config = await loadConfig();

  // Read the target note and extract existing links
  const note = await vaultFs.readNote(file, config.vault.path);
  const existingLinks = extractWikilinks(note.content);

  const systemPrompt = await linkSuggestSystemPrompt(config, note.path, existingLinks);

  const prompt = options.apply
    ? `Analyze the note at "${note.path}" and suggest [[wikilinks]]. Then apply the suggestions by rewriting the note with vault_write, inserting wikilinks inline where they fit naturally in the text. Do NOT add a links section at the bottom — weave them into existing sentences.`
    : `Analyze the note at "${note.path}" and suggest [[wikilinks]] that should be added.`;

  let exitCode = 0;

  try {
    for await (const event of askStream(prompt, config, {
      model: options.model,
      maxTurns: 6,
      systemPrompt,
    })) {
      if (event.type === "text") process.stdout.write(event.text!);
      if (event.type === "error") {
        console.error(`\nAgent stopped: ${event.error}`);
        exitCode = 1;
      }
    }
  } catch (e) {
    if (e instanceof AuthError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }

  process.stdout.write("\n");
  process.exit(exitCode);
}
