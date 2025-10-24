/*jslint node: true */
'use strict';

const { createLogger } = require('./lib/logger.js');
const moment = require('moment');
const homebridgeLib = require('homebridge-lib');
const FirmwareRevision = require('../package.json').version;
const os = require("os");
const hostname = os.hostname();
const Tcc = require('./lib/tcc.js').tcc;

let Accessory, Service, Characteristic, UUIDGen, FakeGatoHistoryService, CustomCharacteristics;

const PLUGIN_NAME = "homebridge-tcc";
const PLATFORM_NAME = "tcc";

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  CustomCharacteristics = new homebridgeLib.EveHomeKitTypes(homebridge).Characteristics;
  FakeGatoHistoryService = require('fakegato-history')(homebridge);
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, TccPlatform);
};

function pruneUnsupportedServices(accessory, logger) {
  if (!accessory || !accessory.services) {
    return;
  }

  const managedList = accessory.context.managedServiceUUIDs || [];
  const managedSet = new Set(managedList);
  const fallbackAllowed = new Set([
    Service.Thermostat.UUID,
    Service.TemperatureSensor.UUID,
    Service.HumiditySensor.UUID
  ]);

  accessory.services
    .filter(service => service && service.UUID !== Service.AccessoryInformation.UUID)
    .forEach(service => {
      const isManaged = managedSet.has(service.UUID);
      const isFallbackAllowed = fallbackAllowed.has(service.UUID);
      if (!isManaged && !isFallbackAllowed) {
        if (logger && typeof logger.info === 'function') {
          logger.info('Removing unsupported service %s (%s)', service.displayName, service.UUID);
        }
        accessory.removeService(service);
      }
    });
}

function registerManagedService(accessory, service) {
  if (!accessory || !service) {
    return;
  }
  if (!Array.isArray(accessory.context.managedServiceUUIDs)) {
    accessory.context.managedServiceUUIDs = [];
  }
  if (!accessory.context.managedServiceUUIDs.includes(service.UUID)) {
    accessory.context.managedServiceUUIDs.push(service.UUID);
  }
}

