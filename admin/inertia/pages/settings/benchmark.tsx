import { Head, Link } from '@inertiajs/react'
import { useState, useEffect } from 'react'
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
import { useTransmit } from 'react-adonis-transmit'
import { BenchmarkProgress, BenchmarkStatus } from '../../../types/benchmark'
import BenchmarkResult from '#models/benchmark_result'
import api from '~/lib/api'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import { SERVICE_NAMES } from '../../../constants/service_names'

type BenchmarkProgressWithID = BenchmarkProgress & { benchmark_id: string }

export default function BenchmarkPage(props: {
  benchmark: {
    latestResult: BenchmarkResult | null
    status: BenchmarkStatus
    currentBenchmarkId: string | null
  }
}) {
  const { subscribe } = useTransmit()
  const queryClient = useQueryClient()
  const aiInstalled = useServiceInstalledStatus(SERVICE_NAMES.OLLAMA)
  const [progress, setProgress] = useState<BenchmarkProgressWithID | null>(null)
  const [isRunning, setIsRunning] = useState(props.benchmark.status !== 'idle')
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
      return res ?? null
    },
    initialData: props.benchmark.latestResult,
  })

  // Fetch all benchmark results for history
  const { data: benchmarkHistory } = useQuery({
    queryKey: ['benchmark', 'history'],
    queryFn: async () => {
      const res = await api.getBenchmarkResults()
      return res ?? []
    },
  })

  // Run benchmark mutation (uses sync mode by default for simpler local dev)
  const runBenchmark = useMutation({
    mutationFn: async (type: 'full' | 'system' | 'ai') => {
      setIsRunning(true)
      setProgress({
        status: 'starting',
        progress: 5,
        message: 'Starting benchmark... This takes 2-5 minutes.',
        current_stage: 'Starting',
        benchmark_id: '',
        timestamp: new Date().toISOString(),
      })

      // Use sync mode - runs inline without needing Redis/queue worker
      return await api.runBenchmark(type, true)
    },
    onSuccess: (data) => {
      if (data?.success) {
        setProgress({
          status: 'completed',
          progress: 100,
          message: 'Benchmark completed!',
          current_stage: 'Complete',
          benchmark_id: data.benchmark_id,
          timestamp: new Date().toISOString(),
        })
        refetchLatest()
      } else {
        setProgress({
          status: 'error',
          progress: 0,
          message: 'Benchmark failed',
          current_stage: 'Error',
          benchmark_id: '',
          timestamp: new Date().toISOString(),
        })
      }
      setIsRunning(false)
    },
    onError: (error) => {
      setProgress({
        status: 'error',
        progress: 0,
        message: error.message || 'Benchmark failed',
        current_stage: 'Error',
        benchmark_id: '',
        timestamp: new Date().toISOString(),
      })
      setIsRunning(false)
    },
  })

  // Update builder tag mutation
  const updateBuilderTag = useMutation({
    mutationFn: async ({
      benchmarkId,
      builderTag
    }: {
      benchmarkId: string
      builderTag: string
      invalidate?: boolean
    }) => {
      const res = await api.updateBuilderTag(benchmarkId, builderTag)
      if (!res || !res.success) {
        throw new Error(res?.error || 'Failed to update builder tag')
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

      // First, save the current builder tag to the benchmark (don't refetch yet)
      if (currentBuilderTag && !anonymous) {
        await updateBuilderTag.mutateAsync({ benchmarkId, builderTag: currentBuilderTag, invalidate: false })
      }

      const res = await api.submitBenchmark(benchmarkId, anonymous)
      if (!res || !res.success) {
        throw new Error(res?.error || 'Failed to submit benchmark')
      }
      return res
    },
    onSuccess: () => {
      refetchLatest()
      queryClient.invalidateQueries({ queryKey: ['benchmark', 'history'] })
    },
    onError: (error: Error) => {
      setSubmitError(error.message)
    },
  })

  // Check if the latest result is a full benchmark with AI data (eligible for sharing)
  const canShareBenchmark =
    latestResult &&
    latestResult.benchmark_type === 'full' &&
    latestResult.ai_tokens_per_second !== null &&
    latestResult.ai_tokens_per_second > 0 &&
    !latestResult.submitted_to_repository

  // Handle Full Benchmark click with pre-flight check
  const handleFullBenchmarkClick = () => {
    if (!aiInstalled) {
      setShowAIRequiredAlert(true)
      return
    }
    setShowAIRequiredAlert(false)
    runBenchmark.mutate('full')
  }

  // Simulate progress during sync benchmark (since we don't get SSE updates)
  useEffect(() => {
    if (!isRunning || progress?.status === 'completed' || progress?.status === 'error') return

    const stages: {
      status: BenchmarkStatus
      progress: number
      message: string
      label: string
      duration: number
    }[] = [
      {
        status: 'detecting_hardware',
        progress: 10,
        message: 'Detecting system hardware...',
        label: 'Detecting Hardware',
        duration: 2000,
      },
      {
        status: 'running_cpu',
        progress: 25,
        message: 'Running CPU benchmark (30s)...',
        label: 'CPU Benchmark',
        duration: 32000,
      },
      {
        status: 'running_memory',
        progress: 40,
        message: 'Running memory benchmark...',
        label: 'Memory Benchmark',
        duration: 8000,
      },
      {
        status: 'running_disk_read',
        progress: 55,
        message: 'Running disk read benchmark (30s)...',
        label: 'Disk Read Test',
        duration: 35000,
      },
      {
        status: 'running_disk_write',
        progress: 70,
        message: 'Running disk write benchmark (30s)...',
        label: 'Disk Write Test',
        duration: 35000,
      },
      {
        status: 'downloading_ai_model',
        progress: 80,
        message: 'Downloading AI benchmark model (first run only)...',
        label: 'Downloading AI Model',
        duration: 5000,
      },
      {
        status: 'running_ai',
        progress: 85,
        message: 'Running AI inference benchmark...',
        label: 'AI Inference Test',
        duration: 15000,
      },
      {
        status: 'calculating_score',
        progress: 95,
        message: 'Calculating NOMAD score...',
        label: 'Calculating Score',
        duration: 2000,
      },
    ]

    let currentStage = 0
    const advanceStage = () => {
      if (currentStage < stages.length && isRunning) {
        const stage = stages[currentStage]
        setProgress({
          status: stage.status,
          progress: stage.progress,
          message: stage.message,
          current_stage: stage.label,
          benchmark_id: '',
          timestamp: new Date().toISOString(),
        })
        currentStage++
      }
    }

    // Start the first stage after a short delay
    const timers: NodeJS.Timeout[] = []
    let elapsed = 1000
    stages.forEach((stage) => {
      timers.push(setTimeout(() => advanceStage(), elapsed))
      elapsed += stage.duration
    })

    return () => {
      timers.forEach((t) => clearTimeout(t))
    }
  }, [isRunning])

  // Listen for benchmark progress via SSE (backup for async mode)
  useEffect(() => {
    const unsubscribe = subscribe('benchmark-progress', (data: BenchmarkProgressWithID) => {
      setProgress(data)
      if (data.status === 'completed' || data.status === 'error') {
        setIsRunning(false)
        refetchLatest()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [subscribe, refetchLatest])

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024)
    return `${gb.toFixed(1)} GB`
  }

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600'
    if (score >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getProgressPercent = () => {
    if (!progress) return 0
    const stages: Record<BenchmarkStatus, number> = {
      idle: 0,
      starting: 5,
      detecting_hardware: 10,
      running_cpu: 25,
      running_memory: 40,
      running_disk_read: 55,
      running_disk_write: 70,
      downloading_ai_model: 80,
      running_ai: 85,
      calculating_score: 95,
      completed: 100,
      error: 0,
    }
    return stages[progress.status] || 0
  }

  // Calculate AI score from tokens per second (normalized to 0-100)
  // Reference: 30 tok/s = 50 score, 60 tok/s = 100 score
  const getAIScore = (tokensPerSecond: number | null): number => {
    if (!tokensPerSecond) return 0
    const score = (tokensPerSecond / 60) * 100
    return Math.min(100, Math.max(0, score))
  }

  return (
    <SettingsLayout>
      <Head title="System Benchmark" />
      <div className="xl:pl-72 w-full">
        <main className="px-6 lg:px-12 py-6 lg:py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-desert-green mb-2">System Benchmark</h1>
            <p className="text-desert-stone-dark">
              Measure your server's performance and compare with the NOMAD community
            </p>
          </div>

          {/* Run Benchmark Section */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              Run Benchmark
            </h2>

            <div className="bg-desert-white rounded-lg p-8 border border-desert-stone-light shadow-sm">
              {isRunning ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin h-6 w-6 border-2 border-desert-green border-t-transparent rounded-full" />
                    <span className="text-lg font-medium">
                      {progress?.current_stage || 'Running benchmark...'}
                    </span>
                  </div>
                  <div className="w-full bg-desert-stone-lighter rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-desert-green h-full transition-all duration-500"
                      style={{ width: `${getProgressPercent()}%` }}
                    />
                  </div>
                  <p className="text-sm text-desert-stone-dark">{progress?.message}</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {progress?.status === 'error' && (
                    <Alert
                      type="error"
                      title="Benchmark Failed"
                      message={progress.message}
                      variant="bordered"
                      dismissible
                      onDismiss={() => setProgress(null)}
                    />
                  )}
                  {showAIRequiredAlert && (
                    <Alert
                      type="warning"
                      title="AI Assistant Required"
                      message="Full benchmark requires AI Assistant to be installed. Install it to measure your complete NOMAD capability and share results with the community."
                      variant="bordered"
                      dismissible
                      onDismiss={() => setShowAIRequiredAlert(false)}
                    >
                      <Link
                        href="/settings/apps"
                        className="text-sm text-desert-green hover:underline mt-2 inline-block font-medium"
                      >
                        Go to Apps to install AI Assistant →
                      </Link>
                    </Alert>
                  )}
                  <p className="text-desert-stone-dark">
                    Run a benchmark to measure your system's CPU, memory, disk, and AI inference
                    performance. The benchmark takes approximately 2-5 minutes to complete.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <StyledButton
                      onClick={handleFullBenchmarkClick}
                      disabled={runBenchmark.isPending}
                      icon="IconPlayerPlay"
                    >
                      Run Full Benchmark
                    </StyledButton>
                    <StyledButton
                      variant="secondary"
                      onClick={() => runBenchmark.mutate('system')}
                      disabled={runBenchmark.isPending}
                      icon="IconCpu"
                    >
                      System Only
                    </StyledButton>
                    <StyledButton
                      variant="secondary"
                      onClick={() => runBenchmark.mutate('ai')}
                      disabled={runBenchmark.isPending || !aiInstalled}
                      icon="IconWand"
                      title={
                        !aiInstalled
                          ? 'AI Assistant must be installed to run AI benchmark'
                          : undefined
                      }
                    >
                      AI Only
                    </StyledButton>
                  </div>
                  {!aiInstalled && (
                    <p className="text-sm text-desert-stone-dark">
                      <span className="text-amber-600">Note:</span> AI Assistant is not installed.
                      <Link
                        href="/settings/apps"
                        className="text-desert-green hover:underline ml-1"
                      >
                        Install it
                      </Link>{' '}
                      to run full benchmarks and share results with the community.
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Results Section */}
          {latestResult && (
            <>
              <section className="mb-12">
                <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
                  <div className="w-1 h-6 bg-desert-green" />
                  NOMAD Score
                </h2>

                <div className="bg-desert-white rounded-lg p-8 border border-desert-stone-light shadow-sm">
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="shrink-0">
                      <CircularGauge
                        value={latestResult.nomad_score}
                        label="NOMAD Score"
                        size="lg"
                        variant="cpu"
                        subtext="out of 100"
                        icon={<IconChartBar className="w-8 h-8" />}
                      />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div
                        className={`text-5xl font-bold ${getScoreColor(latestResult.nomad_score)}`}
                      >
                        {latestResult.nomad_score.toFixed(1)}
                      </div>
                      <p className="text-desert-stone-dark">
                        Your NOMAD Score is a weighted composite of all benchmark results.
                      </p>

                      {/* Share with Community - Only for full benchmarks with AI data */}
                      {canShareBenchmark && (
                        <div className="space-y-4 mt-6 pt-6 border-t border-desert-stone-light">
                          <h3 className="font-semibold text-desert-green">Share with Community</h3>
                          <p className="text-sm text-desert-stone-dark">
                            Share your benchmark on the community leaderboard. Choose a Builder Tag
                            to claim your spot, or share anonymously.
                          </p>

                          {/* Builder Tag Selector */}
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-desert-stone-dark">
                              Your Builder Tag
                            </label>
                            <BuilderTagSelector
                              value={currentBuilderTag}
                              onChange={setCurrentBuilderTag}
                              disabled={shareAnonymously || submitResult.isPending}
                            />
                          </div>

                          {/* Anonymous checkbox */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={shareAnonymously}
                              onChange={(e) => setShareAnonymously(e.target.checked)}
                              disabled={submitResult.isPending}
                              className="w-4 h-4 rounded border-desert-stone-light text-desert-green focus:ring-desert-green"
                            />
                            <span className="text-sm text-desert-stone-dark">
                              Share anonymously (no Builder Tag shown on leaderboard)
                            </span>
                          </label>

                          <StyledButton
                            onClick={() =>
                              submitResult.mutate({
                                benchmarkId: latestResult.benchmark_id,
                                anonymous: shareAnonymously,
                              })
                            }
                            disabled={submitResult.isPending}
                            icon="IconCloudUpload"
                          >
                            {submitResult.isPending ? 'Submitting...' : 'Share with Community'}
                          </StyledButton>
                          {submitError && (
                            <Alert
                              type="error"
                              title="Submission Failed"
                              message={submitError}
                              variant="bordered"
                              dismissible
                              onDismiss={() => setSubmitError(null)}
                            />
                          )}
                        </div>
                      )}

                      {/* Show message for partial benchmarks */}
                      {latestResult &&
                        !latestResult.submitted_to_repository &&
                        !canShareBenchmark && (
                          <Alert
                            type="info"
                            title="Partial Benchmark"
                            message={`This ${latestResult.benchmark_type} benchmark cannot be shared with the community. Run a Full Benchmark with AI Assistant installed to share your results.`}
                            variant="bordered"
                          />
                        )}

                      {latestResult.submitted_to_repository && (
                        <Alert
                          type="success"
                          title="Shared with Community"
                          message="Your benchmark has been submitted to the community leaderboard. Thanks for contributing!"
                          variant="bordered"
                        >
                          <a
                            href="https://benchmark.projectnomad.us"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-desert-green hover:underline mt-2 inline-block"
                          >
                            View the leaderboard →
                          </a>
                        </Alert>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
                  <div className="w-1 h-6 bg-desert-green" />
                  System Performance
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm">
                    <CircularGauge
                      value={latestResult.cpu_score * 100}
                      label="CPU"
                      size="md"
                      variant="cpu"
                      icon={<IconCpu className="w-6 h-6" />}
                    />
                  </div>
                  <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm">
                    <CircularGauge
                      value={latestResult.memory_score * 100}
                      label="Memory"
                      size="md"
                      variant="memory"
                      icon={<IconDatabase className="w-6 h-6" />}
                    />
                  </div>
                  <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm">
                    <CircularGauge
                      value={latestResult.disk_read_score * 100}
                      label="Disk Read"
                      size="md"
                      variant="disk"
                      icon={<IconServer className="w-6 h-6" />}
                    />
                  </div>
                  <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm">
                    <CircularGauge
                      value={latestResult.disk_write_score * 100}
                      label="Disk Write"
                      size="md"
                      variant="disk"
                      icon={<IconServer className="w-6 h-6" />}
                    />
                  </div>
                </div>
              </section>

              {/* AI Performance Section */}
              <section className="mb-12">
                <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
                  <div className="w-1 h-6 bg-desert-green" />
                  AI Performance
                </h2>

                {latestResult.ai_tokens_per_second ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm">
                      <CircularGauge
                        value={getAIScore(latestResult.ai_tokens_per_second)}
                        label="AI Score"
                        size="md"
                        variant="cpu"
                        icon={<IconRobot className="w-6 h-6" />}
                      />
                    </div>
                    <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm flex items-center justify-center">
                      <div className="flex items-center gap-4">
                        <IconRobot className="w-10 h-10 text-desert-green" />
                        <div>
                          <div className="text-3xl font-bold text-desert-green">
                            {latestResult.ai_tokens_per_second.toFixed(1)}
                          </div>
                          <div className="text-sm text-desert-stone-dark flex items-center gap-1">
                            Tokens per Second
                            <InfoTooltip text="How fast the AI generates text. Higher is better. 30+ tokens/sec feels responsive, 60+ feels instant." />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm flex items-center justify-center">
                      <div className="flex items-center gap-4">
                        <IconRobot className="w-10 h-10 text-desert-green" />
                        <div>
                          <div className="text-3xl font-bold text-desert-green">
                            {latestResult.ai_time_to_first_token?.toFixed(0) || 'N/A'} ms
                          </div>
                          <div className="text-sm text-desert-stone-dark flex items-center gap-1">
                            Time to First Token
                            <InfoTooltip text="How quickly the AI starts responding after you send a message. Lower is better. Under 500ms feels instant." />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm">
                    <div className="text-center text-desert-stone-dark">
                      <IconRobot className="w-12 h-12 mx-auto mb-3 opacity-40" />
                      <p className="font-medium">No AI Benchmark Data</p>
                      <p className="text-sm mt-1">
                        Run a Full Benchmark or AI Only benchmark to measure AI inference
                        performance.
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <section className="mb-12">
                <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
                  <div className="w-1 h-6 bg-desert-green" />
                  Hardware Information
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <InfoCard
                    title="Processor"
                    icon={<IconCpu className="w-6 h-6" />}
                    variant="elevated"
                    data={[
                      { label: 'Model', value: latestResult.cpu_model },
                      { label: 'Cores', value: latestResult.cpu_cores },
                      { label: 'Threads', value: latestResult.cpu_threads },
                    ]}
                  />
                  <InfoCard
                    title="System"
                    icon={<IconServer className="w-6 h-6" />}
                    variant="elevated"
                    data={[
                      { label: 'RAM', value: formatBytes(latestResult.ram_bytes) },
                      { label: 'Disk Type', value: latestResult.disk_type.toUpperCase() },
                      { label: 'GPU', value: latestResult.gpu_model || 'Not detected' },
                    ]}
                  />
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
                  <div className="w-1 h-6 bg-desert-green" />
                  Benchmark Details
                </h2>

                <div className="bg-desert-white rounded-lg border border-desert-stone-light shadow-sm overflow-hidden">
                  {/* Summary row - always visible */}
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="w-full p-6 flex items-center justify-between hover:bg-desert-stone-lighter/30 transition-colors"
                  >
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-left flex-1">
                      <div>
                        <div className="text-desert-stone-dark">Benchmark ID</div>
                        <div className="font-mono text-xs">
                          {latestResult.benchmark_id.slice(0, 8)}...
                        </div>
                      </div>
                      <div>
                        <div className="text-desert-stone-dark">Type</div>
                        <div className="capitalize">{latestResult.benchmark_type}</div>
                      </div>
                      <div>
                        <div className="text-desert-stone-dark">Date</div>
                        <div>
                          {new Date(
                            latestResult.created_at as unknown as string
                          ).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-desert-stone-dark">NOMAD Score</div>
                        <div className="font-bold text-desert-green">
                          {latestResult.nomad_score.toFixed(1)}
                        </div>
                      </div>
                    </div>
                    <IconChevronDown
                      className={`w-5 h-5 text-desert-stone-dark transition-transform ${showDetails ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Expanded details */}
                  {showDetails && (
                    <div className="border-t border-desert-stone-light p-6 bg-desert-stone-lighter/20">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Raw Scores */}
                        <div>
                          <h4 className="font-semibold text-desert-green mb-3">Raw Scores</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-desert-stone-dark">CPU Score</span>
                              <span className="font-mono">
                                {(latestResult.cpu_score * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-desert-stone-dark">Memory Score</span>
                              <span className="font-mono">
                                {(latestResult.memory_score * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-desert-stone-dark">Disk Read Score</span>
                              <span className="font-mono">
                                {(latestResult.disk_read_score * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-desert-stone-dark">Disk Write Score</span>
                              <span className="font-mono">
                                {(latestResult.disk_write_score * 100).toFixed(1)}%
                              </span>
                            </div>
                            {latestResult.ai_tokens_per_second && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-desert-stone-dark">AI Tokens/sec</span>
                                  <span className="font-mono">
                                    {latestResult.ai_tokens_per_second.toFixed(1)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-desert-stone-dark">
                                    AI Time to First Token
                                  </span>
                                  <span className="font-mono">
                                    {latestResult.ai_time_to_first_token?.toFixed(0) || 'N/A'} ms
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Benchmark Info */}
                        <div>
                          <h4 className="font-semibold text-desert-green mb-3">Benchmark Info</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-desert-stone-dark">Full Benchmark ID</span>
                              <span className="font-mono text-xs">{latestResult.benchmark_id}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-desert-stone-dark">Benchmark Type</span>
                              <span className="capitalize">{latestResult.benchmark_type}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-desert-stone-dark">Run Date</span>
                              <span>
                                {new Date(
                                  latestResult.created_at as unknown as string
                                ).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-desert-stone-dark">Builder Tag</span>
                              <span className="font-mono">
                                {latestResult.builder_tag || 'Not set'}
                              </span>
                            </div>
                            {latestResult.ai_model_used && (
                              <div className="flex justify-between">
                                <span className="text-desert-stone-dark">AI Model Used</span>
                                <span>{latestResult.ai_model_used}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-desert-stone-dark">
                                Submitted to Repository
                              </span>
                              <span>{latestResult.submitted_to_repository ? 'Yes' : 'No'}</span>
                            </div>
                            {latestResult.repository_id && (
                              <div className="flex justify-between">
                                <span className="text-desert-stone-dark">Repository ID</span>
                                <span className="font-mono text-xs">
                                  {latestResult.repository_id}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Benchmark History */}
              {benchmarkHistory && benchmarkHistory.length > 1 && (
                <section className="mb-12">
                  <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
                    <div className="w-1 h-6 bg-desert-green" />
                    Benchmark History
                  </h2>

                  <div className="bg-desert-white rounded-lg border border-desert-stone-light shadow-sm overflow-hidden">
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      className="w-full p-4 flex items-center justify-between hover:bg-desert-stone-lighter/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <IconClock className="w-5 h-5 text-desert-stone-dark" />
                        <span className="font-medium text-desert-green">
                          {benchmarkHistory.length} benchmark
                          {benchmarkHistory.length !== 1 ? 's' : ''} recorded
                        </span>
                      </div>
                      <IconChevronDown
                        className={`w-5 h-5 text-desert-stone-dark transition-transform ${showHistory ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {showHistory && (
                      <div className="border-t border-desert-stone-light">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-desert-stone-lighter/50">
                              <tr>
                                <th className="text-left p-3 font-medium text-desert-stone-dark">
                                  Date
                                </th>
                                <th className="text-left p-3 font-medium text-desert-stone-dark">
                                  Type
                                </th>
                                <th className="text-left p-3 font-medium text-desert-stone-dark">
                                  Score
                                </th>
                                <th className="text-left p-3 font-medium text-desert-stone-dark">
                                  Builder Tag
                                </th>
                                <th className="text-left p-3 font-medium text-desert-stone-dark">
                                  Shared
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-desert-stone-lighter">
                              {benchmarkHistory.map((result) => (
                                <tr
                                  key={result.benchmark_id}
                                  className={`hover:bg-desert-stone-lighter/30 ${
                                    result.benchmark_id === latestResult?.benchmark_id
                                      ? 'bg-desert-green/5'
                                      : ''
                                  }`}
                                >
                                  <td className="p-3">
                                    {new Date(
                                      result.created_at as unknown as string
                                    ).toLocaleDateString()}
                                  </td>
                                  <td className="p-3 capitalize">{result.benchmark_type}</td>
                                  <td className="p-3">
                                    <span className="font-bold text-desert-green">
                                      {result.nomad_score.toFixed(1)}
                                    </span>
                                  </td>
                                  <td className="p-3 font-mono text-xs">
                                    {result.builder_tag || '—'}
                                  </td>
                                  <td className="p-3">
                                    {result.submitted_to_repository ? (
                                      <span className="text-green-600">✓</span>
                                    ) : (
                                      <span className="text-desert-stone-dark">—</span>
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
                </section>
              )}
            </>
          )}

          {!latestResult && !isRunning && (
            <Alert
              type="info"
              title="No Benchmark Results"
              message="Run your first benchmark to see your server's performance scores."
              variant="bordered"
            />
          )}
        </main>
      </div>
    </SettingsLayout>
  )
}
