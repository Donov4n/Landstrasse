import Logger from '../util/logger';

import type { IdGeneratorInterface } from '../util/id';
import type { WampDict } from '../types/messages/MessageTypes';
import type { WampMessage } from '../types/Protocol';

export type MessageSender = (msg: WampMessage) => Promise<void>;
export type ProtocolViolator = (msg: string) => void;
export type IdGenerators = {
    global: IdGeneratorInterface;
    session: IdGeneratorInterface;
};

export interface ProcessorInterface {
    processMessage(msg: WampMessage): boolean;
    close(): void;
}

export interface ProcessorFactoryInterface {
    new (
        sender: MessageSender,
        violator: ProtocolViolator,
        idGenerators: IdGenerators,
        logger: Logger,
    ): ProcessorInterface;

    getFeatures(): WampDict;
}

abstract class AbstractProcessor implements ProcessorInterface {
    protected closed = false;

    constructor(
        protected sender: MessageSender,
        protected violator: ProtocolViolator,
        protected idGenerators: IdGenerators,
        protected logger: Logger,
    ) {}

    public close(): void {
        this.closed = true;
        this.onClose();
    }

    public processMessage(msg: WampMessage): boolean {
        if (this.closed) {
            return false;
        }
        return this.onMessage(msg);
    }

    protected abstract onClose(): void;
    protected abstract onMessage(msg: WampMessage): boolean;
}

export default AbstractProcessor;
