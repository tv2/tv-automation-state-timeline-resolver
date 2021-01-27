"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const animate_1 = require("./animate");
class InternalTransitionHandler {
    constructor() {
        this._transitions = {};
    }
    terminate() {
        // clearInterval(this._interval)
        _.each(this._transitions, (_transition, identifier) => {
            this.clearTransition(identifier);
        });
    }
    getIdentifiers() {
        return Object.keys(this._transitions);
    }
    clearTransition(identifier) {
        const t = this._transitions[identifier];
        if (t) {
            this._stopTransition(t);
            delete this._transitions[identifier];
        }
    }
    stopAndSnapTransition(identifier, targetValues) {
        if (!this._transitions[identifier]) {
            this.initTransition(identifier, targetValues);
        }
        const t = this._transitions[identifier];
        this._stopTransition(t);
        t.values = targetValues;
    }
    initTransition(identifier, initialValues) {
        // Set initial values:
        this._transitions[identifier] = {
            values: initialValues,
            target: [],
            groups: [],
            activeIterator: null,
            lastUpdate: 0,
            calculatingGroups: {}
        };
    }
    activateTransition(identifier, initialValues, targetValues, groups, options, animatorTypes, updateCallback) {
        if (!this._transitions[identifier]) {
            this.initTransition(identifier, initialValues);
        }
        const t = this._transitions[identifier];
        t.updateCallback = updateCallback;
        t.groups = groups;
        t.target = targetValues;
        const getGroupValues = (values, groups, groupId) => {
            const vs = [];
            _.each(groups, (g, i) => {
                if (g === groupId)
                    vs.push(values[i]);
            });
            return vs;
        };
        const setGroupValues = (values, groups, groupId, newValues) => {
            let i2 = 0;
            _.each(groups, (g, i) => {
                if (g === groupId) {
                    values[i] = newValues[i2];
                    i2++;
                }
            });
        };
        if (!t.activeIterator) {
            _.each(_.uniq(t.groups), groupId => {
                if (!animatorTypes)
                    animatorTypes = {};
                const animatorType = animatorTypes[groupId + ''] || {};
                const options2 = animatorType.options || options;
                t.calculatingGroups[groupId + ''] = {
                    animator: (animatorType.type === 'physical' ?
                        new animate_1.PhysicalAcceleration(getGroupValues(t.values, groups, groupId), options2.acceleration || 0.0001, options2.maxSpeed || 0.05, options2.snapDistance || 1 / 1920) :
                        new animate_1.LinearMovement(getGroupValues(t.values, groups, groupId), options2.linearSpeed || 1 / 1000))
                };
            });
            const updateInterval = options.updateInterval || 1000 / 25;
            const update = () => {
                let dt = 0;
                if (t.lastUpdate) {
                    dt = Date.now() - t.lastUpdate;
                }
                else {
                    dt = updateInterval;
                }
                t.lastUpdate = Date.now();
                let somethingChanged = false;
                _.each(_.uniq(t.groups), groupId => {
                    const calculatingGroup = t.calculatingGroups[groupId + ''];
                    const values = getGroupValues(t.values, t.groups, groupId);
                    const targetValues = getGroupValues(t.target, t.groups, groupId);
                    const newValues = calculatingGroup.animator.update(targetValues, dt);
                    if (!_.isEqual(newValues, values)) {
                        somethingChanged = true;
                        setGroupValues(t.values, t.groups, groupId, newValues);
                    }
                });
                if (somethingChanged) {
                    // Send updateCommand:
                    if (t.updateCallback)
                        t.updateCallback(t.values);
                }
                else {
                    // nothing changed
                    this._stopTransition(t);
                }
            };
            // Start iterating:
            t.lastUpdate = 0;
            t.activeIterator = setInterval(update, updateInterval);
        }
    }
    _stopTransition(t) {
        if (t.activeIterator) {
            clearInterval(t.activeIterator);
            t.activeIterator = null;
        }
    }
}
exports.InternalTransitionHandler = InternalTransitionHandler;
//# sourceMappingURL=transitionHandler.js.map