import { initializeClient, getService, SetConfigItem, TESTING_HELPERS } from "../../../clientLib";

async function main() {
    await initializeClient('clientB');
    console.log('Client B is initialized and ready to use services.');
    const firstResult = await getService('addNumbers', 'clientA', [5, 10]);
    if (firstResult !== 15) {
        TESTING_HELPERS.error(`Expected 15 but got ${firstResult}`);
        return;
    }
    await SetConfigItem('addNumbersMode', 'double', 'clientA');
    console.log('Config item addNumbers mode set to double on Client A.');
    const secondResult = await getService('addNumbers', 'clientA', [5, 10]);
    if (secondResult !== 30) {
        TESTING_HELPERS.error(`Expected 30 but got ${secondResult}`);
        return;
    }
    TESTING_HELPERS.done();
}
main();