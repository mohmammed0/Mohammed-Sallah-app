import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { translate } from '@sallah/i18n';
import { consoleLogger, createCorrelationId } from '@sallah/observability';

interface MobileAppErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface MobileAppErrorBoundaryState {
  failed: boolean;
  correlationId: string;
}

function MobileErrorFallback({ onReset }: { onReset: () => void }) {
  return (
    <View style={fallbackStyles.screen}>
      <Text accessibilityRole="header" selectable style={fallbackStyles.title}>
        {translate('ar', 'startupErrorTitle')}
      </Text>
      <Text
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        selectable
        style={fallbackStyles.error}
      >
        {translate('ar', 'startupErrorMessage')}
      </Text>
      <Pressable
        accessibilityLabel={translate('ar', 'startupRetryAccessibility')}
        accessibilityRole="button"
        onPress={onReset}
        style={({ pressed }) => [fallbackStyles.button, pressed && fallbackStyles.buttonPressed]}
      >
        <Text style={fallbackStyles.buttonText}>{translate('ar', 'retry')}</Text>
      </Pressable>
    </View>
  );
}

const fallbackStyles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: '#f8f6f1',
  },
  title: {
    color: '#172b25',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'right',
  },
  error: {
    color: '#9b2c2c',
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'right',
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#176b57',
    paddingHorizontal: 20,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
});

export class MobileAppErrorBoundary extends Component<
  MobileAppErrorBoundaryProps,
  MobileAppErrorBoundaryState
> {
  override state: MobileAppErrorBoundaryState = {
    failed: false,
    correlationId: createCorrelationId(),
  };

  static getDerivedStateFromError(): Partial<MobileAppErrorBoundaryState> {
    return { failed: true };
  }

  override componentDidCatch(): void {
    consoleLogger.write({
      level: 'error',
      event: 'mobile_error_boundary',
      correlationId: this.state.correlationId,
      category: 'unexpected',
      attributes: { boundary: 'root' },
    });
  }

  private readonly reset = (): void => {
    this.setState({ failed: false, correlationId: createCorrelationId() }, () => {
      this.props.onReset?.();
    });
  };

  override render(): ReactNode {
    if (this.state.failed) return <MobileErrorFallback onReset={this.reset} />;
    return this.props.children;
  }
}
