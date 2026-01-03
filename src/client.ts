import { initializeClient, registerService, ws } from './clientLib.js'
function echo(args: any[]) {
    console.log(args)
    return 'pindakaas'
}
async function main() {
    await initializeClient('testClient');
    console.log(await registerService('echo', ['string'], echo))
}
main();