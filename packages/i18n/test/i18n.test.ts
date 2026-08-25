import { describe, expect, it } from 'vitest';
import { direction, formatStatusLabel, resources, supportedLocales, translate } from '../src';

describe('localization', () => {
  it('keeps key parity', () => {
    const base = Object.keys(resources.ar.translation).sort();
    for (const locale of supportedLocales)
      expect(Object.keys(resources[locale].translation).sort()).toEqual(base);
  });
  it('uses RTL for Arabic and Urdu', () => {
    expect(direction('ar')).toBe('rtl');
    expect(direction('ur')).toBe('rtl');
    expect(direction('hi')).toBe('ltr');
  });
  it('never returns an empty key', () => {
    for (const locale of supportedLocales)
      expect(translate(locale, 'publishRequest').length).toBeGreaterThan(0);
  });
  it('interpolates named values without evaluating content', () => {
    expect(translate('en', 'versionSummary', { version: 7 })).toBe('Version 7');
    expect(translate('ar', 'requestNumber', { id: '<unsafe>' })).toContain('<unsafe>');
  });
  it('localizes workflow statuses instead of exposing database tokens', () => {
    for (const locale of supportedLocales) {
      expect(formatStatusLabel('in_progress', locale)).not.toBe('in_progress');
      expect(formatStatusLabel('blocked_retention', locale)).not.toBe('blocked_retention');
      expect(formatStatusLabel('unrecognized_state', locale).length).toBeGreaterThan(0);
    }
  });

  it('provides complete localized marketplace trust controls in all four directions', () => {
    const trustKeys = [
      'trustReportUser',
      'trustReportMessage',
      'trustReportRating',
      'trustBlock',
      'trustUnblock',
      'trustReportTitle',
      'trustReportBody',
      'trustReasonLabel',
      'trustReasonHarassment',
      'trustReasonSpam',
      'trustReasonScam',
      'trustReasonSafety',
      'trustReasonInappropriateContent',
      'trustReasonRatingAbuse',
      'trustReasonOther',
      'trustExplanationLabel',
      'trustExplanationPlaceholder',
      'trustSubmitReport',
      'trustBlockTitle',
      'trustBlockBody',
      'trustUnblockTitle',
      'trustUnblockBody',
      'trustConfirmBlock',
      'trustConfirmUnblock',
      'trustReportSuccess',
      'trustBlockSuccess',
      'trustUnblockSuccess',
      'trustReasonRequired',
      'trustErrorAuth',
      'trustErrorValidation',
      'trustErrorRateLimited',
      'trustErrorUnavailable',
      'trustErrorConflict',
      'trustErrorNetwork',
      'trustErrorInvalidResponse',
      'trustErrorUnknown',
      'trustCommunicationBlockedByMe',
      'trustCommunicationBlockedByThem',
      'trustCommunicationUnavailable',
      'trustRatingTitle',
      'trustRatingScore',
    ] as const;
    for (const locale of supportedLocales) {
      for (const key of trustKeys) {
        const value = resources[locale].translation[key];
        expect(value, `${locale}.${key}`).toBeTruthy();
        expect(value, `${locale}.${key}`).not.toBe(key);
      }
    }
    expect(resources.ar.translation.trustReportSuccess).not.toBe(
      resources.en.translation.trustReportSuccess,
    );
    expect(resources.ur.translation.trustReportSuccess).not.toBe(
      resources.en.translation.trustReportSuccess,
    );
    expect(resources.hi.translation.trustReportSuccess).not.toBe(
      resources.en.translation.trustReportSuccess,
    );
    expect(direction('ar')).toBe('rtl');
    expect(direction('ur')).toBe('rtl');
    expect(direction('en')).toBe('ltr');
    expect(direction('hi')).toBe('ltr');
  });

  it('provides complete moderation operations copy in all four locales', () => {
    const moderationKeys = [
      'adminModerationNavigation',
      'adminModerationTitle',
      'adminModerationLead',
      'adminModerationQueueLoadFailed',
      'adminModerationEmpty',
      'adminModerationOperationsScope',
      'adminModerationAssignedScope',
      'adminModerationDelegatedScope',
      'adminModerationEvidence',
      'adminModerationEvidenceUnavailable',
      'adminModerationHistory',
      'adminModerationHistoryTruncated',
      'adminModerationReason',
      'adminModerationPriorityLow',
      'adminModerationPriorityNormal',
      'adminModerationPriorityHigh',
      'adminModerationPriorityUrgent',
      'adminModerationTriage',
      'adminModerationEscalate',
      'adminModerationDismiss',
      'adminModerationResolve',
      'adminModerationLinkCustomer',
      'adminModerationLinkProvider',
      'adminModerationSuspensionSeparation',
      'adminModerationSuccessTriaged',
      'adminModerationSuccessEscalated',
      'adminModerationSuccessDismissed',
      'adminModerationSuccessResolved',
      'adminModerationErrorValidation',
      'adminModerationErrorConflict',
      'adminModerationErrorPermission',
      'adminModerationErrorNotFound',
      'adminModerationErrorState',
      'adminModerationErrorUnavailable',
      'adminModerationCaseReviewTitle',
      'adminModerationCaseId',
      'adminModerationOpenSupportCase',
      'adminModerationAssignment',
      'adminModerationDelegation',
      'adminModerationAccessActive',
      'adminModerationAccessExpired',
      'adminModerationAccessEnded',
      'adminModerationAccessScheduled',
      'adminModerationAccessRevoked',
      'adminModerationNoCaseAccess',
      'adminModerationPermissionRead',
      'adminModerationPermissionEvidence',
      'adminModerationPermissionInternalNote',
      'adminModerationPermissionExactLocation',
      'adminModerationCustomerEnforcementTitle',
      'adminModerationCustomerEnforcementLead',
      'adminModerationEnforcementTarget',
      'adminModerationDesiredAccountStatus',
      'adminModerationAccountActive',
      'adminModerationAccountSuspended',
      'adminModerationApplyAccountStatus',
      'adminModerationBackToQueue',
      'adminModerationNextPage',
      'adminModerationFirstPage',
      'adminModerationCustomerEnforcementSuccess',
      'adminModerationEnforcementTargetsUnavailable',
    ] as const;
    for (const locale of supportedLocales) {
      const translation = resources[locale].translation as Readonly<Record<string, string>>;
      for (const key of moderationKeys) {
        expect(translation[key], `${locale}.${key}`).toBeTruthy();
        expect(translation[key], `${locale}.${key}`).not.toBe(key);
      }
      for (const status of ['triaged', 'escalated', 'dismissed']) {
        expect(formatStatusLabel(status, locale)).not.toBe(status);
      }
    }
    expect(resources.ur.translation.adminModerationTitle).not.toBe(
      resources.en.translation.adminModerationTitle,
    );
    expect(resources.hi.translation.adminModerationTitle).not.toBe(
      resources.en.translation.adminModerationTitle,
    );
  });

  it('provides localized foreground-location recovery actions in every supported locale', () => {
    const locationRecoveryKeys = ['openDeviceSettings', 'locationUsingRecentFix'] as const;
    for (const locale of supportedLocales) {
      const translation = resources[locale].translation as Readonly<Record<string, string>>;
      for (const key of locationRecoveryKeys) {
        expect(translation[key], `${locale}.${key}`).toBeTruthy();
        expect(translation[key], `${locale}.${key}`).not.toBe(key);
      }
    }
    expect(resources.ar.translation.openDeviceSettings).not.toBe(
      resources.en.translation.openDeviceSettings,
    );
    expect(resources.ur.translation.locationUsingRecentFix).not.toBe(
      resources.en.translation.locationUsingRecentFix,
    );
    expect(resources.hi.translation.locationUsingRecentFix).not.toBe(
      resources.en.translation.locationUsingRecentFix,
    );
  });
});
