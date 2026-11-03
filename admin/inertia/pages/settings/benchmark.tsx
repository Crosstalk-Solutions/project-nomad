import { Head, Link, usePage } from '@inertiajs/react'
import { useState } from 'react'
import SettingsLayout from '~/layouts/SettingsLayout'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import CircularGauge from '~/components/systeminfo/CircularGauge'
import InfoCard from '~/components/systeminfo/InfoCard'
import Alert from '~/components/Alert'
import StyledButton from '~/components/StyledButton'
import InfoTooltip from '~/components/InfoTooltip'
import BuilderTagSelector from '~/components/BuilderTagSelector'
import {
  IconRobot,
  IconChartBar,
  IconCpu,
  IconDatabase,
  IconServer,
  IconChevronDown,
  IconClock,
} from '@tabler/icons-react'
import { BenchmarkStatus } from '../../../types/benchmark'
import BenchmarkResult from '#models/benchmark_result'
import api from '~/lib/api'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import { SERVICE_NAMES } from '../../../constants/service_names'
import { useBenchmarkRun } from '~/hooks/useBenchmarkRun'
import BenchmarkRunView from '~/components/benchmark/BenchmarkRunView'
import ScoreReveal from '~/components/benchmark/ScoreReveal'
import { getScoreDisplay } from '~/lib/benchmarkScore'
import { useTranslation, Trans } from 'react-i18next'

