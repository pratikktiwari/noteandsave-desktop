import { Directory, File, Paths } from 'expo-file-system';
import { toFileUri } from './path';

const fsError = (code: string, path: string) => Object.assign(new Error(`${code}: ${path}`), { code });

const stat = async (path: string) => {
  const target = toFileUri(path);
  const info = Paths.info(target);
  if (!info.exists) throw fsError('ENOENT', path);
  const isDirectory = info.isDirectory === true;
  const item = isDirectory ? new Directory(target) : new File(target);
  const details = item.info();
  const modified = details.modificationTime ?? Date.now() / 1000;
  return {
    size: 'size' in details && typeof details.size === 'number' ? details.size : 0,
    mode: isDirectory ? 0o040755 : 0o100644,
    mtimeMs: modified * 1000,
    ctimeMs: modified * 1000,
    isFile: () => !isDirectory,
    isDirectory: () => isDirectory,
    isSymbolicLink: () => false,
  };
};

export const expoFs = {
  promises: {
    async readFile(path: string, options?: string | { encoding?: string }) {
      const file = new File(toFileUri(path));
      if (!file.exists) throw fsError('ENOENT', path);
      const encoding = typeof options === 'string' ? options : options?.encoding;
      return encoding === 'utf8' || encoding === 'utf-8' ? file.text() : file.bytes();
    },
    async writeFile(path: string, data: string | Uint8Array) {
      const file = new File(toFileUri(path));
      if (!file.parentDirectory.exists) file.parentDirectory.create({ intermediates: true, idempotent: true });
      if (!file.exists) file.create();
      file.write(data);
    },
    async unlink(path: string) {
      const file = new File(toFileUri(path));
      if (!file.exists) throw fsError('ENOENT', path);
      file.delete();
    },
    async readdir(path: string) {
      const directory = new Directory(toFileUri(path));
      if (!directory.exists) throw fsError('ENOENT', path);
      return directory.list().map((entry) => entry.name);
    },
    async mkdir(path: string) {
      const directory = new Directory(toFileUri(path));
      if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    },
    async rmdir(path: string) {
      const directory = new Directory(toFileUri(path));
      if (!directory.exists) throw fsError('ENOENT', path);
      directory.delete();
    },
    async readlink(path: string) {
      throw fsError('EINVAL', path);
    },
    async symlink(_target: string, path: string) {
      throw fsError('ENOSYS', path);
    },
    stat,
    lstat: stat,
  },
};

export type ExpoFsClient = typeof expoFs;
