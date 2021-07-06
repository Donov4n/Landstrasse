import type { WampDict } from '../types/messages/MessageTypes';

class ConnectionOpenError extends Error {
    constructor(reason: string, public details?: WampDict) {
        super(reason);
    }
}

export default ConnectionOpenError;
