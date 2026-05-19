export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, "DATABASE_ERROR", cause);
    this.name = "DatabaseError";
  }
}

export class RuntimeError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, "RUNTIME_ERROR", cause);
    this.name = "RuntimeError";
  }
}
