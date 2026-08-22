import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '@/theme';

interface TextPromptProps {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}

export function TextPrompt({ visible, title, initialValue = '', placeholder, allowEmpty = false, onCancel, onSubmit }: TextPromptProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [initialValue, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close prompt"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
            onPress={onCancel}
          />
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.elevated,
                paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.md,
              },
            ]}
          >
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <TextInput
              autoFocus
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={colors.faint}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              onSubmitEditing={() => (allowEmpty || value.trim()) && onSubmit(value.trim())}
            />
            <View style={styles.actions}>
              <Pressable onPress={onCancel} style={styles.action}><Text style={{ color: colors.muted }}>Cancel</Text></Pressable>
              <Pressable
                disabled={!allowEmpty && !value.trim()}
                onPress={() => onSubmit(value.trim())}
                style={[styles.action, styles.primary, { backgroundColor: colors.accent, opacity: allowEmpty || value.trim() ? 1 : 0.5 }]}
              >
                <Text style={{ color: colors.background, fontWeight: '700' }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  card: {
    width: '100%',
    maxWidth: 520,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontSize: 20, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, fontSize: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginBottom: 6 },
  action: { minWidth: 80, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  primary: { paddingHorizontal: spacing.md },
});
