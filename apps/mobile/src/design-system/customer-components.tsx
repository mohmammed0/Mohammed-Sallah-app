import type { ComponentProps, ReactNode } from 'react';
import {
  Image,
  Modal as NativeModal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import {
  ActionButton,
  CustomerScreen,
  EmptyState,
  Field,
  IconButton,
  LoadingBlock,
  Notice,
  Pill,
  SectionHeader,
  Surface,
  customerStyles,
} from './primitives';
import { AppIcon, type AppIconName } from './icon';
import { customerTokens as tokens } from './tokens';

type ActionButtonProps = Omit<ComponentProps<typeof ActionButton>, 'variant'>;

export function AppScreen(props: ComponentProps<typeof CustomerScreen>) {
  return <CustomerScreen {...props} />;
}

export function AppHeader({
  title,
  subtitle,
  backLabel,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack && backLabel ? (
        <IconButton icon="chevron-back" label={backLabel} onPress={onBack} />
      ) : (
        <View style={styles.headerPlaceholder} />
      )}
      <View style={styles.headerCopy}>
        <Text accessibilityRole="header" numberOfLines={2} style={customerStyles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={customerStyles.caption}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ?? <View style={styles.headerPlaceholder} />}
    </View>
  );
}

export function LocationHeader({
  label,
  address,
  changeLabel,
  onPress,
  notificationLabel,
  unreadCount,
  onNotifications,
}: {
  label: string;
  address: string;
  changeLabel: string;
  onPress: () => void;
  notificationLabel?: string;
  unreadCount?: number;
  onNotifications?: () => void;
}) {
  return (
    <View style={styles.locationHeader}>
      <Pressable
        accessibilityHint={changeLabel}
        accessibilityRole="button"
        onPress={onPress}
        style={(state: PressableStateCallbackType): StyleProp<ViewStyle> => [
          styles.locationAction,
          state.focused && styles.focused,
          state.pressed && styles.pressed,
        ]}
      >
        <View style={styles.roundIcon}>
          <AppIcon color={tokens.colors.primaryStrong} name="location" size={20} />
        </View>
        <View style={styles.flex}>
          <Text numberOfLines={1} style={customerStyles.caption}>
            {label}
          </Text>
          <Text numberOfLines={2} style={styles.locationAddress}>
            {address}
          </Text>
        </View>
        <AppIcon color={tokens.colors.textMuted} name="chevron-forward" size={18} />
      </Pressable>
      {notificationLabel && onNotifications ? (
        <IconButton
          {...(unreadCount === undefined ? {} : { badge: unreadCount })}
          icon="bell"
          label={notificationLabel}
          onPress={onNotifications}
        />
      ) : null}
    </View>
  );
}

export interface BottomTabItem {
  key: string;
  label: string;
  icon: AppIconName;
}

