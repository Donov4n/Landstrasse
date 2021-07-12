import type { EWampMessageID, WampURI } from './MessageTypes';

export type HelloMessageDetails = {
    roles: {
        publisher: {};
        subscriber: {};
        caller: {};
        callee: {};
    };
    agent?: string;
    authmethods?: string[];
    authid?: string;
    authextra?: Record<string, any>,
};

export type WampHelloMessage = [EWampMessageID.HELLO, WampURI, HelloMessageDetails];
