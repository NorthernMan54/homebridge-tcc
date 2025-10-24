/*jslint node: true */
'use strict';

const debug = require('debug')('tcc');
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

class TccPlatform {
  constructor(log, config, api) {
    this.api = api;
    this.username = config['username'];
    this.password = config['password'];
    this.refresh = config['refresh'] || 600; // Lower than 10 minutes triggers request rate limiter on Honeywell site.
    this.usePermanentHolds = config['usePermanentHolds'] || false;
    this.log = log;
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
    this.debug = config['debug'] || false;
    if (this.debug) {
      debug.enabled = true;
    }

    api.on('didFinishLaunching', () => this.didFinishLaunching());
    api.on('shutdown', () => this.shutdown());
  }

  shutdown() {
    debug("Shutting down platform, cleaning up resources");
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
    if (!changeThermostat) {
      // Create new instance if not found (e.g., after restart)
      changeThermostat = new ChangeThermostat(accessory, this.thermostats, this);
      this.changeThermostatMap.set(accessory, changeThermostat);
      debug("Created new ChangeThermostat instance for", accessory.displayName);
    } else if (changeThermostat.requiresThermostatBinding(this.thermostats)) {
      changeThermostat.setThermostatsInstance(this.thermostats);
      debug("Updated ChangeThermostat binding for", accessory.displayName);
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

    debug(`Scheduling verification poll in ${delay/1000} seconds`);
    this.verificationPollTimeout = setTimeout(() => {
      debug("Running verification poll after temperature change");
      this.pollDevices().catch(err => {
        this.log.error("Verification poll error:", err.message);
      });
      this.verificationPollTimeout = null;
    }, delay);
    this.ensureBackgroundRefresh();
  }

  didFinishLaunching() {
    this.log("didFinishLaunching");

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
        this.log.error("Invalid device data received from TCC");
        return;
      }
      for (const zone in devices.hb) {
        debug("Creating accessory for", devices.hb[zone].Name + "(" + devices.hb[zone].ThermostatID + ")");
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
      this.log("Critical Error - No devices created, please restart.");
      this.log.error(err);
    }).finally(() => {
      this.startBackgroundRefresh();
    });
    this.pollInterval = setInterval(() => {
      this.pollDevices().catch(err => {
        this.log.error("pollDevices interval error:", err.message);
      });
    }, this.refresh * 1000);
  }

  configureAccessory(accessory) {
    this.log("configureAccessory %s", accessory.displayName);

    const thermostatService = accessory.getService(Service.Thermostat);
    if (thermostatService) {
      accessory.log = this.log;
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
      debug("FakeGatoHistoryService", this.storage, this.refresh);
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
      debug("configureAccessory - created ChangeThermostat for", accessory.displayName);

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
      debug(accessory);
      debug("FakeGatoHistoryService", this.storage, this.refresh);
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
        debug("pollDevices - updateStatus", accessory.displayName);
        if (devices.hb[accessory.context.ThermostatID]) {
          this.updateStatus(accessory, devices.hb[accessory.context.ThermostatID]);
        } else {
          this.log("ERROR: no data for", accessory.displayName);

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
        this.log("pollDevices", err.message);
      } else {
        this.log("ERROR: pollDevices", err);
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
      this.log.error("updateStatus called with null device for accessory:", accessory.displayName);
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
      debug("Background refresh disabled");
      return;
    }
    if (this.backgroundRefreshTimer) {
      return;
    }

    const runRefresh = () => {
      this.runBackgroundRefresh()
        .catch((err) => {
          debug("Background refresh error:", err.message);
        })
        .finally(() => {
          if (this.backgroundRefreshTimer !== null) {
            this.backgroundRefreshTimer = setTimeout(runRefresh, this.backgroundRefresh * 1000);
          }
        });
    };

    debug("Starting background refresh every %s seconds", this.backgroundRefresh);
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
          debug("getThermostatSnapshot(%s) failed: %s", thermostatId, err.message);
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
    this.log = platform.log;
    this.platform = platform;
    this.name = device.Name;
    this.ThermostatID = device.ThermostatID;
    this.device = device;
    this.usePermanentHolds = platform.usePermanentHolds;
    this.storage = platform.storage;
   this.refresh = platform.refresh;
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
      debug("Invalid inside humidity value for", device.Name + "(" + device.ThermostatID + ")");
      createInsideHumiditySensors = false;
    }

    if (!platform.getAccessoryByName(this.name)) {
      this.log("Adding TCC Device (deviceID=" + this.ThermostatID + ")", this.name);
      this.accessory = new Accessory(this.name, uuid, 10);
      this.accessory.log = platform.log;
      this.accessory.context.ThermostatID = device.ThermostatID;
      this.accessory.context.name = this.name;
      this.accessory.context.logEventCounter = 9; // Update fakegato on startup
      this.accessory.context.temperatureStep = temperatureStep;
      this.accessory.context.displayedUnits = displayedUnits;
      this.accessory.platform = platform;

      this.accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, "TCC")
        .setCharacteristic(Characteristic.Model, device.Model)
        .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
        .setCharacteristic(Characteristic.FirmwareRevision, FirmwareRevision);

      this.accessory.addService(Service.Thermostat, this.name);

      // check if user wants separate temperature and humidity sensors by zone/thermostat
      debug("createInsideHumiditySensors: ", createInsideHumiditySensors);
      debug("createInsideTemperatureSensors: ", createInsideTemperatureSensors);
      if (createInsideTemperatureSensors) {
        // debug("TccAccessory() " + this.name + " InsideTemperature = true, existing sensor");
        this.InsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, this.name + " Temperature", "Inside");
        this.InsideTemperatureService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .setProps({
            minValue: -100, // If you need this, you have major problems!!!!!
            maxValue: 100
          })
          .on('get', getSensorTemperature.bind(this.accessory, 'CurrentTemperature'));
      }

      if (createInsideHumiditySensors) {
        debug("TccAccessory() " + this.name + " insideHumidity = true, existing sensor");
        this.InsideHumidityService = this.accessory.addService(Service.HumiditySensor, this.name + " Humidity", "Inside");
        this.InsideHumidityService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .on('get', getSensorHumidity.bind(this.accessory, 'InsideHumidity'));
      }

      //       .setProps({validValues: hbValues.TargetHeatingCoolingStateValidValues})
      const thermostatService = this.accessory.getService(Service.Thermostat);
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
        .getService(Service.Thermostat).log = this.log;

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
      this.log("Existing TCC accessory (deviceID=" + this.ThermostatID + ")", this.name);
      // need to check if accessory/zone/thermostat already exists, but user added temp/humidity sensors then must declare
      this.accessory = platform.getAccessoryByName(this.name);
      this.accessory.context.temperatureStep = temperatureStep;
      this.accessory.context.displayedUnits = displayedUnits;
      this.accessory.platform = platform;
      debug("Heating Threshold", this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.HeatingThresholdTemperature).props);
      debug("Cooling Threshold", this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.CoolingThresholdTemperature).props);
      const thermostatService = this.accessory.getService(Service.Thermostat);
      thermostatService.getCharacteristic(Characteristic.TargetTemperature).setProps({
        minValue: parseFloat(device.TargetTemperatureHeatMinValue),
        maxValue: parseFloat(device.TargetTemperatureCoolMaxValue),
        minStep: temperatureStep
      });
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
        debug("TccAccessory() " + this.name + " InsideTemperature = true, adding sensor");
        this.InsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, this.name + " Temperature", "Inside");

        this.InsideTemperatureService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .setProps({
            minValue: -100, // If you need this, you have major problems!!!!!
            maxValue: 100
          })
          .on('get', getSensorTemperature.bind(this.accessory, 'CurrentTemperature'));
      } else if (!createInsideTemperatureSensors && this.accessory.getService(this.name + " Temperature")) {
        this.accessory.removeService(this.accessory.getService(this.name + " Temperature"));
      }
      if (createInsideHumiditySensors && !this.accessory.getService(this.name + " Humidity")) {
        debug("TccAccessory() " + this.name + " InsideHumidity = true, adding sensor");
        this.InsideHumidityService = this.accessory.addService(Service.HumiditySensor, this.name + " Humidity", "Inside");

        this.InsideHumidityService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .on('get', getSensorHumidity.bind(this.accessory, 'InsideHumidity'));
      } else if (!createInsideHumiditySensors && this.accessory.getService(this.name + " Humidity")) {
        this.accessory.removeService(this.accessory.getService(this.name + " Humidity"));
      }
      return this.accessory;
    }
  }
}

