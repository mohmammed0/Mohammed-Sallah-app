import OpenAI from 'npm:openai@7.5.0';
import { z } from 'npm:zod@4.4.3';
import { authenticatedUser, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';
import { parseAppEnvironment } from '../_shared/scanner-control.ts';
import {
  briefLocaleSchema,
  deterministicTestTranslation,
  originalBriefSchema,
  protectedBriefFields,
  providerBriefRequestSchema,
  type TranslatedFields,
  translatedFieldsSchema,
} from '../_shared/translation.ts';
import {
  createOpenAiTranslationProvider,
  OPENAI_TRANSLATION_PROMPT_VERSION,
} from '../_shared/openai-translation.ts';
import {
  DEFAULT_OPENAI_TRANSLATION_MODEL,
  OPENAI_TRANSLATION_DEADLINE_MS,
  OpenAiCallError,
  OpenAiResponseError,
} from '../_shared/openai-runtime.ts';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function providerFailure(error: unknown): {
  category: string;
  attempts: number;
  inputUnits: number;
  outputUnits: number;
} {
  if (error instanceof OpenAiCallError) {
    return { category: error.category, attempts: error.attempts, inputUnits: 0, outputUnits: 0 };
  }
  if (error instanceof OpenAiResponseError) {
    return {
      category: error.category,
      attempts: error.attempts,
      inputUnits: error.inputUnits,
      outputUnits: error.outputUnits,
    };
  }
  return {
    category: error instanceof Error && error.message === 'PROVIDER_NOT_CONFIGURED'
      ? 'provider_not_configured'
      : 'provider_unavailable',
    attempts: 0,
    inputUnits: 0,
    outputUnits: 0,
  };
}

Deno.serve(async (request) => {
  const correlationId = crypto.randomUUID();
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);
  const started = Date.now();
  try {
    const environment = parseAppEnvironment(Deno.env.get('APP_ENV'));
    const user = await authenticatedUser(request);
    const input = providerBriefRequestSchema.parse(await request.json());
    const db = serviceClient();
    const { data: match, error: matchError } = await db
      .from('request_provider_matches')
      .select('id,status,expires_at')
      .eq('request_id', input.requestId)
      .eq('provider_id', user.id)
      .in('status', ['invited', 'viewed', 'offered', 'selected'])
      .maybeSingle();
    if (matchError) throw new Error(`MATCH_QUERY_${matchError.code || 'FAILED'}`);
    if (!match) throw new Error('REQUEST_ACCESS_DENIED');
    if (match.expires_at && new Date(match.expires_at).getTime() <= Date.now()) {
      throw new Error('MATCH_EXPIRED');
    }

    const [{ data: provider }, { data: serviceRequest }, { data: safetyRows }] = await Promise.all([
      db
        .from('provider_profiles')
        .select('preferred_brief_locale')
        .eq('user_id', user.id)
        .single(),
      db
        .from('service_requests')
        .select(
          'title,structured_description,original_text,original_locale,urgency,requested_start,timing_mode,version,category_id,city_id,district_id',
        )
        .eq('id', input.requestId)
        .single(),
      db
        .from('request_safety_flags')
        .select('flag_type,severity')
        .eq('request_id', input.requestId)
        .limit(20),
    ]);
    if (!provider || !serviceRequest) throw new Error('REQUEST_NOT_FOUND');
    const sourceLocale = briefLocaleSchema.parse(serviceRequest.original_locale);
    const targetLocale = briefLocaleSchema.parse(provider.preferred_brief_locale);
    const [{ data: category }, { data: city }] = await Promise.all([
      db
        .from('service_categories')
        .select('slug,service_category_translations(locale,name)')
        .eq('id', serviceRequest.category_id)
        .single(),
      db.from('cities').select('code,name_ar,name_en').eq('id', serviceRequest.city_id).single(),
    ]);
    if (!category || !city) throw new Error('CATALOG_NOT_FOUND');
    const categoryName = category.service_category_translations.find(
      (entry: { locale: string; name: string }) => entry.locale === sourceLocale,
    )?.name ?? category.slug;
    const original = originalBriefSchema.parse({
      title: serviceRequest.title.slice(0, 500),
      problemSummary: serviceRequest.structured_description.slice(0, 8000),
      originalText: serviceRequest.original_text.slice(0, 8000),
      categoryName,
      categorySlug: category.slug,
      cityName: sourceLocale === 'en' ? city.name_en : city.name_ar,
      cityCode: city.code,
      districtId: serviceRequest.district_id,
      urgency: serviceRequest.urgency,
      requestedStart: serviceRequest.requested_start,
      timingMode: serviceRequest.timing_mode,
      requestVersion: serviceRequest.version,
      safetyNotes: (safetyRows ?? []).map(
        (entry: { flag_type: string; severity: string }) =>
          `${entry.flag_type} (${entry.severity})`,
      ),
    });
    const sourceHash = await sha256(JSON.stringify(original));
    const configuredProvider = Deno.env.get('TRANSLATION_PROVIDER');
    const testProviderAllowed = ['local', 'test'].includes(environment) &&
      configuredProvider === 'deterministic';
    const providerName = sourceLocale === targetLocale
      ? 'identity'
      : configuredProvider === 'openai'
      ? 'openai'
      : testProviderAllowed
      ? 'deterministic-test'
      : configuredProvider === 'disabled' || configuredProvider === undefined
      ? 'disabled'
      : 'unsupported';
    if (providerName === 'unsupported') throw new Error('TRANSLATION_PROVIDER_UNSUPPORTED');
    if (configuredProvider === 'deterministic' && !testProviderAllowed) {
      throw new Error('TRANSLATION_PROVIDER_NOT_ALLOWED');
    }
    const model = providerName === 'openai'
      ? Deno.env.get('OPENAI_TRANSLATION_MODEL') ?? DEFAULT_OPENAI_TRANSLATION_MODEL
      : providerName === 'deterministic-test'
      ? 'local-test-v1'
      : 'none';
    const promptVersion = providerName === 'openai'
      ? OPENAI_TRANSLATION_PROMPT_VERSION
      : 'provider-brief-v1';
    const modelVersion = `${promptVersion}:${providerName}:${model}`;

    const { data: existing } = await db
      .from('request_translations')
      .select('id,status,translated_content')
      .eq('request_id', input.requestId)
      .eq('target_locale', targetLocale)
      .maybeSingle();
    if (!input.force && existing?.status === 'completed' && existing.translated_content) {
      const cached = z
        .object({ fields: translatedFieldsSchema, metadata: z.record(z.string(), z.unknown()) })
        .safeParse(existing.translated_content);
      if (
        cached.success && cached.data.metadata.provider === providerName &&
        cached.data.metadata.model === model && cached.data.metadata.version === promptVersion &&
        cached.data.metadata.sourceHash === sourceHash
      ) {
        return json(request, {
          translationId: existing.id,
          status: sourceLocale === targetLocale ? 'not_required' : 'completed',
          sourceLocale,
          targetLocale,
          original,
          translated: cached.data.fields,
          protected: protectedBriefFields(original),
          metadata: { ...cached.data.metadata, cached: true },
        });
      }
    }

    const { data: translationJob, error: jobError } = await db
      .from('translation_jobs')
      .upsert(
        {
          source_hash: sourceHash,
          source_locale: sourceLocale,
          target_locale: targetLocale,
          provider: providerName,
          model,
          model_version: modelVersion,
          status: 'processing',
          attempts: 0,
          error_category: null,
        },
        { onConflict: 'source_hash,source_locale,target_locale,model_version' },
      )
      .select('id')
      .single();
    if (jobError || !translationJob) throw new Error('TRANSLATION_JOB_FAILED');

    let translated: TranslatedFields | null = null;
    let status: 'completed' | 'not_required' | 'failed';
    let attempts = 0;
    let inputUnits = 0;
    let outputUnits = 0;
    let errorCategory: string | null = null;
    if (sourceLocale === targetLocale) {
      translated = translatedFieldsSchema.parse({
        title: original.title,
        problemSummary: original.problemSummary,
        originalText: original.originalText,
        categoryName: original.categoryName,
        cityName: original.cityName,
        safetyNotes: original.safetyNotes,
      });
      status = 'not_required';
    } else if (testProviderAllowed || providerName === 'openai') {
      const windowStart = new Date();
      windowStart.setUTCMinutes(0, 0, 0);
      const allowed = await db.rpc('consume_rate_limit', {
        p_key_hash: await sha256(user.id),
        p_operation: 'provider_brief_translation',
        p_window_start: windowStart.toISOString(),
        p_limit: 60,
      });
      if (allowed.error || allowed.data !== true) throw new Error('RATE_LIMIT');
      if (testProviderAllowed) {
        translated = deterministicTestTranslation(original, targetLocale);
        attempts = 1;
        status = 'completed';
      } else {
        try {
          const apiKey = Deno.env.get('OPENAI_API_KEY');
          if (!apiKey) throw new Error('PROVIDER_NOT_CONFIGURED');
          const client = new OpenAI({
            apiKey,
            timeout: OPENAI_TRANSLATION_DEADLINE_MS,
            maxRetries: 0,
            logLevel: 'off',
          });
          const provider = createOpenAiTranslationProvider(
            client as unknown as Parameters<typeof createOpenAiTranslationProvider>[0],
            model,
          );
          const live = await provider.translate(original, sourceLocale, targetLocale);
          translated = live.translated;
          attempts = live.attempts;
          inputUnits = live.inputUnits;
          outputUnits = live.outputUnits;
          status = 'completed';
        } catch (error) {
          const failure = providerFailure(error);
          attempts = failure.attempts;
          inputUnits = failure.inputUnits;
          outputUnits = failure.outputUnits;
          errorCategory = failure.category;
          status = 'failed';
          console.error(JSON.stringify({
            event: 'openai_operation_failure',
            operation: 'provider_brief_translation',
            category: failure.category,
            attempts: failure.attempts,
            latencyMs: Date.now() - started,
            correlationId,
          }));
        }
      }
    } else {
      status = 'failed';
      errorCategory = 'provider_not_configured';
    }
    const metadata = {
      provider: providerName,
      model,
      version: promptVersion,
      sourceHash,
      testProvider: providerName === 'deterministic-test',
      cached: false,
      attempts,
      inputUnits,
      outputUnits,
      errorCategory,
    };
    const { data: translationRow, error: translationError } = await db
      .from('request_translations')
      .upsert(
        {
          request_id: input.requestId,
          translation_job_id: translationJob.id,
          source_locale: sourceLocale,
          target_locale: targetLocale,
          original_content: original,
          translated_content: translated ? { fields: translated, metadata } : null,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'request_id,target_locale' },
      )
      .select('id')
      .single();
    if (translationError || !translationRow) throw new Error('TRANSLATION_SAVE_FAILED');
    const [jobUpdate, matchUpdate, usageInsert] = await Promise.all([
      db
        .from('translation_jobs')
        .update({
          status,
          attempts,
          completed_at: new Date().toISOString(),
          error_category: errorCategory,
        })
        .eq('id', translationJob.id),
      db
        .from('request_provider_matches')
        .update({ brief_translation_id: translationRow.id, viewed_at: new Date().toISOString() })
        .eq('id', match.id),
      db.from('ai_usage_events').insert({
        user_id: user.id,
        provider: providerName,
        model,
        operation: 'provider_brief_translation',
        input_units: inputUnits,
        output_units: outputUnits,
        success: status !== 'failed',
        error_category: errorCategory,
        latency_ms: Date.now() - started,
      }),
    ]);
    if (jobUpdate.error || matchUpdate.error || usageInsert.error) {
      throw new Error('TRANSLATION_FINALIZE_FAILED');
    }
    return json(request, {
      translationId: translationRow.id,
      status,
      sourceLocale,
      targetLocale,
      original,
      translated,
      protected: protectedBriefFields(original),
      metadata,
    });
  } catch (error) {
    return safeError(request, error, correlationId);
  }
});
