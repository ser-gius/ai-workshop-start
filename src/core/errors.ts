/** A failure explained to the user: the CLI prints the message and exits with code 1. */
export class AtlasError extends Error {}

/**
 * The source turned the whole scan away (a rejected token, the rate limit, unreachable): an
 * organization scan stops, instead of skipping one repository after another.
 */
export class UnavailableError extends AtlasError {}

/** A repository without a single commit: in an organization, no skills and no warning. */
export class EmptyRepositoryError extends AtlasError {}
