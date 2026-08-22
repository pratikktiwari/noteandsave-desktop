export interface GitConfig {
  repositoryUrl: string;
  branch: string;
  lastSyncedAt: number | null;
}

const unsupported = (): never => {
  throw new Error('Git sync is available in the Android app, not in the browser preview');
};

export const gitSync = {
  async getConfig(): Promise<GitConfig | null> {
    return null;
  },

  async link(): Promise<GitConfig> {
    return unsupported();
  },

  async sync(): Promise<GitConfig> {
    return unsupported();
  },

  async unlink(): Promise<void> {
    return unsupported();
  },
};
