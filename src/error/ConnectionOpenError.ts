class ConnectionOpenError extends Error {
    public readonly reason: string;

    constructor(reason: string, message?: string) {
        super(message ? `${message} (${reason})` : reason);

        this.reason = reason;
    }
}

export default ConnectionOpenError;
