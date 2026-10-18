import * as _ from 'lodash';
import { observable, action, flow, computed } from 'mobx';

import { lazyObservablePromise, observablePromise, ObservablePromise } from '../../util/observable';

import {
    User,
    SKU,
    SubscriptionPlans
} from '@httptoolkit/accounts';

// WireLens has no accounts, logins or billing: everything runs locally, and every
// feature is available. This store keeps the same public API as the upstream HTTP
// Toolkit account store, so the rest of the UI can use it unchanged.

const LOCAL_USER = {
    userId: 'local',
    email: undefined,
    subscription: undefined,
    teamSubscription: undefined,
    featureFlags: [] as string[],
    banned: false,
    isPaidUser: () => true,
    isPastDueUser: () => false,
    userHasSubscription: () => true
} as unknown as User;

export class AccountStore {

    constructor(
        _goToSettings: () => void
    ) {}

    readonly initialized = lazyObservablePromise(async () => {
        console.log('Account store initialized (local mode)');
    });

    @observable
    user: User = LOCAL_USER;

    @observable
    accountDataLastUpdated = Date.now();

    @observable
    isAccountUpdateInProcess = false;

    @computed get userEmail() {
        return this.user.email;
    }

    @computed get userSubscription() {
        return undefined;
    }

    get userJwt(): string {
        throw new Error('WireLens has no user accounts');
    }

    subscriptionPlans: ObservablePromise<SubscriptionPlans> =
        observablePromise(Promise.resolve(SubscriptionPlans));

    @computed get isLoggedIn() {
        return false;
    }

    @computed get featureFlags() {
        return _.clone(this.user.featureFlags);
    }

    @computed get mightBePaidUser() {
        return true;
    }

    @observable
    modal: 'login' | 'pick-a-plan' | 'post-checkout' | undefined;

    getPro = flow(function * (this: AccountStore, _source: string) {
        // Everything is already enabled - nothing to purchase.
    }.bind(this));

    logIn = flow(function * (this: AccountStore) {
        return false;
    }.bind(this));

    @action.bound
    cancelLogin() {
        this.modal = undefined;
    }

    finalizeLogin = flow(function* (this: AccountStore, _email: string) {
        this.modal = undefined;
    }).bind(this);

    @action.bound
    logOut() {}

    @action.bound
    setSelectedPlan(_plan: SKU | undefined) {
        this.modal = undefined;
    }

    @action.bound
    cancelCheckout() {
        this.modal = undefined;
    }

    get canManageSubscription() {
        return false;
    }

    cancelSubscription = flow(function * (this: AccountStore) {
        throw new Error('WireLens has no subscriptions');
    });

}
