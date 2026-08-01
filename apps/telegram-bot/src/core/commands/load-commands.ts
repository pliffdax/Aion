import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Command } from './command.js';

const featuresDirectory = fileURLToPath(new URL('../../features', import.meta.url));

export async function loadCommands(): Promise<Command[]> {
  const commandFiles = await findCommandFiles(featuresDirectory);
  const commands = await Promise.all(commandFiles.map(loadCommand));

  if (commands.length === 0) {
    throw new Error(`No *.command files found in ${featuresDirectory}`);
  }

  return commands;
}

async function findCommandFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findCommandFiles(entryPath)));
      continue;
    }

    if (isCommandFile(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function isCommandFile(fileName: string): boolean {
  return (
    fileName.endsWith('.command.ts') ||
    (fileName.endsWith('.command.js') && !fileName.endsWith('.d.ts'))
  );
}

async function loadCommand(filePath: string): Promise<Command> {
  const commandModule: unknown = await import(pathToFileURL(filePath).href);

  if (!isCommandModule(commandModule)) {
    throw new Error(
      `${filePath} must export "command" with name, descriptionKey, access, and handle fields`,
    );
  }

  return commandModule.command;
}

function isCommandModule(value: unknown): value is { command: Command } {
  if (!isRecord(value)) return false;
  return isCommand(value.command);
}

function isCommand(value: unknown): value is Command {
  if (!isRecord(value)) return false;
  if (typeof value.name !== 'string') return false;
  if (typeof value.descriptionKey !== 'string') return false;
  if (value.access !== 'user' && value.access !== 'owner') return false;
  return typeof value.handle === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
