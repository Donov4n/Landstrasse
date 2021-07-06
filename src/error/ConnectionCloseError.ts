class ConnectionCloseError extends Error {
    constructor(reason: string, public code: number) {
        super(reason);
    }
}

export default ConnectionCloseError;
