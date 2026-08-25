import { Component, type ReactNode } from 'react';
import { Text } from 'react-native';
import { translate } from '@sallah/i18n';
import { consoleLogger, createCorrelationId } from '@sallah/observability';
import { Button, Screen, styles } from '@/components/ui';

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
    <Screen>
      <Text accessibilityRole="header" selectable style={styles.title}>
        {translate('ar', 'startupErrorTitle')}
      </Text>
      <Text
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        selectable
        style={styles.error}
      >
        {translate('ar', 'startupErrorMessage')}
      </Text>
      <Button
        accessibilityLabel={translate('ar', 'startupRetryAccessibility')}
        label={translate('ar', 'retry')}
        onPress={onReset}
      />
    </Screen>
  );
}

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
