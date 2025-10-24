'use strict';

/**
 * ChangeThermostat Helper
 *
 * Consolidates change requests received over 100ms into a single request.
 * This prevents multiple rapid changes from flooding the TCC API.
 */
class ChangeThermostat {
  constructor(accessory, thermostatsInstance, platform) {
    this.desiredState = {};
    this.deferrals = [];
    this.ThermostatID = accessory.context.ThermostatID;
    this.waitTimeUpdate = 100; // wait 100ms before processing change
    this.thermostats = thermostatsInstance;
    this.platform = platform;
    this.accessory = accessory;
    this.logger = (accessory.logger || platform.logger.child(['Accessory', accessory.displayName])).child(['ChangeThermostat']);
  }

  setThermostatsInstance(thermostatsInstance) {
    this.thermostats = thermostatsInstance;
  }

  requiresThermostatBinding(thermostatsInstance) {
    return thermostatsInstance && this.thermostats !== thermostatsInstance;
  }

  put(state) {
    this.logger.debug('Queueing thermostat change: %o', state);
    return new Promise((resolve, reject) => {
      this.desiredState.ThermostatID = this.ThermostatID;
      for (const key in state) {
        this.desiredState[key] = state[key];
      }

      // Inject persisted LastPhysicalHeatMode from accessory context
      // This ensures preference survives Homebridge restarts
      if (this.accessory && this.accessory.context && this.accessory.context.lastPhysicalHeatMode !== undefined) {
        this.desiredState.LastPhysicalHeatMode = this.accessory.context.lastPhysicalHeatMode;
        this.logger.debug('Using persisted LastPhysicalHeatMode=%s from accessory context', this.accessory.context.lastPhysicalHeatMode);
      }

      const d = { resolve, reject };
      this.deferrals.push(d);

      if (!this.timeout) {
        this.timeout = setTimeout(() => {
          this.logger.debug('Executing thermostat change with payload %s', JSON.stringify(this.desiredState));
          if (!this.thermostats) {
            const error = new Error('Thermostat service not initialized yet. Please try again in a moment.');
            for (const deferral of this.deferrals) {
              deferral.reject(error);
            }
            this.desiredState = {};
            this.deferrals = [];
            this.timeout = null;
            return;
          }

          this.thermostats.ChangeThermostat(this.desiredState).then((thermostat) => {
            // Update the accessory with the new thermostat data immediately
            if (this.platform && this.accessory && thermostat) {
              this.logger.debug('ChangeThermostat success - updating accessory with %s', JSON.stringify({
                Name: thermostat.Name,
                TargetTemperature: thermostat.TargetTemperature,
                HeatingThresholdTemperature: thermostat.HeatingThresholdTemperature,
                CoolingThresholdTemperature: thermostat.CoolingThresholdTemperature,
                TargetHeatingCoolingState: thermostat.TargetHeatingCoolingState
              }));
              this.platform.updateStatus(this.accessory, thermostat);

              // Schedule verification poll 30 seconds after change
              this.platform.scheduleVerificationPoll(30000);
            }

            for (const deferral of this.deferrals) {
              deferral.resolve(thermostat);
            }
            this.desiredState = {};
            this.deferrals = [];
            this.timeout = null;
          }).catch((error) => {
            for (const deferral of this.deferrals) {
              deferral.reject(error);
            }
            this.desiredState = {};
            this.deferrals = [];
            this.timeout = null;
          });
        }, this.waitTimeUpdate);
      }
    });
  }
}

module.exports = ChangeThermostat;
