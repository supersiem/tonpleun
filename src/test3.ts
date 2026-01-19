import { getService, initializeClient, SetConfigItem, genHelper } from './clientLib.js'
import { echo } from './GEN.js';
import assert from 'node:assert/strict';

async function main() {
    await initializeClient('Client3');
    echo('Hello from Client3').then((result) => {
        assert.equal(result, 'pindakaas');
    });
}
main();