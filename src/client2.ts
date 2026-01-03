import { getService, initializeClient } from './clientLib.js'
async function main() {
    await initializeClient('Client2');
    const result = await getService('echo', 'testClient', ['hoi!!!!'])
    console.log('[Client2] echo result:', result)
}
main();