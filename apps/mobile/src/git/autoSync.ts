import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { gitSync, type GitConfig } from './sync';
import { useWorkspaceStore } from '@/store/workspace';

export type AutoSyncInterval = 0 | 5 | 10 | 15 | 30;

interface AutoSyncSettings {
  syncOnStart: boolean;
  intervalMinutes: AutoSyncInterval;
}

interface AutoSyncState extends AutoSyncSettings {
  loaded: boolean;
  syncing: boolean;
  lastError: string | null;
  lastSyncedAt: number | null;
  initialize: () => Promise<void>;
  setSyncOnStart: (value: boolean) => Promise<void>;
  setIntervalMinutes: (value: AutoSyncInterval) => Promise<void>;
  run: () => Promise<GitConfig | null>;
}

const SETTINGS_KEY = 'noteandsave.git.autoSync';
const defaults: AutoSyncSettings = { syncOnStart: true, intervalMinutes: 10 };
const intervals = new Set<AutoSyncInterval>([0, 5, 10, 15, 30]);

const save = (settings: AutoSyncSettings) =>
  AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

export const useAutoSyncStore = create<AutoSyncState>((set, get) => ({
  ...defaults,
  loaded: false,
  syncing: false,
  lastError: null,
  lastSyncedAt: null,

  initialize: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        set({ loaded: true });
        return;
      }
      const parsed = JSON.parse(raw) as Partial<AutoSyncSettings>;
      set({
        syncOnStart: typeof parsed.syncOnStart === 'boolean' ? parsed.syncOnStart : defaults.syncOnStart,
        intervalMinutes: intervals.has(parsed.intervalMinutes as AutoSyncInterval)
          ? parsed.intervalMinutes as AutoSyncInterval
          : defaults.intervalMinutes,
        loaded: true,
      });
    } catch (error) {
      set({ loaded: true, lastError: error instanceof Error ? error.message : String(error) });
    }
  },

  setSyncOnStart: async (syncOnStart) => {
    const settings = { syncOnStart, intervalMinutes: get().intervalMinutes };
    try {
      await save(settings);
      set({ syncOnStart, lastError: null });
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : String(error) });
    }
  },

  setIntervalMinutes: async (intervalMinutes) => {
    const settings = { syncOnStart: get().syncOnStart, intervalMinutes };
    try {
      await save(settings);
      set({ intervalMinutes, lastError: null });
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : String(error) });
    }
  },

  run: async () => {
    if (get().syncing) return null;
    const config = await gitSync.getConfig();
    if (!config) return null;
    set({ syncing: true, lastError: null });
    try {
      const next = await gitSync.sync();
      await useWorkspaceStore.getState().refresh();
      set({ lastSyncedAt: next.lastSyncedAt });
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ lastError: message });
      return null;
    } finally {
      set({ syncing: false });
    }
  },
}));
