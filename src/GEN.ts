/* Dit bestand is automatisch gegenereerd door Tonpleun. Wijzigingen hierin worden overschreven. */

import { getService } from './clientLib.js';

// Services for client: testClient
// echo
export async function echo(arg0: string): Promise<any> {
    return await getService('echo', 'testClient', [arg0]);
}

// Services for client: Client2