function unregisterManagedService(accessory, service) {
  if (!accessory || !service || !Array.isArray(accessory.context.managedServiceUUIDs)) {
    return;
  }
  accessory.context.managedServiceUUIDs = accessory.context.managedServiceUUIDs
    .filter(uuid => uuid !== service.UUID);
}

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
        const thermostatAccessory = new TccAccessory(this, devices.hb[zone], this.sensors);
        this.updateStatus(thermostatAccessory, devices.hb[zone]);

        const createOutsideSensors = (this.sensors === "all" || this.sensors === "outside");

        // does user want outside sensors created? if so, only create 1 set
        if (createOutsideSensors && !this.outsideSensorsCreated) {
          const outsideAccessory = new TccSensorsAccessory(this, devices.hb[zone]);
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

    pruneUnsupportedServices(accessory, accessoryLogger);

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

class TccAccessory {
  constructor(platform, device, sensors) {
    this.platform = platform;
    this.name = device.Name;
    this.ThermostatID = device.ThermostatID;
    this.device = device;
    this.usePermanentHolds = platform.usePermanentHolds;
    this.storage = platform.storage;
   this.refresh = platform.refresh;
    this.logger = platform.logger.child(['Thermostat', this.name]);
    const uuid = UUIDGen.generate(this.name + " - TCC");
    const displayedUnits = (device && device.device && device.device.UI && device.device.UI.DisplayedUnits) || "C";
    const temperatureStep = platform.getTemperatureStepForDevice(device);
    let createInsideHumiditySensors = false;
    let createInsideTemperatureSensors = false;

    // need to get config for this thermostat id
    switch (sensors) {
      case "none":
        createInsideHumiditySensors = false;
        createInsideTemperatureSensors = false;
        break;
      case "all":
        createInsideHumiditySensors = true;
        createInsideTemperatureSensors = true;
        break;
      case "inside":
        createInsideHumiditySensors = true;
        createInsideTemperatureSensors = true;
        break;
      case "insideHumidity":
        createInsideHumiditySensors = true;
        createInsideTemperatureSensors = false;
        break;
      case "outside":
        createInsideHumiditySensors = false;
        createInsideTemperatureSensors = false;
        break;
    }

    // Check for invalid humidity value
    if (device.InsideHumidity === 128) {
      this.logger.debug('Invalid inside humidity value for %s (%s)', device.Name, device.ThermostatID);
      createInsideHumiditySensors = false;
    }

    if (!platform.getAccessoryByName(this.name)) {
      this.logger.info('Adding thermostat accessory (deviceID=%s)', this.ThermostatID);
      this.accessory = new Accessory(this.name, uuid, 10);
      this.accessory.logger = this.logger;
      this.accessory.log = this.logger.info.bind(this.logger);
      this.accessory.context.ThermostatID = device.ThermostatID;
      this.accessory.context.name = this.name;
      this.accessory.context.logEventCounter = 9; // Update fakegato on startup
      this.accessory.context.temperatureStep = temperatureStep;
      this.accessory.context.displayedUnits = displayedUnits;
      this.accessory.platform = platform;

      pruneUnsupportedServices(this.accessory, this.logger);

      this.accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, "TCC")
        .setCharacteristic(Characteristic.Model, device.Model)
        .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
        .setCharacteristic(Characteristic.FirmwareRevision, FirmwareRevision);

      const thermostatService = this.accessory.addService(Service.Thermostat, this.name);
      registerManagedService(this.accessory, thermostatService);

      // check if user wants separate temperature and humidity sensors by zone/thermostat
      this.logger.debug('createInsideHumiditySensors=%s', createInsideHumiditySensors);
      this.logger.debug('createInsideTemperatureSensors=%s', createInsideTemperatureSensors);
      if (createInsideTemperatureSensors) {
        // debug("TccAccessory() " + this.name + " InsideTemperature = true, existing sensor");
        this.InsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, this.name + " Temperature", "Inside");
        registerManagedService(this.accessory, this.InsideTemperatureService);
        this.InsideTemperatureService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .setProps({
            minValue: -100, // If you need this, you have major problems!!!!!
            maxValue: 100
          })
          .on('get', getSensorTemperature.bind(this.accessory, 'CurrentTemperature'));
      }

      if (createInsideHumiditySensors) {
        this.logger.debug('Configuring dedicated humidity sensor for %s', this.name);
        this.InsideHumidityService = this.accessory.addService(Service.HumiditySensor, this.name + " Humidity", "Inside");
        registerManagedService(this.accessory, this.InsideHumidityService);
        this.InsideHumidityService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .on('get', getSensorHumidity.bind(this.accessory, 'InsideHumidity'));
      }

      //       .setProps({validValues: hbValues.TargetHeatingCoolingStateValidValues})
      registerManagedService(this.accessory, thermostatService);
      thermostatService
        .getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .setProps({
          validValues: device.TargetHeatingCoolingStateValidValues
        })
        .on('get', getTargetHeatingCooling.bind(this.accessory))
        .on('set', setTargetHeatingCooling.bind(this.accessory));

      thermostatService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          minValue: -100, // If you need this, you have major problems!!!!!
          maxValue: 100
        })
        .on('get', getCurrentTemperature.bind(this.accessory));

      thermostatService
        .getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', getCurrentRelativeHumidity.bind(this.accessory));

      thermostatService
        .getCharacteristic(Characteristic.TargetTemperature)
        .setProps({
          minValue: parseFloat(device.TargetTemperatureHeatMinValue),
          maxValue: parseFloat(device.TargetTemperatureCoolMaxValue),
          minStep: temperatureStep
        })
        .on('get', getTargetTemperature.bind(this.accessory))
        .on('set', setTargetTemperature.bind(this.accessory));

      if (device.device.UI.CanSetSwitchAuto) {
        // Only available on models with an Auto Mode
        thermostatService
          .getCharacteristic(Characteristic.CoolingThresholdTemperature)
          .setProps({
            minValue: parseFloat(device.TargetTemperatureCoolMinValue),
            maxValue: parseFloat(device.TargetTemperatureCoolMaxValue),
            minStep: temperatureStep
          })
          .on('get', getCoolingThresholdTemperature.bind(this.accessory))
          .on('set', setCoolingThresholdTemperature.bind(this.accessory));

        // this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
        thermostatService
          .getCharacteristic(Characteristic.HeatingThresholdTemperature)
          .setProps({
            minValue: parseFloat(device.TargetTemperatureHeatMinValue),
            maxValue: parseFloat(device.TargetTemperatureHeatMaxValue),
            minStep: temperatureStep
          })
          .on('get', getHeatingThresholdTemperature.bind(this.accessory))
          .on('set', setHeatingThresholdTemperature.bind(this.accessory));
      }

      thermostatService
        .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .on('get', getCurrentHeatingCooling.bind(this.accessory));

      this.accessory
        .getService(Service.Thermostat).log = this.logger.info.bind(this.logger);

      this.accessory.loggingService = new FakeGatoHistoryService("thermo", this.accessory, {
        storage: this.storage,
        minutes: this.refresh * 10 / 60
      });

      this.accessory
        .getService(Service.Thermostat).addCharacteristic(CustomCharacteristics.ValvePosition);
      // Store in WeakMap to avoid circular reference in serialization
      platform.changeThermostatMap.set(this.accessory, new ChangeThermostat(this.accessory, platform.thermostats, platform));
      platform.api.registerPlatformAccessories("homebridge-tcc", "tcc", [this.accessory]);
      platform.myAccessories.push(this.accessory);
      return this.accessory;
    } else {
      this.logger.info('Restoring thermostat accessory (deviceID=%s)', this.ThermostatID);
      // need to check if accessory/zone/thermostat already exists, but user added temp/humidity sensors then must declare
      this.accessory = platform.getAccessoryByName(this.name);
      this.accessory.logger = this.logger;
      this.accessory.log = this.logger.info.bind(this.logger);
      this.accessory.context.temperatureStep = temperatureStep;
      this.accessory.context.displayedUnits = displayedUnits;
      this.accessory.platform = platform;
      pruneUnsupportedServices(this.accessory, this.logger);
      this.logger.debug('Heating threshold props: %o', this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.HeatingThresholdTemperature).props);
      this.logger.debug('Cooling threshold props: %o', this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.CoolingThresholdTemperature).props);
      const thermostatService = this.accessory.getService(Service.Thermostat);
      thermostatService.getCharacteristic(Characteristic.TargetTemperature).setProps({
        minValue: parseFloat(device.TargetTemperatureHeatMinValue),
        maxValue: parseFloat(device.TargetTemperatureCoolMaxValue),
        minStep: temperatureStep
      });
      thermostatService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', getCurrentRelativeHumidity.bind(this.accessory));
      if (device.device.UI.CanSetSwitchAuto) {
        const coolingChar = thermostatService.getCharacteristic(Characteristic.CoolingThresholdTemperature);
        if (coolingChar) {
          coolingChar.setProps({
            minValue: parseFloat(device.TargetTemperatureCoolMinValue),
            maxValue: parseFloat(device.TargetTemperatureCoolMaxValue),
            minStep: temperatureStep
          });
        }
        const heatingChar = thermostatService.getCharacteristic(Characteristic.HeatingThresholdTemperature);
        if (heatingChar) {
          heatingChar.setProps({
            minValue: parseFloat(device.TargetTemperatureHeatMinValue),
            maxValue: parseFloat(device.TargetTemperatureHeatMaxValue),
            minStep: temperatureStep
          });
        }
      }
      if (createInsideTemperatureSensors && !this.accessory.getService(this.name + " Temperature")) {
        this.logger.debug('Adding dedicated temperature sensor for %s', this.name);
        this.InsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, this.name + " Temperature", "Inside");
        registerManagedService(this.accessory, this.InsideTemperatureService);

        this.InsideTemperatureService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .setProps({
            minValue: -100, // If you need this, you have major problems!!!!!
            maxValue: 100
          })
          .on('get', getSensorTemperature.bind(this.accessory, 'CurrentTemperature'));
      } else if (!createInsideTemperatureSensors && this.accessory.getService(this.name + " Temperature")) {
        const tempService = this.accessory.getService(this.name + " Temperature");
        unregisterManagedService(this.accessory, tempService);
        this.accessory.removeService(tempService);
      }
      if (createInsideHumiditySensors && !this.accessory.getService(this.name + " Humidity")) {
        this.logger.debug('Adding dedicated humidity sensor for %s', this.name);
        this.InsideHumidityService = this.accessory.addService(Service.HumiditySensor, this.name + " Humidity", "Inside");
        registerManagedService(this.accessory, this.InsideHumidityService);

        this.InsideHumidityService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .on('get', getSensorHumidity.bind(this.accessory, 'InsideHumidity'));
      } else if (!createInsideHumiditySensors && this.accessory.getService(this.name + " Humidity")) {
        const humidityService = this.accessory.getService(this.name + " Humidity");
        unregisterManagedService(this.accessory, humidityService);
        this.accessory.removeService(humidityService);
      }
      return this.accessory;
    }
  }
}

