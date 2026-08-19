import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Image: 'Image',
  Modal: 'Modal',
  Pressable: 'Pressable',
  StyleSheet: {
    absoluteFill: {},
    create: (styles: Record<string, unknown>) => styles,
  },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}));

vi.mock('../src/design-system/primitives', () => ({
  ActionButton: 'ActionButton',
  CustomerScreen: 'CustomerScreen',
  EmptyState: 'EmptyState',
  Field: 'Field',
  IconButton: 'IconButton',
  InteractivePressable: 'Pressable',
  LoadingBlock: 'LoadingBlock',
  Notice: 'Notice',
  Pill: 'Pill',
  SectionHeader: 'SectionHeader',
  Surface: 'Surface',
  customerStyles: {
    body: {},
    bodyMuted: {},
    caption: {},
    section: {},
    title: {},
  },
}));

vi.mock('../src/design-system/icon', () => ({
  AppIcon: 'AppIcon',
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('customer marketplace components', () => {
  it('makes the location header and notification affordance accessible', async () => {
    const onPress = vi.fn();
    const onNotifications = vi.fn();
    const { LocationHeader } = await import('../src/design-system/customer-components');
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(
        <LocationHeader
          address="Synthetic address"
          changeLabel="Change location"
          label="Home"
          notificationLabel="Notifications"
          onNotifications={onNotifications}
          onPress={onPress}
          unreadCount={3}
        />,
      );
    });
    const location = renderer?.root.findByType('Pressable');
    expect(location?.props.accessibilityRole).toBe('button');
    await act(() => {
      location?.props.onPress();
    });
    expect(onPress).toHaveBeenCalledOnce();
    const notification = renderer?.root.findByType('IconButton');
    expect(notification?.props.badge).toBe(3);
  });

  it('exposes selected service cards and logical quick replies', async () => {
    const onService = vi.fn();
    const onReply = vi.fn();
    const { ServiceCategoryCard, QuickReplyChip } =
      await import('../src/design-system/customer-components');
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(
        <>
          <ServiceCategoryCard
            description="Water services"
            icon="plumbing"
            onPress={onService}
            selected
            title="Plumbing"
          />
          <QuickReplyChip label="Not sure" onPress={onReply} />
        </>,
      );
    });
    const service = renderer?.root.findByType('Pressable');
    expect(service?.props.accessibilityState).toEqual({ selected: true });
    const chip = renderer?.root.findByType('Pill');
    await act(() => {
      chip?.props.onPress();
    });
    expect(onReply).toHaveBeenCalledOnce();
  });

  it('keeps camera, gallery, voice and send as distinct chat intents', async () => {
    const handlers = {
      onCamera: vi.fn(),
      onGallery: vi.fn(),
      onVoice: vi.fn(),
      onSend: vi.fn(),
      onChangeText: vi.fn(),
    };
    const { ChatComposer } = await import('../src/design-system/customer-components');
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(
        <ChatComposer
          cameraLabel="Camera"
          galleryLabel="Gallery"
          placeholder="Describe"
          sendLabel="Send"
          value=""
          voiceLabel="Voice"
          {...handlers}
        />,
      );
    });
    const input = renderer?.root.findByType('TextInput');
    await act(() => {
      input?.props.onChangeText('A detailed issue');
    });
    expect(handlers.onChangeText).toHaveBeenCalledWith('A detailed issue');
    const buttons = renderer?.root.findAllByType('IconButton') ?? [];
    expect(buttons.map((button) => button.props.icon)).toEqual([
      'camera',
      'image',
      'microphone',
      'send',
    ]);
    await act(() => {
      buttons[3]?.props.onPress();
    });
    expect(handlers.onSend).toHaveBeenCalledOnce();
  });
});
