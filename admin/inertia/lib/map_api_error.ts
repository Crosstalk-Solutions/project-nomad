import axios from 'axios'

export function mapApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ message?: string; error?: string }>(error)) {
    return error.response?.data?.message || error.response?.data?.error || fallback
  }
  return error instanceof Error ? error.message : fallback
}
