import type { WampMessage } from './Protocol';

export interface BaseSerializerInterface {
    get protocolId(): string;
    get isBinary(): boolean;
}

export interface TextSerializerInterface extends BaseSerializerInterface {
    serialize(msg: WampMessage): string;
    unserialize(msg: string): WampMessage;
}

export interface BinarySerializerInterface extends BaseSerializerInterface {
    serialize(msg: WampMessage): ArrayBufferLike;
    unserialize(msg: ArrayBufferLike): WampMessage;
}

export type SerializerInterface = TextSerializerInterface | BinarySerializerInterface;

export { WampMessage };
