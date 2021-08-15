# Landstrasse

> Strongly typed (TypeScript) [WAMP](https://wamp-proto.org/) Client for browsers. 

## Install

```bash
# - NPM
$ npm install landstrasse

# - Yarn
$ yarn add landstrasse
```

## Features

- Configurable "failover" / auto-reconnection support.
- Progress support for calls.
- Call cancellation support.
- Pub / Sub support.
- RPC support.

## Getting started

Before using this lib, you should have a working WAMP Router to which this lib. will be connected.  
Please follow the official [Crossbar.io guide](https://crossbar.io/docs/Getting-Started/) if you haven't one.

Please also note that this lib has been designed to be as small as possible, without dependencies and is intended to be used in a browser context.
Your target environnement should have `WebSocket` and `Promise` globals API available.

This lib must be used in a bundled context (Webpack, etc.) thanks to which you will be able to benefit from Tree Shaking 
and the possibility to import only what you need (Auth, Serializer).  

Once this is done, all you need to do is:

```js
import Landstrasse from 'landstrasse';

const webSocket = new Landstrasse('ws://localhost:3000', 'my-realm');
await webSocket.open();

//
// - Subscription
//

const mySubscription = await webSocket.subscribe('my.notification', ([message]) => {
    console.log('New notification received', message);
});
// -> mySubscription.id - Contain the unique subscription id.
// -> myRegistration.uri - The subscribed URI (same as the first param passed above).
// -> mySubscription.unsubscribe(); - Allow to cancel the subscription afterwards.

//
// - Call
//

const [myCallPromise, myCallCancel] = webSocket.call('my.log', null, { type: 'error', message: 'A log message' });
// -> myCallPromise - Contains the promise that will be resolved when the call will have been performed.
// -> myCallCancel(); - For cancelling the call while in progress.
const myCallResult = await myCallPromise;

//
// - Registration
//

const myRegistration = await webSocket.register('my.refresh', () => {
    window.location.reload();
});
// -> myRegistration.id - Contain the unique registration id.
// -> myRegistration.uri - The registration URI (same as the first param passed above).
// -> myRegistration.unregister(); - Allow to cancel the registration afterwards.

//
// - Publication
//

const myPublicationId = await webSocket.publish('my.chat.message', ['Hello :)'], { acknowledge: true });
// - If `published` is called with the `acknowledge` option, the promise will be resolved when
//   the router will hav received the publication and you will have access to the publication id.

await webSocket.publish('my.chat.message', ['Hello :)']);
// - If the `acknowledge` option is not used, the `publish` method will resolve the promise without
//   waiting for the router to return (so you won't have access to the publication id)
```

*__Note:__ In a real app it would be necessary to manage the cases where the calls 
return an error via a try / catch for example.*

## Acknowledgment

This lib started as a fork of [kraftfahrstrasse](https://github.com/verkehrsministerium/kraftfahrstrasse), but removed the Node support which was voluntarily not desirable
and added new features (e.g. failover) and a redesign of the API.
