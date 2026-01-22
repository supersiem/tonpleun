import { initializeClient, registerService, registerConfigItem, getConfigValue } from "../../../clientLib";


async function main() {
    await initializeClient('clientA');
    console.log('Client A is initialized and ready to use services.');
    await registerService('addNumbers', [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }], (a: number, b: number) => {
        if (getConfigValue('addNumbersMode') === 'double') {
            return (a + b) * 2;
        }
        return a + b;
    });
    console.log('Service addNumbers registered on Client A.');
    await registerConfigItem('addNumbers mode', 'Determines how addNumbers behaves', 'normal', 'addNumbersMode');
    console.log('Config item addNumbers mode registered on Client A.');
    // B sluit af als alles gelukt is
}
main();