class TccSensorsAccessory {
  constructor(platform, device) {
    this.platform = platform;
    this.logger = platform.logger.child(['Outside', device.Name || 'Sensors']);
    this.name = "Outside Sensors";
    this.ThermostatID = device.ThermostatID;
    this.device = device;
    this.storage = platform.storage;
    this.refresh = platform.refresh;
    const uuid = UUIDGen.generate(this.name + " - TCC");

    if (!platform.getAccessoryByName(this.name)) {
      this.logger.info('Adding outside sensors accessory (deviceID=%s)', this.ThermostatID);
      this.accessory = new Accessory(this.name, uuid, 10);
      this.accessory.logger = this.logger;
      this.accessory.log = this.logger.info.bind(this.logger);
      this.accessory.context.ThermostatID = device.ThermostatID;
      this.accessory.context.name = this.name;
      this.accessory.context.logEventCounter = 9; // Update fakegato on startup
      this.accessory.platform = platform;

      pruneUnsupportedServices(this.accessory, this.logger);

      this.accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, "TCC")
        .setCharacteristic(Characteristic.Model, device.Model)
        .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
        .setCharacteristic(Characteristic.FirmwareRevision, FirmwareRevision);

      // create outside temp sensor
      this.logger.debug('Configuring outside temperature sensor for %s', this.name);
      this.OutsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, "Outside Temperature", "Outside");
      registerManagedService(this.accessory, this.OutsideTemperatureService);
      this.OutsideTemperatureService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          minValue: -100, // If you need this, you have major problems!!!!!
          maxValue: 100
        })
        .on('get', getSensorTemperature.bind(this.accessory, 'OutsideTemperature'));

      // Check for invalid humidity value
      if (this.device.OutsideHumidity === 128) {
        this.logger.debug('Invalid outside humidity value for %s (%s)', this.device.Name, this.device.ThermostatID);
      } else {
        // create outside humidity sensor
        this.logger.debug('Configuring outside humidity sensor for %s', this.name);
        this.OutsideHumidityService = this.accessory.addService(Service.HumiditySensor, "Outside Humidity", "Outside");
        registerManagedService(this.accessory, this.OutsideHumidityService);
        this.OutsideHumidityService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .on('get', getSensorHumidity.bind(this.accessory, 'OutsideHumidity'));

        this.accessory.loggingService = new FakeGatoHistoryService("weather", this.accessory, {
          storage: this.storage,
          minutes: this.refresh * 10 / 60
        });
      }

      platform.api.registerPlatformAccessories("homebridge-tcc", "tcc", [this.accessory]);
      platform.myAccessories.push(this.accessory);
      return this.accessory;
    } else {
      this.logger.info('Restoring outside sensors accessory (deviceID=%s)', this.ThermostatID);

      // need to check if accessory/zone/thermostat already exists, but user added temp/humidity sensors then must declare
      this.accessory = platform.getAccessoryByName(this.name);
      this.accessory.logger = this.logger;
      this.accessory.log = this.logger.info.bind(this.logger);
      this.accessory.platform = platform;
      pruneUnsupportedServices(this.accessory, this.logger);
      if (!this.accessory.getService("Outside Temperature")) {
        this.logger.debug('Adding outside temperature sensor service');
        this.OutsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, "Outside Temperature", "Outside");
        registerManagedService(this.accessory, this.OutsideTemperatureService);

        this.OutsideTemperatureService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .setProps({
            minValue: -100, // If you need this, you have major problems!!!!!
            maxValue: 100
          })
          .on('get', getSensorTemperature.bind(this.accessory, 'OutsideTemperature'));
      }

      // Check for invalid humidity value
      if (this.device.OutsideHumidity === 128) {
        this.logger.debug('Invalid outside humidity value for %s (%s)', this.device.Name, this.device.ThermostatID);

        if (this.accessory.getService("Outside Humidity")) {
          const humiditySvc = this.accessory.getService("Outside Humidity");
          unregisterManagedService(this.accessory, humiditySvc);
          this.accessory.removeService(humiditySvc);
        }
      } else {
        if (!this.accessory.getService("Outside Humidity")) {
          this.logger.debug('Adding outside humidity sensor service');
          this.OutsideHumidityService = this.accessory.addService(Service.HumiditySensor, "Outside Humidity", "Outside");
          registerManagedService(this.accessory, this.OutsideHumidityService);

          this.OutsideHumidityService
            .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .on('get', getSensorHumidity.bind(this.accessory, 'OutsideHumidity'));
        }
      }
      return this.accessory;
    }
  }
}

