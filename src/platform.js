'use strict';

/**
 * TCC Platform
 *
 * This is the main platform class that manages the plugin lifecycle,
 * coordinates accessories, and handles polling and updates.
 */

const { createLogger } = require('./lib/logger.js');
const moment = require('moment');
const Tcc = require('./lib/tcc.js').tcc;
const TccAccessory = require('./accessories/tccThermostatAccessory');
const TccSensorsAccessory = require('./accessories/tccSensorsAccessory');
const ChangeThermostat = require('./helpers/changeThermostat');
const { pruneUnsupportedServices, registerManagedService } = require('./helpers/serviceManager');
const {
  getTargetHeatingCooling,
  setTargetHeatingCooling,
  getCoolingThresholdTemperature,
  setCoolingThresholdTemperature,
  getHeatingThresholdTemperature,
  setHeatingThresholdTemperature,
  getTargetTemperature,
  setTargetTemperature,
  getCurrentTemperature,
  getCurrentHeatingCooling,
  getSensorTemperature,
  getSensorHumidity
} = require('./handlers/characteristicHandlers');

const PLUGIN_NAME = "homebridge-tcc";
const PLATFORM_NAME = "tcc";

class TccPlatform {
  constructor(log, config, api) {
    this.api = api;
    this.username = config['username'];
    this.password = config['password'];
    this.refresh = config['refresh'] || 600; // Lower than 10 minutes triggers request rate limiter on Honeywell site.
    this.usePermanentHolds = config['usePermanentHolds'] || false;
    this.log = log;
    this.logger = createLogger(log, {
      prefix: ['Platform'],
      debug: !!config['debug'],
      namespace: 'tcc'
    });
    this.sensors = config['sensors'];
    this.storage = config['storage'] || "fs";
    this.myAccessories = [];
    this.thermostats = null;
    this.outsideSensorsCreated = false;
    this.pollInterval = null;
    this.backgroundRefreshTimer = null;
    this.verificationPollTimeout = null; // For smart polling after changes
    // Use WeakMap to store ChangeThermostat instances (won't be serialized)
    this.changeThermostatMap = new WeakMap();
    this.refreshInFlight = null;
    this.backgroundRefresh = Object.prototype.hasOwnProperty.call(config, 'backgroundRefresh') ? config.backgroundRefresh : 180;
    if (this.backgroundRefresh === false) {
      this.backgroundRefresh = 0;
    }
    if (this.backgroundRefresh !== undefined && this.backgroundRefresh !== null) {
      this.backgroundRefresh = Number(this.backgroundRefresh);
      if (!Number.isFinite(this.backgroundRefresh) || this.backgroundRefresh <= 0) {
        this.backgroundRefresh = 0;
      } else {
        this.backgroundRefresh = Math.max(60, Math.floor(this.backgroundRefresh));
        if (this.backgroundRefresh >= this.refresh) {
          this.backgroundRefresh = 0; // Only useful when faster than primary poll
        }
      }
    } else {
      this.backgroundRefresh = 0;
    }

    // Enable config based DEBUG logging enable
    this.debug = !!config['debug'];
    if (this.debug) {
      this.logger.enableDebug();
      this.logger.debug('Debug logging enabled');
    } else {
      this.logger.debug('Debug logging available via `debug` namespace');
    }

    this.logger.info(
      'Initializing platform (refresh=%ss, backgroundRefresh=%s)',
      this.refresh,
      this.backgroundRefresh ? `${this.backgroundRefresh}s` : 'disabled'
    );

    api.on('didFinishLaunching', () => this.didFinishLaunching());
    api.on('shutdown', () => this.shutdown());
  }

