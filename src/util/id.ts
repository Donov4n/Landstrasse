import type { WampID } from '../types/messages/MessageTypes';

export interface IdGeneratorInterface {
    id(): WampID;
}

export class GlobalIDGenerator implements IdGeneratorInterface {
    public id(): WampID {
        // Taken from autobahn-js util.js
        return Math.floor(Math.random() * 9007199254740992) + 1;
    }
}

export class SessionIDGenerator implements IdGeneratorInterface {
    private currentID = 1;

    public id(): WampID {
        return this.currentID++;
    }
}
