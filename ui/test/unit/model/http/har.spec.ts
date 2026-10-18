import { expect } from '../../../test-setup';

import { generateHar } from '../../../../src/model/http/har';
import { getExchangeData } from '../../unit-test-helpers';

describe('HAR generation', () => {
    it('orders entries chronologically regardless of selection order', async () => {
        const olderExchange = getExchangeData({ statusCode: 403 });
        olderExchange.timingEvents.startTime = Date.parse('2026-07-17T20:35:23.997+01:00');

        const newerExchange = getExchangeData({ statusCode: 200 });
        newerExchange.timingEvents.startTime = Date.parse('2026-07-17T20:36:12.733+01:00');

        const har = await generateHar([newerExchange, olderExchange]);

        expect(har.log.entries.map(entry => entry.response.status))
            .to.deep.equal([403, 200]);
    });
});
