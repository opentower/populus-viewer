// based on https://github.com/vector-im/element-web/blob/develop/src/vector/indexeddb-worker.js

import { IndexedDBStoreWorker } from 'matrix-js-sdk/lib/indexeddb-worker.js';

const remoteWorker = new IndexedDBStoreWorker(self.postMessage);

global.onmessage = remoteWorker.onMessage;
