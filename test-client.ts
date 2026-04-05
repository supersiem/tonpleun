import { z } from 'zod';
import Tonpleun from './src/clientLib';

async function main() {
    const provider = new Tonpleun('provider');
    const consumer = new Tonpleun('consumer');

    const addArgsSchema = z.tuple([z.number(), z.number()]);

    await provider.registerService(
        'add',
        (a: number, b: number) => a + b,
        addArgsSchema
    );

    const ok = await consumer.getService('add', 'provider', [2, 3]);
    if (ok !== 5) {
        throw new Error(`Expected add result 5, got: ${JSON.stringify(ok)}`);
    }

    const bad = await consumer.getService('add', 'provider', ['2', 3]);
    const invalidInputDetected = typeof bad === 'object' && bad !== null && bad.error === 'Invalid service input';
    if (!invalidInputDetected) {
        throw new Error(`Expected invalid input error object, got: ${JSON.stringify(bad)}`);
    }

    console.log('test passed: valid call returns 5 and invalid call is rejected by zod schema.');
    // provider.TESTING_HELPERS.done();
    // provider.ws.close();
    // consumer.ws.close();
}

main().catch((err) => {
    console.error('test failed:', err);
    process.exitCode = 1;
});