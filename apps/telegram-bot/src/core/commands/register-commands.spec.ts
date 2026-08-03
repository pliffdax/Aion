import assert from 'node:assert/strict';
import test from 'node:test';
import type { Command } from './command.js';
import { visibleCommands } from './register-commands.js';
import { command as pingCommand } from '../../features/ping/ping.command.js';
import { renderWelcome } from '../../features/start/start.command.js';
import { command as whoamiCommand } from '../../features/whoami/whoami.command.js';

const userCommands: Command[] = [
  {
    name: 'start',
    descriptionKey: 'command.start.description',
    access: 'user',
    async handle() {},
  },
  {
    name: 'help',
    descriptionKey: 'command.help.description',
    access: 'user',
    async handle() {},
  },
  pingCommand,
  whoamiCommand,
];

test('shows ping and whoami only to the owner', () => {
  assert.equal(pingCommand.access, 'owner');
  assert.equal(whoamiCommand.access, 'owner');
  assert.deepEqual(
    visibleCommands(userCommands, false).map(command => command.name),
    ['start', 'help'],
  );
  assert.deepEqual(
    visibleCommands(userCommands, true).map(command => command.name),
    ['start', 'help', 'ping', 'whoami'],
  );
});

test('renders the welcome with the commands visible to the current user', () => {
  const regularWelcome = renderWelcome('ru', visibleCommands(userCommands, false));
  const ownerWelcome = renderWelcome('ru', visibleCommands(userCommands, true));

  assert.match(regularWelcome, /личный помощник/);
  assert.match(regularWelcome, /\/start/);
  assert.match(regularWelcome, /\/help/);
  assert.doesNotMatch(regularWelcome, /\/ping/);
  assert.doesNotMatch(regularWelcome, /\/whoami/);
  assert.match(ownerWelcome, /\/ping/);
  assert.match(ownerWelcome, /\/whoami/);
});
