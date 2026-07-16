export class InvocationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvocationValidationError";
  }
}

