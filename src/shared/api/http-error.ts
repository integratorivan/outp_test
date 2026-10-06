export class HttpError extends Error {
  constructor(readonly status: number, readonly statusText: string) {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ''}`)
    this.name = 'HttpError'
  }
}
