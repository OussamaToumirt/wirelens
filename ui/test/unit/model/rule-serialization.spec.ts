import { expect } from "../../test-setup";

import { RulesStore } from "../../../src/model/rules/rules-store";
import {
    serializeRules,
    deserializeRules
} from "../../../src/model/rules/rule-serialization";
import { HtkRuleRoot } from "../../../src/model/rules/rules-structure";

const buildRuleset = (...rules: any[]) => ({
    id: 'root',
    title: "HTTP Toolkit Rules",
    isRoot: true,
    items: rules
});

const aValidRule = (overrides: any = {}) => ({
    id: 'a-rule',
    type: 'http',
    activated: true,
    matchers: [{ type: 'wildcard' }],
    steps: [{ type: 'simple', status: 200 }],
    completionChecker: { type: 'always' },
    ...overrides
});

describe("Rule deserialization", () => {

    let store: RulesStore;

    beforeEach(() => {
        const proxyStore = {
            serverVersion: '1.0.0',
            dnsServers: [],
            httpProxyPort: 8000,
            ruleParameterKeys: []
        };
        store = new RulesStore({ featureFlags: [] } as any, proxyStore as any, null as any);
    });

    const deserialize = (data: any) => deserializeRules(data, { rulesStore: store });

    it("loads a valid rule", () => {
        const rules = deserialize(buildRuleset(aValidRule()));

        const rule = rules.items[0] as any;
        expect(rule.id).to.equal('a-rule');
        expect(rule.steps.length).to.equal(1);
        expect(rule.steps[0].status).to.equal(200);
    });

    it("loads rules nested within groups", () => {
        const rules = deserialize(buildRuleset({
            id: 'a-group',
            title: 'A group',
            items: [aValidRule()]
        }));

        const group = rules.items[0] as any;
        expect(group.items[0].id).to.equal('a-rule');
    });

    it("rejects a rule with an empty steps array", () => {
        expect(
            () => deserialize(buildRuleset(aValidRule({ steps: [] })))
        ).to.throw("Can't load rule with no steps: a-rule");
    });

    it("rejects a rule with no steps property at all", () => {
        const { steps, ...ruleWithoutSteps } = aValidRule();

        expect(
            () => deserialize(buildRuleset(ruleWithoutSteps))
        ).to.throw("Can't load rule with no steps: a-rule");
    });

    it("rejects a stepless rule nested within a group", () => {
        expect(() => deserialize(buildRuleset({
            id: 'a-group',
            title: 'A group',
            items: [aValidRule({ steps: [] })]
        }))).to.throw("Can't load rule with no steps: a-rule");
    });

    it("still loads pre-Mockttp-v4 rules that use a single handler", () => {
        const { steps, ...ruleWithoutSteps } = aValidRule();
        const rules = deserialize(buildRuleset({
            ...ruleWithoutSteps,
            handler: { type: 'simple', status: 404 }
        }));

        const rule = rules.items[0] as any;
        expect(rule.steps.length).to.equal(1);
        expect(rule.steps[0].status).to.equal(404);
    });

    it("round-trips serialized rules", () => {
        const rules = deserialize(buildRuleset(aValidRule()));

        const reloaded = deserialize(serializeRules(rules as HtkRuleRoot));

        const rule = reloaded.items[0] as any;
        expect(rule.id).to.equal('a-rule');
        expect(rule.steps[0].status).to.equal(200);
    });

});
