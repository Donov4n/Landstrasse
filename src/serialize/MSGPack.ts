import * as msgpackFactory from 'msgpack5';
import { IBinarySerializer } from '../types/Serializer';
import { WampMessage } from '../types/Protocol';

export class MSGPackSerializer implements IBinarySerializer {
  private msgpack: msgpackFactory.MessagePack;
  constructor() {
    this.msgpack = msgpackFactory({
      forceFloat64: true,
    });
  }
  public IsBinary(): boolean {
    return true;
  }
  public ProtocolID(): string {
    return 'wamp.2.msgpack';
  }
  public Serialize(msg: WampMessage): ArrayBufferLike {
    return this.msgpack.encode(msg) as any;
  }
  public Deserialize(msg: ArrayBufferLike): WampMessage {
    return this.msgpack.decode(msg as any);
  }
}
