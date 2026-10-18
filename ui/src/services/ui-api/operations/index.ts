import { OperationRegistry } from '../api-registry';
import { registerEventOperations } from './event-operations';
import { registerProxyOperations } from './proxy-operations';
import { registerInterceptorOperations } from './interceptor-operations';
import { registerRuleOperations } from './rule-operations';
import { CollectedEvent } from '../../../types';
import { EventsStore } from '../../../model/events/events-store';
import { ProxyStore } from '../../../model/proxy-store';
import { InterceptorStore } from '../../../model/interception/interceptor-store';
import { AccountStore } from '../../../model/account/account-store';
import { RulesStore } from '../../../model/rules/rules-store';

export function registerAllOperations(
    registry: OperationRegistry,
    stores: {
        eventsStore: EventsStore;
        proxyStore: ProxyStore;
        interceptorStore: InterceptorStore;
        accountStore: AccountStore;
        rulesStore: RulesStore;
    },
    getEvents: () => ReadonlyArray<CollectedEvent>
): void {
    const isPaidUser = () => stores.accountStore.user.isPaidUser();
    registerEventOperations(registry, stores.eventsStore, getEvents, isPaidUser);
    registerProxyOperations(registry, stores.proxyStore);
    registerInterceptorOperations(registry, stores.interceptorStore);
    // WireLens: no account operations (no upgrade flow).
    registerRuleOperations(registry, stores.rulesStore);
}
