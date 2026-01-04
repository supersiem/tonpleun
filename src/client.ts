import { getService, initializeClient, registerService, ws, registerConfigItem, SetConfigItem, getConfigValue } from './clientLib.js'
import assert from 'node:assert/strict';
function echo(args: any[]) {
  console.log(args)
  return 'pindakaas'
}
async function main() {
  await initializeClient('testClient');
  console.log(await registerService('echo', ['string'], echo))
  console.log(await getService('getServices', 'tonpleun', []))
  // Config tests: register and update a config item, then verify via tonpleun service
  await registerConfigItem('greeting', 'Simple greeting config', 'hello', 'conf:greeting');
  const configsAfterRegister: any = await getService('getConfigs', 'tonpleun', []);
  assert.ok(configsAfterRegister['testClient'], 'configs for testClient should exist');
  assert.ok(configsAfterRegister['testClient']['conf:greeting'], 'conf:greeting should be registered');
  assert.equal(configsAfterRegister['testClient']['conf:greeting'].defaultValue, 'hello');
  console.log('[Client1] registered config OK');

  await SetConfigItem('conf:greeting', 'hi');
  const configsAfterSet: any = await getService('getConfigs', 'tonpleun', []);
  assert.equal(configsAfterSet['testClient']['conf:greeting'].value, 'hi');
  console.log('[Client1] set config value OK');
  assert.equal(getConfigValue('conf:greeting'), 'hi');
  console.log('[Client1] local config value OK');
  // Wait for a potential remote update (e.g., from Client2) and verify locally
  await new Promise<void>((resolve) => {
    const expected = 'bye';
    const start = Date.now();
    const interval = setInterval(() => {
      const current = getConfigValue('conf:greeting');
      if (current === expected) {
        clearInterval(interval);
        console.log('[Client1] remote config update applied OK');
        resolve();
      } else if (Date.now() - start > 5000) {
        clearInterval(interval);
        console.warn('[Client1] timeout waiting remote update; current:', current);
        resolve();
      }
    }, 200);
  });
}
main();
