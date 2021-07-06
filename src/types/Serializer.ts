import type { WampMessage } from './Protocol';

export interface BaseSerializerInterface {
    ProtocolID(): string;
    IsBinary(): boolean;
}

export function IsBinarySerializer(ser: SerializerInterface): ser is BinarySerializerInterface {
    return ser.IsBinary();
}

export interface TextSerializerInterface extends BaseSerializerInterface {
    Serialize(msg: WampMessage): string;
    Deserialize(msg: string): WampMessage;
}

export interface BinarySerializerInterface extends BaseSerializerInterface {
    Serialize(msg: WampMessage): ArrayBufferLike;
    Deserialize(msg: ArrayBufferLike): WampMessage;
}

export type SerializerInterface = TextSerializerInterface | BinarySerializerInterface;

export { WampMessage };
