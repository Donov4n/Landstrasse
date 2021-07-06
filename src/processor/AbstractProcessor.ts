import Logger from '../util/logger';

import type { IDGeneratorInterface } from '../util/id';
import type { WampDict } from '../types/messages/MessageTypes';
import type { WampMessage } from '../types/Protocol';

export type MessageSender = (msg: WampMessage) => Promise<void>;
export type ProtocolViolator = (msg: string) => void;
export type IDGen = {
    global: IDGeneratorInterface;
    session: IDGeneratorInterface;
};

export interface ProcessorInterface {
    Close(): void;
    ProcessMessage(msg: WampMessage): boolean;
}

export interface ProcessorFactoryInterface {
    new (
        sender: MessageSender,
        violator: ProtocolViolator,
        idGen: IDGen,
        logger: Logger,
    ): ProcessorInterface;
    GetFeatures(): WampDict;
}

abstract class AbstractProcessor {
    protected closed = false;

    constructor(
        protected sender: MessageSender,
        protected violator: ProtocolViolator,
        protected idGen: IDGen,
        protected logger: Logger,
    ) {}

    public Close(): void {
        this.closed = true;
        this.onClose();
    }

    public ProcessMessage(msg: WampMessage): boolean {
        if (this.closed) {
            return false;
        }
        return this.onMessage(msg);
    }

    protected abstract onClose(): void;
    protected abstract onMessage(msg: WampMessage): boolean;
}

export default AbstractProcessor;