class TccSensorsAccessory {
  constructor(platform, device) {
    this.log = platform.log;
    this.name = "Outside Sensors";
    this.ThermostatID = device.ThermostatID;
    this.device = device;
    this.storage = platform.storage;
    this.refresh = platform.refresh;
    const uuid = UUIDGen.generate(this.name + " - TCC");

    if (!platform.getAccessoryByName(this.name)) {
      this.log("Adding TCC Outside Sensors (deviceID=" + this.ThermostatID + ")", this.name);
      this.accessory = new Accessory(this.name, uuid, 10);
      this.accessory.log = platform.log;
      this.accessory.context.ThermostatID = device.ThermostatID;
      this.accessory.context.name = this.name;
      this.accessory.context.logEventCounter = 9; // Update fakegato on startup
      this.accessory.platform = platform;

      this.accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, "TCC")
        .setCharacteristic(Characteristic.Model, device.Model)
        .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
        .setCharacteristic(Characteristic.FirmwareRevision, FirmwareRevision);

      // create outside temp sensor
      debug("TccSensorsAccessory() " + this.name + " outsideTemperature = true, existing sensor");
      this.OutsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, "Outside Temperature", "Outside");
      this.OutsideTemperatureService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          minValue: -100, // If you need this, you have major problems!!!!!
          maxValue: 100
        })
        .on('get', getSensorTemperature.bind(this.accessory, 'OutsideTemperature'));

      // Check for invalid humidity value
      if (this.device.OutsideHumidity === 128) {
        debug("Invalid outside humidity value for", this.device.Name + "(" + this.device.ThermostatID + ")");
      } else {
        // create outside humidity sensor
        debug("TccSensorsAccessory() " + this.name + " outsideHumidity = true, existing sensor");
        this.OutsideHumidityService = this.accessory.addService(Service.HumiditySensor, "Outside Humidity", "Outside");
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
      this.log("Existing TCC outside sensors accessory (deviceID=" + this.ThermostatID + ")", this.name);

      // need to check if accessory/zone/thermostat already exists, but user added temp/humidity sensors then must declare
      this.accessory = platform.getAccessoryByName(this.name);
      this.accessory.platform = platform;
      if (!this.accessory.getService("Outside Temperature")) {
        debug("TccSensorsAccessory() " + this.name + " OutsideTemperature = true, adding sensor");
        this.OutsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, "Outside Temperature", "Outside");

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
        debug("Invalid outside humidity value for", this.device.Name + "(" + this.device.ThermostatID + ")");

        if (this.accessory.getService("Outside Humidity")) {
          this.accessory.removeService(this.accessory.getService("Outside Humidity"));
        }
      } else {
        if (!this.accessory.getService("Outside Humidity")) {
          debug("TccSensorsAccessory() " + this.name + " outsideHumidity = true, adding sensor");
          this.OutsideHumidityService = this.accessory.addService(Service.HumiditySensor, "Outside Humidity", "Outside");

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
  if (Math.abs(normalizedValue - value) > 0.05) {
    this.log("Adjusted target temperature for", this.displayName, "from", value + "°", "to", normalizedValue + "°");
  } else {
    this.log("Setting target temperature for", this.displayName, "to", normalizedValue + "°");
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
  this.log("Setting switch for", this.displayName, "to", value);
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
  if (Math.abs(normalizedValue - value) > 0.05) {
    this.log("Adjusted HeatingThresholdTemperature for", this.displayName, "from", value, "to", normalizedValue);
  } else {
    this.log("Setting HeatingThresholdTemperature for", this.displayName, "to", normalizedValue);
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
  if (Math.abs(normalizedValue - value) > 0.05) {
    this.log("Adjusted CoolingThresholdTemperature for", this.displayName, "from", value, "to", normalizedValue);
  } else {
    this.log("Setting CoolingThresholdTemperature for", this.displayName, "to", normalizedValue);
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
  }

  setThermostatsInstance(thermostatsInstance) {
    this.thermostats = thermostatsInstance;
  }

  requiresThermostatBinding(thermostatsInstance) {
    return thermostatsInstance && this.thermostats !== thermostatsInstance;
  }

  put(state) {
    debug("put %s ->", this.ThermostatID, state);
    return new Promise((resolve, reject) => {
      this.desiredState.ThermostatID = this.ThermostatID;
      for (const key in state) {
        this.desiredState[key] = state[key];
      }

      // Inject persisted LastPhysicalHeatMode from accessory context
      // This ensures preference survives Homebridge restarts
      if (this.accessory && this.accessory.context && this.accessory.context.lastPhysicalHeatMode !== undefined) {
        this.desiredState.LastPhysicalHeatMode = this.accessory.context.lastPhysicalHeatMode;
        debug("Injected persisted LastPhysicalHeatMode=%s from accessory context", this.accessory.context.lastPhysicalHeatMode);
      }

      const d = { resolve, reject };
      this.deferrals.push(d);

      if (!this.timeout) {
        this.timeout = setTimeout(() => {
          debug("ChangeThermostat executing with desiredState:", JSON.stringify(this.desiredState));
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
              debug("ChangeThermostat success - updating accessory with:", JSON.stringify({
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
