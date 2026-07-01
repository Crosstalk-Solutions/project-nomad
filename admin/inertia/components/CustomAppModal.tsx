import { useEffect, useState } from 'react'
import StyledModal from './StyledModal'
import StyledButton from './StyledButton'
import Alert from './Alert'
import api from '~/lib/api'
import Input from './inputs/Input'
import Select from './inputs/Select'
import DynamicIcon, { DynamicIconName } from './DynamicIcon'
import { IconTrash } from '@tabler/icons-react'

interface PortMapping {
  container: string
  host: string
}

interface VolumeMapping {
  host_path: string
  container_path: string
}

interface EnvVar {
  value: string
}

export interface CustomAppInitial {
  service_name: string
  friendly_name: string | null
  image: string
  category: string
  icon: string
  ports: Array<{ container: number; host: number }>
  volumes: Array<{ host_path: string; container_path: string }>
  env: string[]
  memory_mb?: number
  cpus?: number
}

interface CustomAppModalProps {
  open: boolean
  onClose: () => void
  onCreated: (serviceName: string) => void
  showError: (msg: string) => void
  /** 'edit' reconfigures an existing custom app (prefilled from `initial`); defaults to 'create'. */
  mode?: 'create' | 'edit'
  initial?: CustomAppInitial | null
}

const CATEGORY_OPTIONS = [
  { value: 'custom', label: 'Custom' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'media', label: 'Media' },
  { value: 'security', label: 'Security' },
  { value: 'networking', label: 'Networking' },
  { value: 'utility', label: 'Utility' },
  { value: 'ai', label: 'AI' },
  { value: 'education', label: 'Education' },
]

// Curated subset of the DynamicIcon map suitable for custom apps.
const ICON_OPTIONS = [
  { value: 'IconBrandDocker', label: 'Docker (default)' },
  { value: 'IconBox', label: 'Box' },
  { value: 'IconServer', label: 'Server' },
  { value: 'IconDatabase', label: 'Database' },
  { value: 'IconCode', label: 'Code' },
  { value: 'IconTool', label: 'Tool' },
  { value: 'IconWorld', label: 'Web' },
  { value: 'IconShieldLock', label: 'Security' },
  { value: 'IconMovie', label: 'Media' },
  { value: 'IconBook', label: 'Book' },
  { value: 'IconNotes', label: 'Notes' },
  { value: 'IconCpu', label: 'Compute' },
  { value: 'IconRobot', label: 'AI / Bot' },
  { value: 'IconWifi', label: 'Network' },
  { value: 'IconHome', label: 'Home' },
]