export function BottomTabs({
  tabs,
  activeKey,
  onSelect,
}: {
  tabs: readonly BottomTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.tabs}>
      {tabs.map((tab) => {
        const selected = tab.key === activeKey;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            style={(state: PressableStateCallbackType): StyleProp<ViewStyle> => [
              styles.tab,
              state.pressed && styles.pressed,
            ]}
          >
            <AppIcon
              color={selected ? tokens.colors.primaryStrong : tokens.colors.textMuted}
              name={tab.icon}
            />
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrimaryButton(props: ActionButtonProps) {
  return <ActionButton {...props} variant="primary" />;
}

export function SecondaryButton(props: ActionButtonProps) {
  return <ActionButton {...props} variant="secondary" />;
}

export function GhostButton(props: ActionButtonProps) {
  return <ActionButton {...props} variant="ghost" />;
}

function SelectableServiceCard({
  title,
  description,
  icon,
  selected = false,
  compact = false,
  ...props
}: PressableProps & {
  title: string;
  description?: string;
  icon: AppIconName;
  selected?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={(state: PressableStateCallbackType): StyleProp<ViewStyle> => [
        styles.serviceCard,
        compact && styles.subcategoryCard,
        selected && styles.serviceCardSelected,
        state.focused && styles.focused,
        state.pressed && styles.pressed,
      ]}
    >
      <View style={styles.serviceIcon}>
        <AppIcon color={tokens.colors.primaryStrong} name={icon} size={compact ? 21 : 28} />
      </View>
      <Text numberOfLines={2} style={customerStyles.section}>
        {title}
      </Text>
      {description ? (
        <Text numberOfLines={2} style={customerStyles.caption}>
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function ServiceCategoryCard(
  props: ComponentProps<typeof SelectableServiceCard>,
) {
  return <SelectableServiceCard {...props} />;
}

export function ServiceSubcategoryCard(
  props: Omit<ComponentProps<typeof SelectableServiceCard>, 'compact'>,
) {
  return <SelectableServiceCard {...props} compact />;
}

export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'active' | 'success' | 'warning' | 'danger';
}) {
  return (
    <View
      style={[
        styles.statusPill,
        tone === 'active' && styles.statusActive,
        tone === 'success' && styles.statusSuccess,
        tone === 'warning' && styles.statusWarning,
        tone === 'danger' && styles.statusDanger,
      ]}
    >
      <Text style={styles.statusLabel}>{label}</Text>
    </View>
  );
}

export { SectionHeader };

export function ErrorState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <EmptyState
      {...(actionLabel === undefined ? {} : { actionLabel })}
      {...(onAction === undefined ? {} : { onAction })}
      body={body}
      icon="alert"
      title={title}
    />
  );
}

export function LoadingSkeleton(props: ComponentProps<typeof LoadingBlock>) {
  return <LoadingBlock {...props} />;
}

export function Toast({
  message,
  tone = 'info',
}: {
  message: string;
  tone?: 'info' | 'warning' | 'danger' | 'success';
}) {
  return (
    <Notice live tone={tone}>
      {message}
    </Notice>
  );
}

function DialogFrame({
  title,
  dismissLabel,
  onDismiss,
  children,
}: {
  title: string;
  dismissLabel: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <View accessibilityViewIsModal style={styles.dialog}>
      <View style={styles.dialogHeader}>
        <Text accessibilityRole="header" style={customerStyles.title}>
          {title}
        </Text>
        <IconButton icon="close" label={dismissLabel} onPress={onDismiss} />
      </View>
      {children}
    </View>
  );
}

export function BottomSheet({
  visible,
  title,
  dismissLabel,
  onDismiss,
  children,
}: {
  visible: boolean;
  title: string;
  dismissLabel: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <NativeModal
      animationType="slide"
      onRequestClose={onDismiss}
      transparent
      visible={visible}
    >
      <View style={styles.sheetLayer}>
        <Pressable
          accessibilityLabel={dismissLabel}
          accessibilityRole="button"
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
        <DialogFrame dismissLabel={dismissLabel} onDismiss={onDismiss} title={title}>
          {children}
        </DialogFrame>
      </View>
    </NativeModal>
  );
}

export function Modal(props: ComponentProps<typeof BottomSheet>) {
  return <BottomSheet {...props} />;
}

export function SearchField({
  label,
  ...props
}: Omit<TextInputProps, 'accessibilityLabel'> & { label: string }) {
  return <Field {...props} icon="search" label={label} />;
}

export function FormField(props: ComponentProps<typeof Field>) {
  return <Field {...props} />;
}

export function ChatBubble({
  role,
  label,
  message,
  pending = false,
}: {
  role: 'assistant' | 'customer';
  label: string;
  message: string;
  pending?: boolean;
}) {
  const assistant = role === 'assistant';
  return (
    <View
      accessibilityLabel={label + ': ' + message}
      accessibilityRole="text"
      style={[styles.chatRow, assistant ? styles.chatAssistantRow : styles.chatCustomerRow]}
    >
      {assistant ? (
        <View style={styles.chatAvatar}>
          <AppIcon color={tokens.colors.primaryStrong} name="sparkles" size={17} />
        </View>
      ) : null}
      <View style={[styles.chatBubble, assistant ? styles.chatAssistant : styles.chatCustomer]}>
        <Text style={[customerStyles.caption, !assistant && styles.chatCustomerText]}>{label}</Text>
        <Text style={[customerStyles.body, !assistant && styles.chatCustomerText]}>{message}</Text>
        {pending ? <Text style={customerStyles.caption}>•••</Text> : null}
      </View>
    </View>
  );
}

export function ChatComposer({
  value,
  placeholder,
  cameraLabel,
  galleryLabel,
  voiceLabel,
  sendLabel,
  disabled = false,
  onChangeText,
  onCamera,
  onGallery,
  onVoice,
  onSend,
}: {
  value: string;
  placeholder: string;
  cameraLabel: string;
  galleryLabel: string;
  voiceLabel: string;
  sendLabel: string;
  disabled?: boolean;
  onChangeText: (value: string) => void;
  onCamera: () => void;
  onGallery: () => void;
  onVoice: () => void;
  onSend: () => void;
}) {
  return (
    <Surface style={styles.composer}>
      <TextInput
        accessibilityLabel={placeholder}
        maxLength={8000}
        multiline
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.colors.textMuted}
        style={styles.composerInput}
        value={value}
      />
      <View style={styles.composerActions}>
        <IconButton icon="camera" label={cameraLabel} onPress={onCamera} />
        <IconButton icon="image" label={galleryLabel} onPress={onGallery} />
        <IconButton icon="microphone" label={voiceLabel} onPress={onVoice} />
        <IconButton disabled={disabled} icon="send" label={sendLabel} onPress={onSend} />
      </View>
    </Surface>
  );
}

export function QuickReplyChip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return <Pill label={label} onPress={onPress} selected={selected} />;
}

export function MediaPreview({
  kind,
  label,
  imageSource,
  onRemove,
  removeLabel,
}: {
  kind: 'image' | 'voice';
  label: string;
  imageSource?: ImageSourcePropType;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <Surface style={styles.mediaPreview} tone="muted">
      {kind === 'image' && imageSource ? (
        <Image accessibilityLabel={label} source={imageSource} style={styles.previewImage} />
      ) : (
        <AppIcon color={tokens.colors.primaryStrong} name="microphone" size={24} />
      )}
      <Text numberOfLines={2} style={[customerStyles.caption, styles.flex]}>
        {label}
      </Text>
      {onRemove && removeLabel ? (
        <IconButton icon="close" label={removeLabel} onPress={onRemove} />
      ) : null}
    </Surface>
  );
}

export function AddressCard({
  label,
  address,
  selected = false,
  onPress,
  action,
}: {
  label: string;
  address: string;
  selected?: boolean;
  onPress?: () => void;
  action?: ReactNode;
}) {
  const body = (
    <>
      <View style={styles.roundIcon}>
        <AppIcon color={tokens.colors.primaryStrong} name="location" size={20} />
      </View>
      <View style={styles.flex}>
        <Text style={customerStyles.section}>{label}</Text>
        <Text numberOfLines={3} style={customerStyles.caption}>
          {address}
        </Text>
      </View>
      {selected ? <AppIcon color={tokens.colors.success} name="check" size={20} /> : action}
    </>
  );
  if (!onPress) return <Surface style={styles.addressCard}>{body}</Surface>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={(state: PressableStateCallbackType): StyleProp<ViewStyle> => [
        styles.addressCard,
        selected && styles.serviceCardSelected,
        state.focused && styles.focused,
        state.pressed && styles.pressed,
      ]}
    >
      {body}
    </Pressable>
  );
}

export function LocationPermissionCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Surface tone="accent">
      <View style={styles.permissionLead}>
        <AppIcon color={tokens.colors.primaryStrong} name="navigation" size={28} />
        <View style={styles.flex}>
          <Text style={customerStyles.section}>{title}</Text>
          <Text style={customerStyles.bodyMuted}>{body}</Text>
        </View>
      </View>
      <SecondaryButton label={actionLabel} onPress={onAction} />
    </Surface>
  );
}

