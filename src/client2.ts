import { getService, initializeClient, SetConfigItem, genHelper } from './clientLib.js'
import assert from 'node:assert/strict';
async function main() {
    await initializeClient('Client2');
    const result = await getService('echo', 'testClient', ['hoi!!!!'])
    console.log('[Client2] echo result:', result)
    // Validate that configs registered by Client1 are visible and updated
    const configs: any = await getService('getConfigs', 'tonpleun', []);
    assert.ok(configs['testClient'], 'configs for testClient should exist');
    assert.ok(configs['testClient']['conf:greeting'], 'conf:greeting should be present');
    console.log('[Client2] observed config:', configs['testClient']['conf:greeting']);
    // Trigger a remote config update for owner 'testClient' and verify server state
    await SetConfigItem('conf:greeting', 'bye', 'testClient');
    const configsAfterSet: any = await getService('getConfigs', 'tonpleun', []);
    assert.equal(configsAfterSet['testClient']['conf:greeting'].value, 'bye');
    console.log('[Client2] remote config update OK');

    const genResult = await genHelper();
    console.log('[Client2] genHelper result length:', genResult.length);
}
main();