function handleRefreshError(callback, error) {
  callback(error instanceof Error ? error : new Error(error));
}

function getTargetTemperature(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const service = this.getService(Service.Thermostat);
    const characteristic = service.getCharacteristic(Characteristic.TargetTemperature);
    const value = this.platform.normalizeCharacteristicValue(this, characteristic, device.TargetTemperature);
    callback(null, value);
  }).catch((error) => handleRefreshError(callback, error));
}

function getCurrentTemperature(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const value = device.CurrentTemperature;
    callback(null, value === undefined ? null : value);
  }).catch((error) => handleRefreshError(callback, error));
}

function getCurrentRelativeHumidity(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const value = device.InsideHumidity;
    if (value === undefined || value === null || value === 128) {
      callback(null, null);
    } else {
      callback(null, value);
    }
  }).catch((error) => handleRefreshError(callback, error));
}

function getTargetHeatingCooling(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    callback(null, device.TargetHeatingCoolingState);
  }).catch((error) => handleRefreshError(callback, error));
}

function getCurrentHeatingCooling(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    callback(null, device.CurrentHeatingCoolingState);
  }).catch((error) => handleRefreshError(callback, error));
}

function getHeatingThresholdTemperature(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const service = this.getService(Service.Thermostat);
    const characteristic = service.getCharacteristic(Characteristic.HeatingThresholdTemperature);
    const value = this.platform.normalizeCharacteristicValue(this, characteristic, device.HeatingThresholdTemperature);
    callback(null, value);
  }).catch((error) => handleRefreshError(callback, error));
}

