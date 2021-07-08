import { WampMessage } from '../types/Protocol';

import type { TextSerializerInterface } from '../types/Serializer';

class JSONSerializer implements TextSerializerInterface {
    public get isBinary(): boolean {
        return false;
    }

    public get protocolId(): string {
        return 'wamp.2.json';
    }

    public serialize(msg: WampMessage): string {
        return JSON.stringify(msg);
    }

    public unserialize(msg: string): WampMessage {
        return JSON.parse(msg);
    }
}

export default JSONSerializer;
