import type { WampDict } from '../types/messages/MessageTypes';

class ConnectionOpenError extends Error {
    public readonly details: WampDict;

    constructor(reason: string, details: WampDict = {}) {
        super(reason);

        this.details = details;
    }
}

export default ConnectionOpenError;
