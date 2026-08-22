import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as git from 'isomorphic-git';

import { FileWorkspace } from './file-workspace';
import {
  DEFAULT_SYNC_INTERVAL_MINUTES,
  normalizeSyncIntervalMinutes,
  reconcileWorkspace,
} from './git-sync';

const REPOSITORY_URL = 'https://github.com/example/noteandsave-test.git';

test('sync interval defaults to five minutes and accepts valid persisted values', () => {
  assert.equal(DEFAULT_SYNC_INTERVAL_MINUTES, 5);
  assert.equal(normalizeSyncIntervalMinutes(undefined), 5);
  assert.equal(normalizeSyncIntervalMinutes(30), 30);
  assert.equal(normalizeSyncIntervalMinutes(0), 5);
  assert.equal(normalizeSyncIntervalMinutes(1.5), 5);
});

const commitWorkspace = async (root: string): Promise<void> => {
  await git.init({ fs, dir: root, defaultBranch: 'main' });
  await git.addRemote({ fs, dir: root, remote: 'origin', url: REPOSITORY_URL });
  for (const [filepath, , workdir] of await git.statusMatrix({ fs, dir: root })) {
    if (workdir !== 0) await git.add({ fs, dir: root, filepath });
  }
  await git.commit({
    fs,
    dir: root,
    message: 'Base',
    author: { name: 'Test', email: 'test@example.com' },
  });
};

test('three-way reconciliation keeps remote originals and local conflict copies', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'noteandsave-reconcile-'));
  const liveRoot = path.join(parent, 'live');
  const stagingRoot = path.join(parent, 'remote');
  try {
    const live = new FileWorkspace(liveRoot);
    live.initialize('workspace-1', 1);
    live.saveImage({ id: 'asset-1', mimeType: 'image/png', data: new Uint8Array([1]) });
    live.createNote({
      id: 'note-1',
      title: 'Base',
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'image',
            attrs: { src: 'noteandsave-asset://asset-1.png', alt: 'asset', title: null },
          }],
        }],
      },
    });
    await commitWorkspace(liveRoot);
    fs.cpSync(liveRoot, stagingRoot, { recursive: true, filter: (entry) => path.basename(entry) !== '.git' });

    live.updateNote('note-1', { title: 'Local edit' });
    live.saveImage({ id: 'asset-1', mimeType: 'image/png', data: new Uint8Array([2]) });
    const remote = new FileWorkspace(stagingRoot);
    remote.updateNote('note-1', { title: 'Remote edit' });
    remote.saveImage({ id: 'asset-1', mimeType: 'image/png', data: new Uint8Array([3]) });

    const result = await reconcileWorkspace(liveRoot, stagingRoot, REPOSITORY_URL, 'main');
    assert.equal(result.conflictCount, 2);
    assert.equal(remote.getNote('note-1')?.title, 'Remote edit');
    const conflict = remote.listNotes(true).find((note) => note.id !== 'note-1');
    assert.match(conflict?.title ?? '', /Local edit \(Conflict/);
    assert.match(JSON.stringify(conflict?.content), /noteandsave-asset:\/\/asset-1-conflict-/);
    assert.equal(fs.readdirSync(remote.assetsPath).length, 2);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('remote-only changes replace an unchanged local record without a conflict', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'noteandsave-remote-change-'));
  const liveRoot = path.join(parent, 'live');
  const stagingRoot = path.join(parent, 'remote');
  try {
    const live = new FileWorkspace(liveRoot);
    live.initialize('workspace-1', 1);
    live.createNote({ id: 'note-1', title: 'Base' });
    await commitWorkspace(liveRoot);
    fs.cpSync(liveRoot, stagingRoot, { recursive: true, filter: (entry) => path.basename(entry) !== '.git' });
    const remote = new FileWorkspace(stagingRoot);
    remote.updateNote('note-1', { title: 'Remote edit' });

    const result = await reconcileWorkspace(liveRoot, stagingRoot, REPOSITORY_URL, 'main');
    assert.equal(result.conflictCount, 0);
    assert.equal(remote.listNotes(true).length, 1);
    assert.equal(remote.getNote('note-1')?.title, 'Remote edit');
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