function getCoolingThresholdTemperature(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const service = this.getService(Service.Thermostat);
    const characteristic = service.getCharacteristic(Characteristic.CoolingThresholdTemperature);
    const value = this.platform.normalizeCharacteristicValue(this, characteristic, device.CoolingThresholdTemperature);
    callback(null, value);
  }).catch((error) => handleRefreshError(callback, error));
}

function getSensorTemperature(property, callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const value = device[property];
    callback(null, value === undefined ? null : value);
  }).catch((error) => handleRefreshError(callback, error));
}

function getSensorHumidity(property, callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const value = device[property];
    callback(null, value === undefined ? null : value);
  }).catch((error) => handleRefreshError(callback, error));
}

function setTargetTemperature(value, callback) {
  const service = this.getService(Service.Thermostat);
  const characteristic = service.getCharacteristic(Characteristic.TargetTemperature);
  const normalizedValue = this.platform.normalizeCharacteristicValue(this, characteristic, value);
  const logger = (this.logger && typeof this.logger.info === 'function') ? this.logger : (this.platform && this.platform.logger);
  if (Math.abs(normalizedValue - value) > 0.05) {
    if (logger) {
      logger.debug('Adjusted target temperature for %s from %s° to %s°', this.displayName, value, normalizedValue);
    }
  } else {
    if (logger) {
      logger.info('Setting target temperature for %s to %s°', this.displayName, normalizedValue);
    }
  }
  characteristic.updateValue(normalizedValue);
  this.context.logEventCounter = 9;
  const changeThermostat = this.platform.getChangeThermostat(this);
  changeThermostat.put({
    TargetTemperature: normalizedValue
  }).then(() => {
    callback(null);
  }).catch((error) => {
    callback(error);
  });
}