export function MapPin({ label }: { label: string }) {
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="image"
      pointerEvents="none"
      style={styles.mapPin}
    >
      <AppIcon color={tokens.colors.white} name="location" size={24} />
    </View>
  );
}

export function ReviewSummaryCard({
  title,
  value,
  editLabel,
  onEdit,
  icon,
}: {
  title: string;
  value: string;
  editLabel: string;
  onEdit: () => void;
  icon: AppIconName;
}) {
  return (
    <Surface>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewTitle}>
          <AppIcon color={tokens.colors.primaryStrong} name={icon} size={20} />
          <Text style={customerStyles.section}>{title}</Text>
        </View>
        <GhostButton label={editLabel} onPress={onEdit} />
      </View>
      <Text style={customerStyles.body}>{value}</Text>
    </Surface>
  );
}

export function ActiveRequestCard({
  title,
  status,
  statusTone = 'active',
  meta,
  onPress,
}: {
  title: string;
  status: string;
  statusTone?: ComponentProps<typeof StatusPill>['tone'];
  meta?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(state: PressableStateCallbackType): StyleProp<ViewStyle> => [state.focused && styles.focused, pressed && styles.pressed]}
    >
      <Surface>
        <View style={styles.reviewHeader}>
          <Text numberOfLines={2} style={[customerStyles.section, styles.flex]}>
            {title}
          </Text>
          <StatusPill {...(statusTone === undefined ? {} : { tone: statusTone })} label={status} />
        </View>
        {meta ? <Text style={customerStyles.caption}>{meta}</Text> : null}
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: tokens.stateOpacity.pressed },
  focused: {
    borderColor: tokens.focusRing.color,
    borderWidth: tokens.focusRing.width,
  },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  headerCopy: { flex: 1, alignItems: 'flex-start' },
  headerPlaceholder: { width: tokens.touchTarget, height: tokens.touchTarget },
  locationHeader: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  locationAction: {
    minHeight: 58,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
  },
  locationAddress: { ...tokens.type.label, color: tokens.colors.ink, textAlign: 'left' },
  roundIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primarySoft,
  },
  tabs: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.surface,
    borderTopColor: tokens.colors.border,
    borderTopWidth: 1,
  },
  tab: {
    minHeight: 64,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xxs,
  },
  tabLabel: { ...tokens.type.caption, color: tokens.colors.textMuted },
  tabLabelSelected: { color: tokens.colors.primaryStrong },
  serviceCard: {
    minHeight: 154,
    flex: 1,
    minWidth: 142,
    borderRadius: tokens.radius.lg,
    borderColor: tokens.colors.border,
    borderWidth: 1,
    backgroundColor: tokens.colors.surface,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
    ...tokens.shadow.card,
  },
  subcategoryCard: { minHeight: 116 },
  serviceCardSelected: {
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.primarySoft,
  },
  serviceIcon: {
    width: 52,
    height: 52,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primarySoft,
  },
  statusPill: {
    minHeight: 30,
    justifyContent: 'center',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.sm,
    backgroundColor: tokens.colors.surfaceMuted,
  },
  statusActive: { backgroundColor: tokens.colors.primarySoft },
  statusSuccess: { backgroundColor: tokens.colors.successSoft },
  statusWarning: { backgroundColor: tokens.colors.warningSoft },
  statusDanger: { backgroundColor: tokens.colors.dangerSoft },
  statusLabel: { ...tokens.type.caption, color: tokens.colors.ink },
  sheetLayer: { flex: 1, justifyContent: 'flex-end', backgroundColor: tokens.colors.overlay },
  dialog: {
    maxHeight: '88%',
    borderTopStartRadius: tokens.radius.xl,
    borderTopEndRadius: tokens.radius.xl,
    backgroundColor: tokens.colors.surface,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
    ...tokens.shadow.floating,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  chatRow: { flexDirection: 'row', alignItems: 'flex-end', gap: tokens.spacing.xs },
  chatAssistantRow: { justifyContent: 'flex-start' },
  chatCustomerRow: { justifyContent: 'flex-end' },
  chatAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primarySoft,
  },
  chatBubble: {
    maxWidth: '82%',
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.xxs,
  },
  chatAssistant: { backgroundColor: tokens.colors.surface, borderWidth: 1, borderColor: tokens.colors.border },
  chatCustomer: { backgroundColor: tokens.colors.primary },
  chatCustomerText: { color: tokens.colors.white },
  composer: { gap: tokens.spacing.sm },
  composerInput: {
    minHeight: 52,
    maxHeight: 132,
    color: tokens.colors.ink,
    ...tokens.type.body,
    textAlign: 'left',
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.xs,
  },
  mediaPreview: { flexDirection: 'row', alignItems: 'center' },
  previewImage: { width: 68, height: 68, borderRadius: tokens.radius.sm },
  addressCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    padding: tokens.spacing.md,
  },
  permissionLead: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.sm },
  mapPin: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primary,
    borderWidth: 3,
    borderColor: tokens.colors.white,
    ...tokens.shadow.floating,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  reviewTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs },
});
