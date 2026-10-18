import { Operation } from '../api-types';
import { RulesStore } from '../../../model/rules/rules-store';
import {
    HtkRule,
    RulePriority,
    isHttpBasedRule,
    isWebSocketRule
} from '../../../model/rules/rules';
import {
    findItem,
    isRuleGroup,
    isRuleRoot,
    HtkRuleItem
} from '../../../model/rules/rules-structure';
import { summarizeMatcher, summarizeSteps } from '../../../model/rules/rule-descriptions';

export function registerRuleOperations(
    registry: { register(op: Operation): void },
    rulesStore: RulesStore
): void {
    registry.register(rulesListOperation(rulesStore));

    registry.register(ruleActivationOperation(rulesStore, true,
        'Activate a rule, or every rule within a group, so that it applies to matching traffic ' +
        'again. This takes effect immediately, without requiring the rules to be saved in the UI.'
    ));

    registry.register(ruleActivationOperation(rulesStore, false,
        'Deactivate a rule, or every rule within a group, so that it no longer affects any ' +
        'traffic. Deactivated rules stay configured and can be reactivated later with ' +
        'rules.activate. This takes effect immediately, without requiring the rules to be ' +
        'saved in the UI.'
    ));
}

// WebRTC rules are matched by MockRTC, which has no equivalent priority concept:
function getEffectivePriority(rule: HtkRule): number | undefined {
    if (!isHttpBasedRule(rule) && !isWebSocketRule(rule)) return undefined;
    return rule.priority ?? RulePriority.DEFAULT;
}

function summarizeRuleItems(items: ReadonlyArray<HtkRuleItem>): unknown[] {
    return items.map((item) => isRuleGroup(item)
        ? {
            id: item.id,
            title: item.title,
            rules: summarizeRuleItems(item.items)
        }
        : {
            id: item.id,
            type: item.type,
            title: item.title,
            activated: item.activated,
            priority: getEffectivePriority(item),
            matches: summarizeMatcher(item),
            steps: summarizeSteps(item)
        }
    );
}

function rulesListOperation(rulesStore: RulesStore): Operation {
    return {
        definition: {
            name: 'rules.list',
            description: 'List the currently configured WireLens rules, which define how ' +
                'matching traffic is mocked, rewritten, breakpointed or otherwise modified. ' +
                'Rules are returned in their configured order, within their groups, and each is ' +
                'summarized rather than returning its full configuration.\n' +
                '\n' +
                'Note that this is not the order rules are matched in. Each request is matched ' +
                'against the highest priority rules first, and only falls through to lower ' +
                'priorities if none of them match. Within a single priority, rules are matched ' +
                'in the order returned here, and the first match wins.',
            category: 'rules',
            tiers: ['pro'],
            annotations: { readOnlyHint: true },
            inputSchema: {
                type: 'object',
                properties: {}
            },
            outputSchema: {
                type: 'object',
                properties: {
                    rules: {
                        type: 'array',
                        description: 'Rules and groups of rules, in their configured order',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                title: {
                                    type: 'string',
                                    description: 'The user-defined title of the rule or group, if it has one'
                                },
                                rules: {
                                    type: 'array',
                                    description: 'Present only on groups: the rules and nested ' +
                                        'groups within this group, in the same format as this list'
                                },
                                type: {
                                    type: 'string',
                                    description: 'Rules only: the rule protocol, e.g. "http" or "websocket"'
                                },
                                activated: {
                                    type: 'boolean',
                                    description: 'Rules only: whether the rule is currently enabled'
                                },
                                priority: {
                                    type: 'number',
                                    description: 'Rules only: the priority this rule is matched at. ' +
                                        'Higher priorities are matched first. 2 means high priority ' +
                                        '(matched before everything else), 1 is the default, and 0 ' +
                                        'means fallback (matched only once nothing else has matched). ' +
                                        'Omitted for WebRTC rules, which are matched separately.'
                                },
                                matches: {
                                    type: 'string',
                                    description: 'Rules only: human-readable summary of the traffic this rule matches'
                                },
                                steps: {
                                    type: 'string',
                                    description: 'Rules only: human-readable summary of what this rule does when matched'
                                }
                            }
                        }
                    },
                    unsavedChanges: {
                        type: 'boolean',
                        description: 'Whether the rules shown include edits that are not yet ' +
                            'saved in the UI, and so are not yet affecting live traffic'
                    }
                }
            }
        },
        handler: async () => {
            return {
                success: true,
                data: {
                    rules: summarizeRuleItems(rulesStore.draftRules.items),
                    unsavedChanges: rulesStore.areSomeRulesUnsaved
                }
            };
        }
    };
}

function ruleActivationOperation(
    rulesStore: RulesStore,
    activated: boolean,
    description: string
): Operation {
    const verb = activated ? 'activate' : 'deactivate';

    return {
        definition: {
            name: `rules.${verb}`,
            description,
            category: 'rules',
            tiers: ['pro'],
            annotations: { readOnlyHint: false, idempotentHint: true },
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: `The id of the rule or group to ${verb}, as returned by rules.list`
                    }
                },
                required: ['id']
            },
            outputSchema: {
                type: 'object',
                properties: {
                    rulesUpdated: {
                        type: 'number',
                        description: 'The number of rules this was applied to'
                    }
                }
            }
        },
        handler: async (params) => {
            const { id } = params;

            if (!id || typeof id !== 'string') {
                return {
                    success: false,
                    error: { code: 'INVALID_PARAMS', message: 'Missing required parameter: id' }
                };
            }

            // The rule may exist only in the drafts (if it's new) or only in the active rules
            // (if it's been deleted in the drafts, but that's not saved yet):
            const item = findItem(rulesStore.draftRules, { id })
                ?? findItem(rulesStore.rules, { id });

            // The root isn't exposed by rules.list, so we don't accept it here either. Guessing
            // it shouldn't be a way to accidentally deactivate every rule at once.
            if (!item || isRuleRoot(item)) {
                return {
                    success: false,
                    error: { code: 'NOT_FOUND', message: `No rule or group found with id: ${id}` }
                };
            }

            return {
                success: true,
                data: { rulesUpdated: rulesStore.setItemActivated(id, activated) }
            };
        }
    };
}