function setTargetHeatingCooling(value, callback) {
  const logger = (this.logger && typeof this.logger.info === 'function') ? this.logger : (this.platform && this.platform.logger);
  if (logger) {
    logger.info('Setting target heating/cooling state for %s to %s', this.displayName, value);
  }
  this.context.logEventCounter = 9;
  const changeThermostat = this.platform.getChangeThermostat(this);
  changeThermostat.put({
    TargetHeatingCooling: value
  }).then(() => {
    callback(null);
  }).catch((error) => {
    callback(error);
  });
}

function setHeatingThresholdTemperature(value, callback) {
  const service = this.getService(Service.Thermostat);
  const characteristic = service.getCharacteristic(Characteristic.HeatingThresholdTemperature);
  const normalizedValue = this.platform.normalizeCharacteristicValue(this, characteristic, value);
  const logger = (this.logger && typeof this.logger.info === 'function') ? this.logger : (this.platform && this.platform.logger);
  if (Math.abs(normalizedValue - value) > 0.05) {
    if (logger) {
      logger.debug('Adjusted heating threshold for %s from %s to %s', this.displayName, value, normalizedValue);
    }
  } else {
    if (logger) {
      logger.info('Setting heating threshold for %s to %s', this.displayName, normalizedValue);
    }
  }
  characteristic.updateValue(normalizedValue);
  const changeThermostat = this.platform.getChangeThermostat(this);
  changeThermostat.put({
    HeatingThresholdTemperature: normalizedValue
  }).then(() => {
    callback(null);
  }).catch((error) => {
    callback(error);
  });
}

function setCoolingThresholdTemperature(value, callback) {
  const service = this.getService(Service.Thermostat);
  const characteristic = service.getCharacteristic(Characteristic.CoolingThresholdTemperature);
  const normalizedValue = this.platform.normalizeCharacteristicValue(this, characteristic, value);
  const logger = (this.logger && typeof this.logger.info === 'function') ? this.logger : (this.platform && this.platform.logger);
  if (Math.abs(normalizedValue - value) > 0.05) {
    if (logger) {
      logger.debug('Adjusted cooling threshold for %s from %s to %s', this.displayName, value, normalizedValue);
    }
  } else {
    if (logger) {
      logger.info('Setting cooling threshold for %s to %s', this.displayName, normalizedValue);
    }
  }
  characteristic.updateValue(normalizedValue);
  const changeThermostat = this.platform.getChangeThermostat(this);
  changeThermostat.put({
    CoolingThresholdTemperature: normalizedValue
  }).then(() => {
    callback(null);
  }).catch((error) => {
    callback(error);
  });
}

// Consolidate change requests received over 100ms into a single request
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