export default function CustomAppModal({
  open,
  onClose,
  onCreated,
  showError,
  mode = 'create',
  initial = null,
}: CustomAppModalProps) {
  const isEdit = mode === 'edit'
  const [friendlyName, setFriendlyName] = useState('')
  const [image, setImage] = useState('')
  const [category, setCategory] = useState('custom')
  const [icon, setIcon] = useState('IconBrandDocker')
  const [ports, setPorts] = useState<PortMapping[]>([{ container: '', host: '' }])
  const [volumes, setVolumes] = useState<VolumeMapping[]>([])
  const [envVars, setEnvVars] = useState<EnvVar[]>([])
  const [memoryMb, setMemoryMb] = useState('')
  const [cpus, setCpus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [portConflicts, setPortConflicts] = useState<Array<{ port: number; usedBy: string }>>([])
  const [resourceWarnings, setResourceWarnings] = useState<string[]>([])
  const [blocked, setBlocked] = useState<string[]>([])
  const [forceInstall, setForceInstall] = useState(false)
  const [checkingPreflight, setCheckingPreflight] = useState(false)
  const [suggestedPort, setSuggestedPort] = useState<number | null>(null)

  // On open: prefill from the existing app (edit) or fetch a suggested port (create).
  useEffect(() => {
    if (!open) return
    if (isEdit && initial) {
      setFriendlyName(initial.friendly_name ?? '')
      setImage(initial.image)
      setCategory(initial.category)
      setIcon(initial.icon || 'IconBrandDocker')
      setPorts(
        initial.ports.length
          ? initial.ports.map((p) => ({ container: String(p.container), host: String(p.host) }))
          : [{ container: '', host: '' }]
      )
      setVolumes(initial.volumes)
      setEnvVars(initial.env.map((v) => ({ value: v })))
      setMemoryMb(initial.memory_mb != null ? String(initial.memory_mb) : '')
      setCpus(initial.cpus != null ? String(initial.cpus) : '')
      return
    }
    api.suggestCustomPort().then((res) => {
      if (res?.port) {
        setSuggestedPort(res.port)
        setPorts([{ container: '', host: String(res.port) }])
      }
    })
  }, [open, isEdit, initial])

  // Live preflight: whenever ports, volumes or the image change, debounce a check for port
  // conflicts, resource/guard warnings and hard blocks so the user gets feedback before submitting.
  useEffect(() => {
    if (!open) return
    const validPorts = ports
      .map((p) => parseInt(p.host, 10))
      .filter((p) => !isNaN(p))
    const validVolumes = volumes.filter((v) => v.host_path && v.container_path)

    if (validPorts.length === 0 && validVolumes.length === 0 && !image.trim()) {
      setPortConflicts([])
      setResourceWarnings([])
      setBlocked([])
      setCheckingPreflight(false)
      return
    }

    setCheckingPreflight(true)
    const handle = setTimeout(async () => {
      const res = await api.preflightCustomApp({
        image: image.trim() || undefined,
        ports: validPorts.length ? validPorts : undefined,
        volumes: validVolumes.length ? validVolumes : undefined,
        exclude_service: isEdit && initial ? initial.service_name : undefined,
      })
      if (res) {
        setPortConflicts(res.portConflicts ?? [])
        setResourceWarnings(res.resourceWarnings ?? [])
        setBlocked(res.blocked ?? [])
      }
      setCheckingPreflight(false)
    }, 400)

    return () => clearTimeout(handle)
  }, [open, ports, volumes, image])

  function resetForm() {
    setFriendlyName('')
    setImage('')
    setCategory('custom')
    setIcon('IconBrandDocker')
    setPorts([{ container: '', host: '' }])
    setVolumes([])
    setEnvVars([])
    setMemoryMb('')
    setCpus('')
    setPortConflicts([])
    setResourceWarnings([])
    setBlocked([])
    setForceInstall(false)
    setSuggestedPort(null)
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  // ── Port row helpers ──────────────────────────────────────────────────────
  function updatePort(idx: number, field: keyof PortMapping, value: string) {
    setPorts((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)))
  }
  function addPort() {
    const nextHost = suggestedPort ? suggestedPort + ports.length * 10 : 8600 + ports.length * 10
    setPorts((prev) => [...prev, { container: '', host: String(nextHost) }])
  }
  function removePort(idx: number) {
    setPorts((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Volume row helpers ────────────────────────────────────────────────────
  function updateVolume(idx: number, field: keyof VolumeMapping, value: string) {
    setVolumes((prev) => prev.map((v, i) => (i === idx ? { ...v, [field]: value } : v)))
  }
  function addVolume() {
    setVolumes((prev) => [...prev, { host_path: '', container_path: '' }])
  }
  function removeVolume(idx: number) {
    setVolumes((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Env var helpers ───────────────────────────────────────────────────────
  function updateEnv(idx: number, value: string) {
    setEnvVars((prev) => prev.map((e, i) => (i === idx ? { value } : e)))
  }
  function addEnv() {
    setEnvVars((prev) => [...prev, { value: '' }])
  }
  function removeEnv(idx: number) {
    setEnvVars((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!friendlyName.trim() || !image.trim()) {
      showError('Name and image are required.')
      return
    }
    if (blocked.length > 0) {
      showError('Resolve the blocked issues before installing.')
      return
    }

    const validPorts = ports
      .filter((p) => p.container && p.host)
      .map((p) => ({ container: parseInt(p.container, 10), host: parseInt(p.host, 10) }))
      .filter((p) => !isNaN(p.container) && !isNaN(p.host))

    const validVolumes = volumes.filter((v) => v.host_path && v.container_path)
    const validEnv = envVars.map((e) => e.value).filter(Boolean)
    const parsedMemory = parseInt(memoryMb, 10)
    const parsedCpus = parseFloat(cpus)

    setSubmitting(true)
    try {
      const common = {
        friendly_name: friendlyName.trim(),
        image: image.trim(),
        ports: validPorts.length ? validPorts : undefined,
        volumes: validVolumes.length ? validVolumes : undefined,
        env: validEnv.length ? validEnv : undefined,
        category,
        icon,
        memory_mb: !isNaN(parsedMemory) ? parsedMemory : undefined,
        cpus: !isNaN(parsedCpus) ? parsedCpus : undefined,
        // The user has already acknowledged any conflicts via the "install anyway" checkbox.
        force: forceInstall,
      }
      const result =
        isEdit && initial
          ? await api.updateCustomApp({ service_name: initial.service_name, ...common })
          : await api.createCustomApp(common)

      if (result?.success && result.service_name) {
        resetForm()
        onCreated(result.service_name)
      } else {
        // Check if it's a port conflict error — show warnings and let user force
        if (result?.message?.toLowerCase().includes('port') || result?.message?.toLowerCase().includes('conflict')) {
          showError(result.message)
        } else {
          showError(result?.message || 'Failed to create custom app.')
        }
      }
    } catch (err: any) {
      showError(err?.message || 'Unexpected error creating custom app.')
    } finally {
      setSubmitting(false)
    }
  }

  const hasWarnings = portConflicts.length > 0 || resourceWarnings.length > 0
  const hasBlocks = blocked.length > 0
  const canSubmit =
    friendlyName.trim() && image.trim() && !hasBlocks && (!hasWarnings || forceInstall)

  return (
    <StyledModal
      title={isEdit ? 'Edit App' : 'Add Custom App'}
      open={open}
      onCancel={handleClose}
      cancelText="Cancel"
      onConfirm={handleSubmit}
      confirmVariant='primary'
      confirmText={isEdit ? 'Save & Recreate' : 'Install'}
      confirmIcon="IconBrandDocker"
      confirmLoading={submitting}
      confirmDisabled={!canSubmit}
      large
    >
      <div className="space-y-6 text-sm">
        {/* Image + Name */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            name='image'
            label="Docker Image"
            placeholder="e.g. nginx:latest"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            required
          />
          <Input
            name='friendlyName'
            label="Display Name"
            placeholder="My App"
            value={friendlyName}
            onChange={(e) => setFriendlyName(e.target.value)}
            required
          />
        </div>

        {/* Category + Icon */}
        <div className="grid grid-cols-2 gap-4 items-start">
          <Select
            name='category'
            label='Category'
            helpText='Select the most relevant category for this app. This helps with visual organization and filtering.'
            value={category}
            onChange={(newVal) => setCategory(newVal)}
            options={CATEGORY_OPTIONS}
          />
          <div className="flex items-end gap-2">
            <Select
              name='icon'
              label='Icon'
              helpText='Pick an icon shown on the app card.'
              value={icon}
              onChange={(newVal) => setIcon(newVal)}
              options={ICON_OPTIONS}
              className="flex-1 min-w-0"
            />
            <div
              className="flex-shrink-0 flex items-center justify-center h-[42px] w-[42px] rounded-md border border-border-default bg-surface-secondary"
              title="Icon preview"
            >
              <DynamicIcon icon={icon as DynamicIconName} className="h-6 w-6 text-desert-green" />
            </div>
          </div>
        </div>

        {/* Port Mappings */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Port Mappings</label>
            <StyledButton size="sm" variant="ghost" icon="IconPlus" onClick={addPort}>Add Port</StyledButton>
          </div>
          {ports.length === 0 && (
            <p className="text-xs italic">No port mappings — the app won't be accessible from a browser.</p>
          )}
          <div className="space-y-2">
            {ports.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2 w-full">
                <Input
                  name={`containerPort${idx}`}
                  label=''
                  type="number"
                  placeholder="Container port"
                  value={p.container}
                  onChange={(e) => updatePort(idx, 'container', e.target.value)}
                  className='w-full'
                />
                <span className="text-xs">→</span>
                <Input
                  name={`hostPort${idx}`}
                  label=''
                  type="number"
                  placeholder="Host port (8600+)"
                  value={p.host}
                  onChange={(e) => updatePort(idx, 'host', e.target.value)}
                  className='w-full'
                />
                <button
                  type="button"
                  onClick={() => removePort(idx)}
                  className="hover:text-desert-red transition-colors cursor-pointer"
                >
                  <IconTrash className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs mt-2">Host ports should be in the 8600+ range. Custom apps get ports starting at {suggestedPort ?? 8600}.</p>
          {checkingPreflight && (
            <p className="text-xs mt-1 italic text-text-muted">Checking port availability…</p>
          )}
        </div>

        {/* Volume Mappings */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Volume Mounts</label>
            <StyledButton size="sm" variant="ghost" icon="IconPlus" onClick={addVolume}>Add Volume</StyledButton>
          </div>
          {volumes.length === 0 && (
            <p className="text-xs italic">No volumes — data won't persist across restarts.</p>
          )}
          <div className="space-y-2">
            {volumes.map((v, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  name={`hostPath${idx}`}
                  label=''
                  type="text"
                  placeholder="Host path (absolute)"
                  value={v.host_path}
                  onChange={(e) => updateVolume(idx, 'host_path', e.target.value)}
                  className='w-full'
                />
                <span className="text-xs">:</span>
                <Input
                  name={`containerPath${idx}`}
                  label=''
                  type="text"
                  placeholder="Container path"
                  value={v.container_path}
                  onChange={(e) => updateVolume(idx, 'container_path', e.target.value)}
                  className='w-full'
                />
                <button
                  type="button"
                  onClick={() => removeVolume(idx)}
                  className="hover:text-desert-red transition-colors cursor-pointer"
                >
                  <IconTrash className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Environment Variables */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Environment Variables</label>
            <StyledButton size="sm" variant="ghost" icon="IconPlus" onClick={addEnv}>Add Variable</StyledButton>
          </div>
          <div className="space-y-2">
            {envVars.map((e, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  name={`envVar${idx}`}
                  label=''
                  placeholder="KEY=value"
                  value={e.value}
                  onChange={(ev) => updateEnv(idx, ev.target.value)}
                  className='w-full font-mono'
                />
                <button
                  type="button"
                  onClick={() => removeEnv(idx)}
                  className="hover:text-desert-red transition-colors cursor-pointer"
                >
                  <IconTrash className="w-5 h-5" />
                </button>
              </div>
            ))}
            {envVars.length === 0 && (
              <p className="text-xs italic">No environment variables provided.</p>
            )}
          </div>
        </div>

        {/* Advanced: resource limits */}
        <div>
          <label className="text-sm font-medium">Resource Limits (optional)</label>
          <div className="grid grid-cols-2 gap-4 mt-1">
            <Input
              name='memoryMb'
              label=''
              type="number"
              placeholder="Memory (MB) — default 1024"
              value={memoryMb}
              onChange={(e) => setMemoryMb(e.target.value)}
              className='w-full'
            />
            <Input
              name='cpus'
              label=''
              type="number"
              placeholder="CPUs — default 1"
              value={cpus}
              onChange={(e) => setCpus(e.target.value)}
              className='w-full'
            />
          </div>
          <p className="text-xs mt-1 italic">Caps prevent a runaway container from starving the host. Leave blank to use the defaults (1024 MB / 1 CPU).</p>
        </div>

        {/* Hard blocks — must be resolved before installing */}
        {hasBlocks && (
          <div className="space-y-2">
            {blocked.map((b, i) => (
              <Alert key={i} type="error" title="Not allowed" message={b} />
            ))}
          </div>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div className="space-y-2">
            {portConflicts.map((c) => (
              <Alert
                key={c.port}
                type="warning"
                title={`Port ${c.port} is already in use`}
                message={`Currently bound by: ${c.usedBy}. Installation may fail.`}
              />
            ))}
            {resourceWarnings.map((w, i) => (
              <Alert key={i} type="warning" title="Resource warning" message={w} />
            ))}
            <label className="flex items-center gap-2 cursor-pointer select-none mt-1">
              <input
                type="checkbox"
                checked={forceInstall}
                onChange={(e) => setForceInstall(e.target.checked)}
                className="accent-desert-orange h-4 w-4 rounded"
              />
              <span className="text-text-muted text-xs">I understand — install anyway</span>
            </label>
          </div>
        )}

        <p className="text-sm">
          Containers are created with <code className="font-mono">--restart=unless-stopped</code>. Data is not persisted unless you add volume mounts above.
        </p>
      </div>
    </StyledModal>
  )
}
