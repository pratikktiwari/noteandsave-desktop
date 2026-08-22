import React, { type ComponentProps, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '@/theme';

export interface ActionSheetItem {
  key: string;
  label: string;
  detail?: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  destructive?: boolean;
  onPress: () => void;
}

export function ActionSheet({
  visible,
  title,
  items,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: ActionSheetItem[];
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetOffset = useRef(new Animated.Value(48)).current;
  const nativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    if (visible) {
      setMounted(true);
      backdropOpacity.setValue(0);
      sheetOffset.setValue(48);
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: nativeDriver,
          }),
          Animated.timing(sheetOffset, {
            toValue: 0,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: nativeDriver,
          }),
        ]).start();
      });
      return;
    }
    if (!mounted) return;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.quad),
        useNativeDriver: nativeDriver,
      }),
      Animated.timing(sheetOffset, {
        toValue: 36,
        duration: 190,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: nativeDriver,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [backdropOpacity, mounted, nativeDriver, sheetOffset, visible]);

  const dismiss = (after?: () => void) => {
    onClose();
    if (after) setTimeout(after, 190);
  };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => dismiss()}
    >
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: backdropOpacity }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close actions"
            style={StyleSheet.absoluteFill}
            onPress={() => dismiss()}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.elevated,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.sm,
              transform: [{ translateY: sheetOffset }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{title}</Text>
          <View style={styles.items}>
            {items.map((item) => {
              const color = item.destructive ? colors.danger : colors.text;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  onPress={() => dismiss(item.onPress)}
                  style={({ pressed }) => [
                    styles.item,
                    { backgroundColor: pressed ? colors.hover : 'transparent' },
                  ]}
                >
                  <View style={[styles.icon, { backgroundColor: item.destructive ? `${colors.danger}18` : colors.accentSoft }]}>
                    <Ionicons name={item.icon} size={21} color={item.destructive ? colors.danger : colors.accent} />
                  </View>
                  <View style={styles.itemText}>
                    <Text style={[styles.label, { color }]}>{item.label}</Text>
                    {!!item.detail && <Text style={[styles.detail, { color: colors.muted }]}>{item.detail}</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => dismiss()}
            style={({ pressed }) => [
              styles.cancel,
              { borderColor: colors.border, backgroundColor: pressed ? colors.hover : colors.background },
            ]}
          >
            <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  title: { fontSize: 19, fontWeight: '700', paddingHorizontal: spacing.xs, marginBottom: spacing.sm },
  items: { gap: 2 },
  item: { minHeight: 62, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.sm },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1 },
  label: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13, marginTop: 2 },
  cancel: {
    minHeight: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: 6,
  },
  cancelText: { fontSize: 16, fontWeight: '700' },
});