  shutdown() {
    this.logger.debug('Shutting down platform, cleaning up resources');
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.backgroundRefreshTimer) {
      clearTimeout(this.backgroundRefreshTimer);
      this.backgroundRefreshTimer = null;
    }
    if (this.verificationPollTimeout) {
      clearTimeout(this.verificationPollTimeout);
      this.verificationPollTimeout = null;
    }
  }

  getChangeThermostat(accessory) {
    let changeThermostat = this.changeThermostatMap.get(accessory);
    const accessoryLogger = accessory.logger || this.logger.child(['Accessory', accessory.displayName]);
    if (!changeThermostat) {
      // Create new instance if not found (e.g., after restart)
      changeThermostat = new ChangeThermostat(accessory, this.thermostats, this);
      this.changeThermostatMap.set(accessory, changeThermostat);
      accessoryLogger.debug('Created new ChangeThermostat helper');
    } else if (changeThermostat.requiresThermostatBinding(this.thermostats)) {
      changeThermostat.setThermostatsInstance(this.thermostats);
      accessoryLogger.debug('Rebound ChangeThermostat helper to latest service instance');
    }
    return changeThermostat;
  }

  roundTemperature(value, step = 0.5) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return value;
    }
    if (!step || step <= 0) {
      return value;
    }
    const rounded = Math.round(value / step) * step;
    const precision = step < 1 ? 1 : 0;
    return parseFloat(rounded.toFixed(precision));
  }

  getTemperatureStepForDevice(device) {
    if (!device || !device.device || !device.device.UI) {
      return 0.5;
    }
    return (device.device.UI.DisplayedUnits === "C") ? 0.5 : 0.1;
  }

  normalizeCharacteristicValue(accessory, characteristic, rawValue) {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
      return rawValue;
    }
    const units = accessory.context.displayedUnits || 'C';
    let normalized;

    if (units === 'F') {
      const fahrenheitValue = (rawValue * 9 / 5) + 32;
      const roundedFahrenheit = Math.round(fahrenheitValue);
      normalized = parseFloat(((roundedFahrenheit - 32) * 5 / 9).toFixed(1));
    } else {
      const step = accessory.context.temperatureStep || characteristic.props.minStep || 0.5;
      normalized = this.roundTemperature(rawValue, step);
    }

    const minValue = typeof characteristic.props.minValue === 'number' ? characteristic.props.minValue : normalized;
    const maxValue = typeof characteristic.props.maxValue === 'number' ? characteristic.props.maxValue : normalized;
    const clamped = Math.min(maxValue, Math.max(minValue, normalized));
    const precision = (units === 'F' || (characteristic.props.minStep && characteristic.props.minStep < 1)) ? 1 : 0;
    return parseFloat(clamped.toFixed(precision));
  }

  scheduleVerificationPoll(delay = 30000) {
    // Clear any existing verification poll
    if (this.verificationPollTimeout) {
      clearTimeout(this.verificationPollTimeout);
    }

    this.logger.debug('Scheduling verification poll in %s seconds', delay / 1000);
    this.verificationPollTimeout = setTimeout(() => {
      this.logger.debug('Running verification poll after thermostat change');
      this.pollDevices().catch(err => {
        this.logger.error('Verification poll error: %s', err.message);
      });
      this.verificationPollTimeout = null;
    }, delay);
    this.ensureBackgroundRefresh();
  }

  didFinishLaunching() {
    this.logger.info('didFinishLaunching');

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;
    const Accessory = this.api.platformAccessory;
    const UUIDGen = this.api.hap.uuid;
    const homebridgeLib = require('homebridge-lib');
    const CustomCharacteristics = new homebridgeLib.EveHomeKitTypes(this.api).Characteristics;
    const FakeGatoHistoryService = require('fakegato-history')(this.api);

    this.thermostats = new Tcc(this);
    // Ensure cached ChangeThermostat instances pick up the new service
    this.myAccessories.forEach((accessory) => {
      const changeThermostat = this.changeThermostatMap.get(accessory);
      if (changeThermostat) {
        changeThermostat.setThermostatsInstance(this.thermostats);
      }
    });
    this.thermostats.pollThermostat().then((devices) => {
      if (!devices || !devices.hb) {
        this.logger.error('Invalid device data received from TCC');
        return;
      }
      for (const zone in devices.hb) {
        this.logger.debug('Creating accessory for %s (%s)', devices.hb[zone].Name, devices.hb[zone].ThermostatID);
        const thermostatAccessory = new TccAccessory(
          this,
          devices.hb[zone],
          this.sensors,
          Accessory,
          Service,
          Characteristic,
          UUIDGen,
          CustomCharacteristics,
          FakeGatoHistoryService
        );
        this.updateStatus(thermostatAccessory, devices.hb[zone]);

        const createOutsideSensors = (this.sensors === "all" || this.sensors === "outside");

        // does user want outside sensors created? if so, only create 1 set
        if (createOutsideSensors && !this.outsideSensorsCreated) {
          const outsideAccessory = new TccSensorsAccessory(
            this,
            devices.hb[zone],
            Accessory,
            Service,
            Characteristic,
            UUIDGen,
            FakeGatoHistoryService
          );
          this.updateStatus(outsideAccessory, devices.hb[zone]);
          this.outsideSensorsCreated = true;
        } else if (!createOutsideSensors) {
          const outsideAccessory = this.getAccessoryByName("Outside Sensors");

          if (outsideAccessory) {
            const outsideTempSensor = outsideAccessory.getService("Outside Temperature");

            if (outsideTempSensor) {
              outsideAccessory.removeService(outsideTempSensor);
            }

            const outsideHumiditySensor = outsideAccessory.getService("Outside Humidity");

            if (outsideHumiditySensor) {
              outsideAccessory.removeService(outsideHumiditySensor);
            }
          }
        }
      }
    }).catch((err) => {
      this.logger.error('Critical error during initialisation - no devices created');
      this.logger.error(err);
    }).finally(() => {
      this.startBackgroundRefresh();
    });
    this.pollInterval = setInterval(() => {
      this.pollDevices().catch(err => {
        this.logger.error('pollDevices interval error: %s', err.message);
      });
    }, this.refresh * 1000);
  }

  configureAccessory(accessory) {
    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;
    const accessoryLogger = this.logger.child(['Accessory', accessory.displayName]);
    accessory.logger = accessoryLogger;
    accessory.log = accessoryLogger.info.bind(accessoryLogger);
    accessoryLogger.info('Configuring cached accessory');

    const thermostatService = accessory.getService(Service.Thermostat);
    if (thermostatService) {
      registerManagedService(accessory, thermostatService);
    }
    const tempService = accessory.getService(accessory.displayName + " Temperature");
    if (tempService) {
      registerManagedService(accessory, tempService);
    }
    const humidityService = accessory.getService(accessory.displayName + " Humidity");
    if (humidityService) {
      registerManagedService(accessory, humidityService);
    }

    pruneUnsupportedServices(accessory, accessoryLogger, Service);

    if (thermostatService) {
      const legacyFanService = accessory.getService(Service.Fanv2) || accessory.getService(Service.Fan);
      if (legacyFanService) {
        accessoryLogger.info('Removing legacy fan service from cached accessory');
        accessory.removeService(legacyFanService);
      }
      registerManagedService(accessory, thermostatService);
      thermostatService
        .getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .on('get', getTargetHeatingCooling.bind(accessory))
        .on('set', setTargetHeatingCooling.bind(accessory));

      thermostatService
        .getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .on('get', getCoolingThresholdTemperature.bind(accessory))
        .on('set', setCoolingThresholdTemperature.bind(accessory));

      // this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
      thermostatService
        .getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .on('get', getHeatingThresholdTemperature.bind(accessory))
        .on('set', setHeatingThresholdTemperature.bind(accessory));

      thermostatService
        .getCharacteristic(Characteristic.TargetTemperature)
        .on('get', getTargetTemperature.bind(accessory))
        .on('set', setTargetTemperature.bind(accessory));

      thermostatService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', getCurrentTemperature.bind(accessory));

      thermostatService
        .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .on('get', getCurrentHeatingCooling.bind(accessory));
      //  }
      accessoryLogger.debug('Initialising FakeGato history (storage=%s, refresh=%ss)', this.storage, this.refresh * 10 / 60);
      accessory.context.logEventCounter = 9; // Update fakegato on startup
      const FakeGatoHistoryService = require('fakegato-history')(this.api);
      accessory.loggingService = new FakeGatoHistoryService("thermo", accessory, {
        storage: this.storage,
        minutes: this.refresh * 10 / 60
      });

      // only attach this to the actual thermostat accessories, not the sensors accessory
      // Store in WeakMap to avoid circular reference in serialization
      this.changeThermostatMap.set(accessory, new ChangeThermostat(accessory, this.thermostats, this));
      // Store platform reference (won't be serialized as it's a direct property, not in context)
      accessory.platform = this;
      accessoryLogger.debug('Created ChangeThermostat helper for cached accessory');

      const insideTempService = accessory.getService(accessory.displayName + " Temperature");
      if (insideTempService) {
        insideTempService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .on('get', getSensorTemperature.bind(accessory, 'CurrentTemperature'));
      }
      const insideHumidityService = accessory.getService(accessory.displayName + " Humidity");
      if (insideHumidityService) {
        insideHumidityService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .on('get', getSensorHumidity.bind(accessory, 'InsideHumidity'));
      }
    }

    // add fakegato logging for
    if (accessory.displayName === "Outside Sensors") {
      accessoryLogger.debug('Restoring outside sensor accessory context %o', accessory.context);
      accessoryLogger.debug('Initialising FakeGato history (storage=%s, refresh=%ss)', this.storage, this.refresh * 10 / 60);
      accessory.context.logEventCounter = 9; // Update fakegato on startup
      const FakeGatoHistoryService = require('fakegato-history')(this.api);
      accessory.loggingService = new FakeGatoHistoryService("weather", accessory, {
        storage: this.storage,
        minutes: this.refresh * 10 / 60
      });
      accessory.platform = this;
      const outsideTempService = accessory.getService("Outside Temperature");
      if (outsideTempService) {
        outsideTempService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .on('get', getSensorTemperature.bind(accessory, 'OutsideTemperature'));
      }
      const outsideHumidityService = accessory.getService("Outside Humidity");
      if (outsideHumidityService) {
        outsideHumidityService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .on('get', getSensorHumidity.bind(accessory, 'OutsideHumidity'));
      }
    } else if (!thermostatService) {
      accessory.platform = this;
    }

    this.myAccessories.push(accessory);
  }

  pollDevices() {
    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;
    return this.thermostats.pollThermostat().then((devices) => {
      this.myAccessories.forEach((accessory) => {
        const accessoryLogger = accessory.logger || this.logger.child(['Accessory', accessory.displayName]);
        accessoryLogger.debug('Processing poll response');
        if (devices.hb[accessory.context.ThermostatID]) {
          this.updateStatus(accessory, devices.hb[accessory.context.ThermostatID]);
        } else {
          accessoryLogger.warn('No data for accessory - marking state as unavailable');

          if (accessory.getService(Service.Thermostat)) {
            accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetTemperature)
              .updateValue(new Error("Status missing for thermostat"));
          }
        }
      });
      return devices;
    }).catch((err) => {
      if (err.message === 'Error: GetLocations InvalidSessionID') {
        // Silent - session will be refreshed on next poll
      } else if (err.message) {
        this.logger.warn('pollDevices: %s', err.message);
      } else {
        this.logger.error('pollDevices unexpected error', err);
      }
      this.myAccessories.forEach((accessory) => {
        if (accessory.getService(Service.Thermostat)) {
          accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetTemperature)
            .updateValue(new Error("Status missing for thermostat"));
        }
      });
      throw err;
    });
  }

  refreshAccessoryState(accessory) {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.pollDevices()
        .finally(() => {
          this.refreshInFlight = null;
        });
    }
    return this.refreshInFlight.then((devices) => {
      if (devices && devices.hb && devices.hb[accessory.context.ThermostatID]) {
        return devices.hb[accessory.context.ThermostatID];
      }
      throw new Error(`No state available for ${accessory.displayName || accessory.context.name}`);
    });
  }

  updateStatus(accessory, device) {
    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;
    if (!device) {
      this.logger.error('updateStatus called with null device for accessory: %s', accessory.displayName);
      return;
    }
    if (device.device && device.device.UI && device.device.UI.DisplayedUnits) {
      accessory.context.displayedUnits = device.device.UI.DisplayedUnits;
      accessory.context.temperatureStep = this.getTemperatureStepForDevice(device);
    }
    // Store the last physical heat mode preference (emergency heat vs regular heat)
    if (device.LastPhysicalHeatMode !== undefined) {
      accessory.context.lastPhysicalHeatMode = device.LastPhysicalHeatMode;
    }
    accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.Name)
      .updateValue(device.Name);
    accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.Model)
      .updateValue(device.Model);

    // check if user wants separate temperature and humidity sensors
    if (accessory.getService(device.Name + " Temperature")) {
      const InsideTemperature = accessory.getService(device.Name + " Temperature");
      InsideTemperature.getCharacteristic(Characteristic.CurrentTemperature)
        .updateValue(device.CurrentTemperature);
    }
    if (accessory.getService("Outside Temperature")) {
      const OutsideTemperature = accessory.getService("Outside Temperature");
      OutsideTemperature.getCharacteristic(Characteristic.CurrentTemperature)
        .updateValue(device.OutsideTemperature);
    }
    if (accessory.getService(device.Name + " Humidity")) {
      const InsideHumidity = accessory.getService(device.Name + " Humidity");
      InsideHumidity.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .updateValue(device.InsideHumidity);
    }
    if (accessory.getService("Outside Humidity")) {
      const OutsideHumidity = accessory.getService("Outside Humidity");
      OutsideHumidity.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .updateValue(device.OutsideHumidity);
    }

    // fakegato for outside sensor
    if (accessory.displayName === "Outside Sensors" && accessory.loggingService) {
      accessory.context.logEventCounter++;
      if (!(accessory.context.logEventCounter % 10)) {
        accessory.loggingService.addEntry({
          time: moment().unix(),
          humidity: device.OutsideHumidity,
          temp: device.OutsideTemperature,
          pressure: 0
        });
        accessory.context.logEventCounter = 0;
      }
    }

    // update thermostat
    if (accessory.getService(device.Name)) {
      const service = accessory.getService(Service.Thermostat);

      service.getCharacteristic(Characteristic.Name)
        .updateValue(device.Name);
      const targetCharacteristic = service.getCharacteristic(Characteristic.TargetTemperature);
      const normalizedTarget = this.normalizeCharacteristicValue(accessory, targetCharacteristic, device.TargetTemperature);
      targetCharacteristic.updateValue(normalizedTarget);
      service.getCharacteristic(Characteristic.CurrentTemperature)
        .updateValue(device.CurrentTemperature);
      const humidityChar = service.getCharacteristic(Characteristic.CurrentRelativeHumidity);
      if (humidityChar) {
        if (device.InsideHumidity === 128 || device.InsideHumidity === undefined || device.InsideHumidity === null) {
          humidityChar.updateValue(null);
        } else {
          humidityChar.updateValue(device.InsideHumidity);
        }
      }
      service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .updateValue(device.CurrentHeatingCoolingState);
      service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .updateValue(device.TargetHeatingCoolingState);
      if (device.device.UI.CanSetSwitchAuto) {
        const coolingChar = service.getCharacteristic(Characteristic.CoolingThresholdTemperature);
        if (coolingChar) {
          const normalizedCooling = this.normalizeCharacteristicValue(accessory, coolingChar, device.CoolingThresholdTemperature);
          coolingChar.updateValue(normalizedCooling);
        }
        const heatingChar = service.getCharacteristic(Characteristic.HeatingThresholdTemperature);
        if (heatingChar) {
          const normalizedHeating = this.normalizeCharacteristicValue(accessory, heatingChar, device.HeatingThresholdTemperature);
          heatingChar.updateValue(normalizedHeating);
        }
      }

      // Fakegato Support
      accessory.context.logEventCounter++;
      if (!(accessory.context.logEventCounter % 10)) {
        accessory.loggingService.addEntry({
          time: moment().unix(),
          currentTemp: device.CurrentTemperature,
          setTemp: device.TargetTemperature,
          valvePosition: device.CurrentHeatingCoolingState
        });
        accessory.context.logEventCounter = 0;
      }
    }
  }

  ensureBackgroundRefresh() {
    if (this.backgroundRefresh && !this.backgroundRefreshTimer) {
      this.startBackgroundRefresh();
    }
  }

  startBackgroundRefresh() {
    if (!this.backgroundRefresh || this.backgroundRefresh <= 0) {
      this.logger.debug('Background refresh disabled');
      return;
    }
    if (this.backgroundRefreshTimer) {
      return;
    }

    const runRefresh = () => {
      this.runBackgroundRefresh()
        .catch((err) => {
          this.logger.debug('Background refresh error: %s', err.message);
        })
        .finally(() => {
          if (this.backgroundRefreshTimer !== null) {
            this.backgroundRefreshTimer = setTimeout(runRefresh, this.backgroundRefresh * 1000);
          }
        });
    };

    this.logger.debug('Starting background refresh every %s seconds', this.backgroundRefresh);
    this.backgroundRefreshTimer = setTimeout(runRefresh, this.backgroundRefresh * 1000);
  }

  stopBackgroundRefresh() {
    if (this.backgroundRefreshTimer) {
      clearTimeout(this.backgroundRefreshTimer);
      this.backgroundRefreshTimer = null;
    }
  }

  runBackgroundRefresh() {
    if (!this.thermostats || this.myAccessories.length === 0) {
      return Promise.resolve();
    }
    const processed = new Set();
    const tasks = [];
    for (const accessory of this.myAccessories) {
      const thermostatId = accessory.context && accessory.context.ThermostatID;
      if (!thermostatId || processed.has(thermostatId)) {
        continue;
      }
      processed.add(thermostatId);
      const task = this.thermostats.getThermostatSnapshot(thermostatId)
        .then((thermostat) => {
          if (!thermostat) {
            return;
          }
          this.myAccessories
            .filter(acc => acc.context && acc.context.ThermostatID === thermostatId)
            .forEach(acc => this.updateStatus(acc, thermostat));
        })
        .catch((err) => {
          this.logger.debug('getThermostatSnapshot(%s) failed: %s', thermostatId, err.message);
        });
      tasks.push(task);
    }
    if (tasks.length === 0) {
      return Promise.resolve();
    }
    return Promise.allSettled(tasks);
  }

  getAccessoryByName(accessoryName) {
    return this.myAccessories.find(accessory => accessory.context.name === accessoryName);
  }
}

module.exports = {
  TccPlatform,
  PLUGIN_NAME,
  PLATFORM_NAME
};
