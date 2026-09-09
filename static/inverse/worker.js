import {workerController} from './worker-controller.js';
self.onmessage=workerController(self);
