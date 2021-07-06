import { WampMessage } from '../types/Protocol';

import type { TextSerializerInterface } from '../types/Serializer';

class JSONSerializer implements TextSerializerInterface {
    public IsBinary(): boolean {
        return false;
    }

    public ProtocolID(): string {
        return 'wamp.2.json';
    }

    public Serialize(msg: WampMessage): string {
        return JSON.stringify(msg);
    }

    public Deserialize(msg: string): WampMessage {
        return JSON.parse(msg);
    }
}

export default JSONSerializer;