export default function BenchmarkPage(props: {
  benchmark: {
    latestResult: BenchmarkResult | null
    status: BenchmarkStatus
    currentBenchmarkId: string | null
  }
}) {
  const { t } = useTranslation('benchmark')
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const queryClient = useQueryClient()
  const aiInstalled = useServiceInstalledStatus(SERVICE_NAMES.OLLAMA)
  const [isRunning, setIsRunning] = useState(props.benchmark.status !== 'idle')
  const [revealing, setRevealing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showAIRequiredAlert, setShowAIRequiredAlert] = useState(false)
  const [shareAnonymously, setShareAnonymously] = useState(false)
  const [currentBuilderTag, setCurrentBuilderTag] = useState<string | null>(
    props.benchmark.latestResult?.builder_tag || null
  )

  // Fetch latest result
  const { data: latestResult, refetch: refetchLatest } = useQuery({
    queryKey: ['benchmark', 'latest'],
    queryFn: async () => {
      const res = await api.getLatestBenchmarkResult()
      if (res && res.result) {
        return res.result
      }
      return null
    },
    initialData: props.benchmark.latestResult,
  })

  // Live run state
  const run = useBenchmarkRun({
    onFinished: (status, message) => {
      setIsRunning(false)
      if (status === 'completed') {
        refetchLatest()
        setRevealing(true)
      } else {
        setErrorMsg(message || t('errors.benchmark_failed'))
      }
    },
  })

  // Fetch all benchmark results for history
  const { data: benchmarkHistory } = useQuery({
    queryKey: ['benchmark', 'history'],
    queryFn: async () => {
      const res = await api.getBenchmarkResults()
      if (res && res.results && Array.isArray(res.results)) {
        return res.results
      }
      return []
    },
  })

  // Run benchmark mutation
  const runBenchmark = useMutation({
    mutationFn: async (type: 'full' | 'system' | 'ai') => {
      setErrorMsg(null)
      run.reset()
      setIsRunning(true)
      return await api.runBenchmark(type, true)
    },
    onSuccess: (data) => {
      if (!data?.success) {
        setIsRunning(false)
        setErrorMsg(t('errors.failed_to_start'))
      }
    },
    onError: (error) => {
      setIsRunning(false)
      setErrorMsg(error.message || t('errors.failed_to_start'))
    },
  })

  // Update builder tag mutation
  const updateBuilderTag = useMutation({
    mutationFn: async ({
      benchmarkId,
      builderTag,
    }: {
      benchmarkId: string
      builderTag: string
      invalidate?: boolean
    }) => {
      const res = await api.updateBuilderTag(benchmarkId, builderTag)
      if (!res || !res.success) {
        throw new Error(res?.error || t('errors.failed_update_tag'))
      }
      return res
    },
    onSuccess: (_, variables) => {
      if (variables.invalidate) {
        refetchLatest()
        queryClient.invalidateQueries({ queryKey: ['benchmark', 'history'] })
      }
    },
  })

  // Submit to repository mutation
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submitResult = useMutation({
    mutationFn: async ({ benchmarkId, anonymous }: { benchmarkId: string; anonymous: boolean }) => {
      setSubmitError(null)

      if (currentBuilderTag && !anonymous) {
        await updateBuilderTag.mutateAsync({
          benchmarkId,
          builderTag: currentBuilderTag,
          invalidate: false,
        })
      }

      const res = await api.submitBenchmarkToRepository(benchmarkId, anonymous)
      if (!res || !res.success) {
        throw new Error(res?.error || t('errors.failed_submit_repo'))
      }
      return res
    },
    onSuccess: () => {
      refetchLatest()
      queryClient.invalidateQueries({ queryKey: ['benchmark', 'history'] })
    },
    onError: (error: any) => {
      setSubmitError(error.message || t('errors.failed_submit_repo'))
    },
  })

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600'
    if (score >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBadge = (score: number) => {
    if (score >= 85)
      return {
        label: t('badges.exceptional'),
        className: 'bg-green-100 text-green-800 border-green-200',
      }
    if (score >= 70)
      return {
        label: t('badges.great'),
        className: 'bg-green-50 text-green-700 border-green-200',
      }
    if (score >= 55)
      return {
        label: t('badges.good'),
        className: 'bg-blue-50 text-blue-700 border-blue-200',
      }
    if (score >= 40)
      return {
        label: t('badges.fair'),
        className: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      }
    return {
      label: t('badges.needs_attention'),
      className: 'bg-red-50 text-red-700 border-red-200',
    }
  }

  const getAIScore = (tokensPerSecond: number): number => {
    return Math.min(100, Math.max(0, (tokensPerSecond / 60) * 100))
  }

  const getAIBadge = (tokensPerSecond: number) => {
    if (tokensPerSecond >= 30)
      return {
        label: t('badges.very_fast'),
        className: 'bg-green-100 text-green-800 border-green-200',
      }
    if (tokensPerSecond >= 20)
      return {
        label: t('badges.fast'),
        className: 'bg-green-50 text-green-700 border-green-200',
      }
    if (tokensPerSecond >= 10)
      return {
        label: t('badges.moderate'),
        className: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      }
    return {
      label: t('badges.slow'),
      className: 'bg-red-50 text-red-700 border-red-200',
    }
  }

  return (
    <SettingsLayout>
      <Head title={t('page_title')} />

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('header_title')}</h1>
          <p className="text-text-secondary mt-1">
            {t('header_desc')}
          </p>
        </div>

        {/* Live run overlay */}
        {isRunning && (
          <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm">
            <BenchmarkRunView run={run} />
          </div>
        )}

        {/* End-of-run score reveal */}
        {!isRunning && revealing && latestResult && (
          <ScoreReveal result={latestResult} onDone={() => setRevealing(false)} />
        )}

        {/* Main Content (hidden while benchmark is actively running or revealing) */}
        {!isRunning && !revealing && (
          <>
            {/* Error Message */}
            {errorMsg && (
              <Alert
                type="error"
                title={t('errors.benchmark_failed_title')}
                message={errorMsg}
                actionText={t('common_actions.dismiss')}
                onAction={() => setErrorMsg(null)}
              />
            )}

            {/* AI Required Alert */}
            {showAIRequiredAlert && (
              <Alert
                type="warning"
                title={t('alerts.ai_required_title', { name: aiAssistantName })}
                message={t('alerts.ai_required_desc', { name: aiAssistantName })}
                actionText={t('alerts.go_to_settings')}
                onAction={() => window.location.assign('/settings/models')}
              />
            )}

            {/* Actions Bar */}
            <div className="flex flex-wrap gap-3 items-center justify-between bg-surface-secondary p-4 rounded-lg border border-border-subtle">
              <div className="flex flex-wrap gap-2">
                <StyledButton
                  onClick={() => {
                    if (!aiInstalled) {
                      setShowAIRequiredAlert(true)
                      return
                    }
                    setShowAIRequiredAlert(false)
                    runBenchmark.mutate('full')
                  }}
                  variant="primary"
                  loading={runBenchmark.isPending}
                  icon="IconPlayerPlay"
                >
                  {t('actions.run_full')}
                </StyledButton>
                <StyledButton
                  onClick={() => {
                    setShowAIRequiredAlert(false)
                    runBenchmark.mutate('system')
                  }}
                  variant="outline"
                  loading={runBenchmark.isPending}
                  icon="IconCpu"
                >
                  {t('actions.run_system_only')}
                </StyledButton>
                {aiInstalled && (
                  <StyledButton
                    onClick={() => {
                      setShowAIRequiredAlert(false)
                      runBenchmark.mutate('ai')
                    }}
                    variant="outline"
                    loading={runBenchmark.isPending}
                    icon="IconRobot"
                  >
                    {t('actions.run_ai_only')}
                  </StyledButton>
                )}
              </div>
              {latestResult && (
                <div className="text-xs text-text-muted">
                  {t('actions.last_run', { time: new Date(latestResult.created_at).toLocaleString() })}
                </div>
              )}
            </div>

            {/* Results Section */}
            {latestResult ? (
              <div className="space-y-6">
                {/* NOMAD Score Card */}
                {(() => {
                  const scoreInfo = getScoreDisplay(latestResult.benchmark_type)
                  return (
                    <div className="bg-surface-primary rounded-lg p-6 border border-border-subtle shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <IconChartBar className="w-5 h-5 text-desert-green" />
                          <h2 className="text-lg font-bold text-text-primary">
                            {scoreInfo.label}
                          </h2>
                          <InfoTooltip
                            content={
                              scoreInfo.isPartial
                                ? t('tooltips.partial_score')
                                : t('tooltips.full_score')
                            }
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          {scoreInfo.isPartial && (
                            <span className="text-xs px-2.5 py-1 rounded-full border border-desert-orange bg-desert-orange/10 text-desert-orange-dark font-medium">
                              {t('badges.partial_benchmark')}
                            </span>
                          )}
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                              getScoreBadge(latestResult.nomad_score).className
                            }`}
                          >
                            {getScoreBadge(latestResult.nomad_score).label}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="relative">
                            <CircularGauge
                              value={latestResult.nomad_score}
                              max={100}
                              size={160}
                              strokeWidth={12}
                              variant="score"
                            />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span
                                className={`text-4xl font-bold font-mono ${getScoreColor(
                                  latestResult.nomad_score
                                )}`}
                              >
                                {latestResult.nomad_score}
                              </span>
                              <span className="text-xs text-text-muted mt-1">{t('score_card.out_of_100')}</span>
                            </div>
                          </div>
                        </div>

                        <div className="md:col-span-2 space-y-3">
                          <p className="text-sm text-text-secondary">
                            {scoreInfo.isPartial ? (
                              <Trans
                                ns="benchmark"
                                i18nKey="score_card.partial_explainer"
                                values={{ label: scoreInfo.label }}
                                components={{ 1: <strong /> }}
                              />
                            ) : (
                              t('score_card.full_explainer')
                            )}
                          </p>
                          <div className="grid grid-cols-2 gap-4 pt-2">
                            <div>
                              <span className="text-xs text-text-muted">{t('score_card.system_performance')}</span>
                              <p className="text-base font-semibold text-text-primary">
                                {Math.round(
                                  ((latestResult.cpu_score +
                                    latestResult.memory_score +
                                    latestResult.disk_read_score +
                                    latestResult.disk_write_score) /
                                    4) *
                                    100
                                )}
                                /100
                              </p>
                            </div>
                            <div>
                              <span className="text-xs text-text-muted">{t('score_card.ai_performance')}</span>
                              <p className="text-base font-semibold text-text-primary">
                                {latestResult.ai_tokens_per_second !== null
                                  ? `${Math.round(
                                      getAIScore(latestResult.ai_tokens_per_second)
                                    )}/100`
                                  : t('score_card.not_tested')}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Community Sharing Section */}
                <div className="bg-surface-primary rounded-lg p-6 border border-border-subtle shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <IconServer className="w-5 h-5 text-desert-green" />
                      <h2 className="text-lg font-bold text-text-primary">
                        {t('community.heading')}
                      </h2>
                      <InfoTooltip content={t('tooltips.community_sharing')} />
                    </div>
                    {latestResult.submitted_to_repo && (
                      <span className="text-xs px-2.5 py-1 rounded-full border border-green-200 bg-green-50 text-green-700 font-medium">
                        {t('community.shared_badge')}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-text-secondary mb-4">
                    {t('community.intro')}
                  </p>

                  {/* Submission Error Alert */}
                  {submitError && (
                    <div className="mb-4">
                      <Alert
                        type="error"
                        title={t('errors.submission_failed')}
                        message={submitError}
                        actionText={t('common_actions.dismiss')}
                        onAction={() => setSubmitError(null)}
                      />
                    </div>
                  )}

                  {/* Partial Benchmark Warning */}
                  {latestResult.benchmark_type !== 'full' && (
                    <div className="mb-4">
                      <Alert
                        type="warning"
                        title={t('alerts.partial_benchmark_title')}
                        message={t('alerts.partial_benchmark_desc')}
                      />
                    </div>
                  )}

                  {latestResult.submitted_to_repo ? (
                    <Alert
                      type="success"
                      title={t('alerts.shared_success_title')}
                      message={
                        latestResult.submission_anonymous
                          ? t('alerts.shared_anon_msg')
                          : t('alerts.shared_with_tag_msg', { tag: latestResult.builder_tag || 'NOMAD Builder' })
                      }
                    />
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <div className="w-full sm:w-auto">
                          <label className="block text-xs font-medium text-text-secondary mb-1">
                            {t('community.builder_tag_label')}
                          </label>
                          <BuilderTagSelector
                            value={currentBuilderTag}
                            onChange={(tag) => setCurrentBuilderTag(tag)}
                            disabled={shareAnonymously || submitResult.isPending}
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-0 sm:pt-6">
                          <input
                            type="checkbox"
                            id="shareAnonymously"
                            checked={shareAnonymously}
                            onChange={(e) => setShareAnonymously(e.target.checked)}
                            disabled={submitResult.isPending}
                            className="rounded border-border-default text-desert-green focus:ring-desert-green"
                          />
                          <label htmlFor="shareAnonymously" className="text-sm text-text-secondary">
                            {t('community.share_anonymously')}
                          </label>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <StyledButton
                          onClick={() => {
                            if (latestResult.benchmark_type !== 'full') {
                              if (
                                !confirm(
                                  t('community.confirm_partial_submit')
                                )
                              ) {
                                return
                              }
                            }
                            submitResult.mutate({
                              benchmarkId: latestResult.id,
                              anonymous: shareAnonymously,
                            })
                          }}
                          variant="primary"
                          loading={submitResult.isPending}
                          icon="IconUpload"
                        >
                          {t('community.share_btn')}
                        </StyledButton>
                      </div>
                    </div>
                  )}
                </div>

                {/* System Performance Grid */}
                <div className="bg-surface-primary rounded-lg p-6 border border-border-subtle shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <IconCpu className="w-5 h-5 text-desert-green" />
                    <h2 className="text-lg font-bold text-text-primary">
                      {t('system_perf.title')}
                    </h2>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex flex-col items-center p-4 bg-surface-secondary rounded-lg">
                      <CircularGauge
                        value={latestResult.cpu_score * 100}
                        max={100}
                        size={80}
                        strokeWidth={8}
                        variant="cpu"
                      />
                      <span className="text-xs font-semibold text-text-primary mt-2">
                        {t('system_perf.cpu')}
                      </span>
                      <span className="text-xs text-text-muted font-mono">
                        {latestResult.cpu_events_per_second.toFixed(0)} {t('system_perf.events_sec')}
                      </span>
                    </div>

                    <div className="flex flex-col items-center p-4 bg-surface-secondary rounded-lg">
                      <CircularGauge
                        value={latestResult.memory_score * 100}
                        max={100}
                        size={80}
                        strokeWidth={8}
                        variant="memory"
                      />
                      <span className="text-xs font-semibold text-text-primary mt-2">
                        {t('system_perf.memory')}
                      </span>
                      <span className="text-xs text-text-muted font-mono">
                        {latestResult.memory_throughput_mbs.toFixed(0)} MB/s
                      </span>
                    </div>

                    <div className="flex flex-col items-center p-4 bg-surface-secondary rounded-lg">
                      <CircularGauge
                        value={latestResult.disk_read_score * 100}
                        max={100}
                        size={80}
                        strokeWidth={8}
                        variant="disk"
                      />
                      <span className="text-xs font-semibold text-text-primary mt-2">
                        {t('system_perf.disk_read')}
                      </span>
                      <span className="text-xs text-text-muted font-mono">
                        {latestResult.disk_read_mbs.toFixed(0)} MB/s
                      </span>
                    </div>

                    <div className="flex flex-col items-center p-4 bg-surface-secondary rounded-lg">
                      <CircularGauge
                        value={latestResult.disk_write_score * 100}
                        max={100}
                        size={80}
                        strokeWidth={8}
                        variant="disk"
                      />
                      <span className="text-xs font-semibold text-text-primary mt-2">
                        {t('system_perf.disk_write')}
                      </span>
                      <span className="text-xs text-text-muted font-mono">
                        {latestResult.disk_write_mbs.toFixed(0)} MB/s
                      </span>
                    </div>
                  </div>
                </div>

                {/* AI Performance Section */}
                <div className="bg-surface-primary rounded-lg p-6 border border-border-subtle shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <IconRobot className="w-5 h-5 text-desert-green" />
                      <h2 className="text-lg font-bold text-text-primary">
                        {t('ai_perf.title', { name: aiAssistantName })}
                      </h2>
                    </div>
                    {latestResult.ai_tokens_per_second !== null && (
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                          getAIBadge(latestResult.ai_tokens_per_second).className
                        }`}
                      >
                        {getAIBadge(latestResult.ai_tokens_per_second).label}
                      </span>
                    )}
                  </div>

                  {latestResult.ai_tokens_per_second !== null ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="relative">
                          <CircularGauge
                            value={getAIScore(latestResult.ai_tokens_per_second)}
                            max={100}
                            size={120}
                            strokeWidth={10}
                            variant="cpu"
                          />
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-2xl font-bold font-mono text-text-primary">
                              {latestResult.ai_tokens_per_second.toFixed(1)}
                            </span>
                            <span className="text-[10px] text-text-muted">{t('ai_perf.tok_sec')}</span>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-2 space-y-2">
                        <div className="grid grid-cols-2 gap-4">
                          <InfoCard
                            label={t('ai_perf.model_used')}
                            value={latestResult.ai_model || 'N/A'}
                          />
                          <InfoCard
                            label={t('ai_perf.time_to_first_token')}
                            value={
                              latestResult.ai_time_to_first_token_ms !== null
                                ? `${(latestResult.ai_time_to_first_token_ms / 1000).toFixed(2)}s`
                                : 'N/A'
                            }
                          />
                        </div>
                        <p className="text-xs text-text-muted pt-2">
                          {t('ai_perf.disclaimer')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-sm text-text-muted">
                        {t('ai_perf.not_tested_msg')}
                      </p>
                    </div>
                  )}
                </div>

                {/* System Specs (Collapsible) */}
                <div className="bg-surface-primary rounded-lg border border-border-subtle shadow-sm overflow-hidden">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="w-full flex items-center justify-between p-4 hover:bg-surface-secondary transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <IconServer className="w-5 h-5 text-desert-green" />
                      <span className="text-sm font-semibold text-text-primary">
                        {t('specs.title')}
                      </span>
                    </div>
                    <IconChevronDown
                      className={`w-4 h-4 text-text-muted transition-transform ${
                        showDetails ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showDetails && (
                    <div className="p-4 pt-0 border-t border-border-subtle grid grid-cols-1 md:grid-cols-2 gap-3">
                      <InfoCard
                        title={t('specs.processor')}
                        label={t('specs.cpu_model')}
                        value={latestResult.cpu_model || 'Unknown'}
                        subtext={`${latestResult.cpu_cores} cores (${latestResult.cpu_threads} threads)`}
                      />
                      <InfoCard
                        title={t('specs.system')}
                        label={t('specs.total_memory')}
                        value={`${(latestResult.total_memory_bytes / 1024 / 1024 / 1024).toFixed(
                          1
                        )} GB`}
                        subtext={`${latestResult.os_type} (${latestResult.os_platform || latestResult.os_arch})`}
                      />
                    </div>
                  )}
                </div>

                {/* Benchmark History (Collapsible) */}
                {benchmarkHistory && benchmarkHistory.length > 1 && (
                  <div className="bg-surface-primary rounded-lg border border-border-subtle shadow-sm overflow-hidden">
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      className="w-full flex items-center justify-between p-4 hover:bg-surface-secondary transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <IconClock className="w-5 h-5 text-desert-green" />
                        <span className="text-sm font-semibold text-text-primary">
                          {t('history.title', { count: benchmarkHistory.length })}
                        </span>
                      </div>
                      <IconChevronDown
                        className={`w-4 h-4 text-text-muted transition-transform ${
                          showHistory ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {showHistory && (
                      <div className="p-4 pt-0 border-t border-border-subtle">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border-subtle text-left text-xs text-text-muted">
                                <th className="pb-2">{t('history.col_date')}</th>
                                <th className="pb-2">{t('history.col_type')}</th>
                                <th className="pb-2">{t('history.col_score')}</th>
                                <th className="pb-2">{t('history.col_cpu')}</th>
                                <th className="pb-2">{t('history.col_memory')}</th>
                                <th className="pb-2">{t('history.col_disk')}</th>
                                <th className="pb-2">{t('history.col_ai')}</th>
                                <th className="pb-2">{t('history.col_shared')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                              {benchmarkHistory.map((item: BenchmarkResult) => (
                                <tr key={item.id} className="hover:bg-surface-secondary">
                                  <td className="py-2 text-text-secondary text-xs">
                                    {new Date(item.created_at).toLocaleDateString()}
                                  </td>
                                  <td className="py-2">
                                    <span className="text-xs uppercase font-mono px-1.5 py-0.5 rounded bg-surface-secondary text-text-muted">
                                      {item.benchmark_type}
                                    </span>
                                  </td>
                                  <td className="py-2 font-mono font-semibold">
                                    <span className={getScoreColor(item.nomad_score)}>
                                      {item.nomad_score}
                                    </span>
                                  </td>
                                  <td className="py-2 font-mono text-xs text-text-secondary">
                                    {(item.cpu_score * 100).toFixed(0)}
                                  </td>
                                  <td className="py-2 font-mono text-xs text-text-secondary">
                                    {(item.memory_score * 100).toFixed(0)}
                                  </td>
                                  <td className="py-2 font-mono text-xs text-text-secondary">
                                    {(
                                      ((item.disk_read_score + item.disk_write_score) / 2) *
                                      100
                                    ).toFixed(0)}
                                  </td>
                                  <td className="py-2 font-mono text-xs text-text-secondary">
                                    {item.ai_tokens_per_second !== null
                                      ? `${item.ai_tokens_per_second.toFixed(1)} t/s`
                                      : '—'}
                                  </td>
                                  <td className="py-2 text-xs">
                                    {item.submitted_to_repo ? (
                                      <span className="text-green-600">✓</span>
                                    ) : (
                                      <span className="text-text-muted">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* No Results State */
              <div className="bg-surface-primary rounded-lg p-12 border border-border-subtle shadow-sm text-center">
                <IconChartBar className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <h3 className="text-base font-semibold text-text-primary mb-1">
                  {t('no_results.title')}
                </h3>
                <p className="text-sm text-text-secondary max-w-md mx-auto mb-6">
                  {t('no_results.desc')}
                </p>
                <StyledButton
                  onClick={() => {
                    if (!aiInstalled) {
                      setShowAIRequiredAlert(true)
                      return
                    }
                    setShowAIRequiredAlert(false)
                    runBenchmark.mutate('full')
                  }}
                  variant="primary"
                  loading={runBenchmark.isPending}
                  icon="IconPlayerPlay"
                >
                  {t('actions.run_full')}
                </StyledButton>
              </div>
            )}
          </>
        )}
      </div>
    </SettingsLayout>
  )
}
