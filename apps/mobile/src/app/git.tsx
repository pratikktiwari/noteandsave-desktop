import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { radius, spacing, useTheme } from '@/theme';
import { type AutoSyncInterval, useAutoSyncStore } from '@/git/autoSync';
import { gitSync, type GitConfig, type GitLinkMode } from '@/git/sync';
import { useWorkspaceStore } from '@/store/workspace';

export default function GitScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const refresh = useWorkspaceStore((state) => state.refresh);
  const syncOnStart = useAutoSyncStore((state) => state.syncOnStart);
  const intervalMinutes = useAutoSyncStore((state) => state.intervalMinutes);
  const autoSyncing = useAutoSyncStore((state) => state.syncing);
  const autoSyncError = useAutoSyncStore((state) => state.lastError);
  const autoSyncedAt = useAutoSyncStore((state) => state.lastSyncedAt);
  const setSyncOnStart = useAutoSyncStore((state) => state.setSyncOnStart);
  const setIntervalMinutes = useAutoSyncStore((state) => state.setIntervalMinutes);
  const [config, setConfig] = useState<GitConfig | null>(null);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [mode, setMode] = useState<GitLinkMode>('existing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void gitSync.getConfig().then(setConfig);
  }, []);

  const run = async (operation: () => Promise<GitConfig>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await operation();
      setConfig(next);
      await refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  };

  const link = () => {
    const operation = () => gitSync.link(repositoryUrl, branch, token, mode);
    if (mode === 'new') {
      void run(operation);
      return;
    }
    Alert.alert(
      'Use existing workspace?',
      'The repository workspace will replace the notes on this device. A local backup will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use workspace', style: 'destructive', onPress: () => void run(operation) },
      ],
    );
  };

  if (config) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}>
          <View style={[styles.card, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Repository linked</Text>
            <Text selectable style={[styles.value, { color: colors.muted }]}>{config.repositoryUrl}</Text>
            <Text style={[styles.value, { color: colors.muted }]}>Branch: {config.branch}</Text>
            <Text style={[styles.value, { color: colors.muted }]}>
              {autoSyncedAt || config.lastSyncedAt
                ? `Last synced ${new Date(autoSyncedAt ?? config.lastSyncedAt ?? 0).toLocaleString()}`
                : 'Not synced yet'}
            </Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Auto-sync</Text>
            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={[styles.toggleTitle, { color: colors.text }]}>Sync when app opens</Text>
                <Text style={[styles.modeDetail, { color: colors.muted }]}>Also sync when returning to the app.</Text>
              </View>
              <Switch
                value={syncOnStart}
                onValueChange={(value) => void setSyncOnStart(value)}
                trackColor={{ false: colors.border, true: colors.accentSoft }}
                thumbColor={syncOnStart ? colors.accent : colors.muted}
              />
            </View>
            <Text style={[styles.label, { color: colors.text }]}>While app is open</Text>
            <View style={styles.intervalRow}>
              {([0, 5, 10, 15, 30] as AutoSyncInterval[]).map((minutes) => {
                const selected = intervalMinutes === minutes;
                return (
                  <Pressable
                    key={minutes}
                    onPress={() => void setIntervalMinutes(minutes)}
                    style={[
                      styles.interval,
                      {
                        backgroundColor: selected ? colors.accentSoft : colors.background,
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? colors.accent : colors.muted, fontWeight: '700' }}>
                      {minutes ? `${minutes} min` : 'Off'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.hint, { color: colors.faint }]}>
              Foreground only. Auto-sync pauses while a note editor is open.
            </Text>
          </View>
          {(error || autoSyncError) && <Text style={[styles.error, { color: colors.danger }]}>{error || autoSyncError}</Text>}
          <Pressable
            disabled={busy || autoSyncing}
            onPress={() => void run(() => gitSync.sync())}
            style={[styles.primary, { backgroundColor: colors.accent, opacity: busy || autoSyncing ? 0.6 : 1 }]}
          >
            <Text style={[styles.primaryText, { color: colors.background }]}>
              {busy || autoSyncing ? 'Syncing…' : 'Sync now'}
            </Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => Alert.alert('Unlink repository?', 'Your local notes stay on this device.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Unlink', style: 'destructive', onPress: () => void gitSync.unlink().then(() => setConfig(null)) },
            ])}
            style={[styles.secondary, { borderColor: colors.danger }]}
          >
            <Text style={{ color: colors.danger, fontWeight: '700' }}>Unlink repository</Text>
          </Pressable>
          <Text style={[styles.hint, { color: colors.faint }]}>
            Android may suspend background work, so scheduled sync runs only while the app is open.
          </Text>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}
      >
        <Text style={[styles.title, { color: colors.text }]}>Link a GitHub repository</Text>
        <Text style={[styles.description, { color: colors.muted }]}>
          Use the same private repository and branch as the desktop app. Your token is stored in Android Keystore-backed secure storage.
        </Text>
        <Text style={[styles.label, { color: colors.text }]}>Repository type</Text>
        <Pressable
          onPress={() => {
            setMode('existing');
            setError(null);
          }}
          style={[
            styles.mode,
            {
              backgroundColor: mode === 'existing' ? colors.accentSoft : colors.elevated,
              borderColor: mode === 'existing' ? colors.accent : colors.border,
            },
          ]}
        >
          <Text style={[styles.modeTitle, { color: mode === 'existing' ? colors.accent : colors.text }]}>
            Existing workspace
          </Text>
          <Text style={[styles.modeDetail, { color: colors.muted }]}>
            Download a Note & Save workspace already used by the desktop app.
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setMode('new');
            setError(null);
          }}
          style={[
            styles.mode,
            {
              backgroundColor: mode === 'new' ? colors.accentSoft : colors.elevated,
              borderColor: mode === 'new' ? colors.accent : colors.border,
            },
          ]}
        >
          <Text style={[styles.modeTitle, { color: mode === 'new' ? colors.accent : colors.text }]}>
            New / empty repository
          </Text>
          <Text style={[styles.modeDetail, { color: colors.muted }]}>
            Upload this device&apos;s workspace. Create an empty repository on GitHub first.
          </Text>
        </Pressable>
        <Text style={[styles.label, { color: colors.text }]}>Repository URL</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          value={repositoryUrl}
          onChangeText={setRepositoryUrl}
          placeholder="https://github.com/owner/notes.git"
          placeholderTextColor={colors.faint}
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        />
        <Text style={[styles.label, { color: colors.text }]}>Branch</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          value={branch}
          onChangeText={setBranch}
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        />
        <Text style={[styles.label, { color: colors.text }]}>Personal access token</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={token}
          onChangeText={setToken}
          placeholder="github_pat_…"
          placeholderTextColor={colors.faint}
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        />
        {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
        <Pressable
          disabled={busy || !repositoryUrl.trim() || !token.trim()}
          onPress={link}
          style={[styles.primary, { backgroundColor: colors.accent, opacity: busy || !repositoryUrl.trim() || !token.trim() ? 0.5 : 1 }]}
        >
          <Text style={[styles.primaryText, { color: colors.background }]}>
            {busy ? 'Linking…' : mode === 'existing' ? 'Use existing workspace' : 'Link and upload'}
          </Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.sm },
  card: { padding: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, gap: spacing.sm },
  title: { fontSize: 22, fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  description: { fontSize: 15, lineHeight: 22, marginBottom: spacing.md },
  label: { fontSize: 14, fontWeight: '700', marginTop: spacing.sm },
  mode: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, gap: 4 },
  modeTitle: { fontSize: 16, fontWeight: '700' },
  modeDetail: { fontSize: 13, lineHeight: 19 },
  toggleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  toggleCopy: { flex: 1 },
  toggleTitle: { fontSize: 15, fontWeight: '700' },
  intervalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  interval: { minHeight: 38, paddingHorizontal: 12, borderWidth: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 14, lineHeight: 20 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, fontSize: 16 },
  primary: { minHeight: 52, marginTop: spacing.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontWeight: '700' },
  secondary: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  error: { fontSize: 14, lineHeight: 20 },
});
