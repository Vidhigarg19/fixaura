// Missing env / secret. Handlers isse configuration_error bana dete hain.
export class ConfigurationError extends Error {
  constructor(message = 'configuration') {
    super(message)
    this.name = 'ConfigurationError'
  }
}
