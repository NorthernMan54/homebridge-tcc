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

    // Enable config based DEBUG logging enable
    this.debug = config['debug'] || false;
    if (this.debug) {
      debug.enabled = true;
    }

    api.on('didFinishLaunching', () => this.didFinishLaunching());
  }

  didFinishLaunching() {
    this.log("didFinishLaunching");

    this.thermostats = new Tcc(this);
    this.thermostats.pollThermostat().then((devices) => {
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
    });
    this.pollInterval = setInterval(() => this.pollDevices(), this.refresh * 1000);
  }

  configureAccessory(accessory) {
    this.log("configureAccessory %s", accessory.displayName);

    if (accessory.getService(Service.Thermostat)) {
      accessory.log = this.log;
      accessory
        .getService(Service.Thermostat)
        .getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .on('set', setTargetHeatingCooling.bind(accessory));

      accessory
        .getService(Service.Thermostat)
        .getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .on('set', setCoolingThresholdTemperature.bind(accessory));

      // this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
      accessory
        .getService(Service.Thermostat)
        .getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .on('set', setHeatingThresholdTemperature.bind(accessory));

      accessory
        .getService(Service.Thermostat)
        .getCharacteristic(Characteristic.TargetTemperature)
        .on('set', setTargetTemperature.bind(accessory));
      //  }
      debug("FakeGatoHistoryService", this.storage, this.refresh);
      accessory.context.logEventCounter = 9; // Update fakegato on startup
      accessory.loggingService = new FakeGatoHistoryService("thermo", accessory, {
        storage: this.storage,
        minutes: this.refresh * 10 / 60
      });

      // only attach this to the actual thermostat accessories, not the sensors accessory
      accessory.context.ChangeThermostat = new ChangeThermostat(accessory, this.thermostats);
      debug("configureAccessory", accessory.context.ChangeThermostat);
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
    }

    this.myAccessories.push(accessory);
  }

  pollDevices() {
    this.thermostats.pollThermostat().then((devices) => {
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
    });
  }

  updateStatus(accessory, device) {
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
    if (accessory.displayName === "Outside Sensors") {
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
      service.getCharacteristic(Characteristic.TargetTemperature)
        .updateValue(device.TargetTemperature);
      service.getCharacteristic(Characteristic.CurrentTemperature)
        .updateValue(device.CurrentTemperature);
      service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .updateValue(device.CurrentHeatingCoolingState);
      service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .updateValue(device.TargetHeatingCoolingState);
      if (device.device.UI.CanSetSwitchAuto) {
        service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
          .updateValue(device.CoolingThresholdTemperature);
        service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
          .updateValue(device.HeatingThresholdTemperature);
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
          });
      }

      if (createInsideHumiditySensors) {
        debug("TccAccessory() " + this.name + " insideHumidity = true, existing sensor");
        this.InsideHumidityService = this.accessory.addService(Service.HumiditySensor, this.name + " Humidity", "Inside");
        this.InsideHumidityService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity);
      }

      //       .setProps({validValues: hbValues.TargetHeatingCoolingStateValidValues})
      this.accessory
        .getService(Service.Thermostat)
        .getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .setProps({
          validValues: device.TargetHeatingCoolingStateValidValues
        })
        .on('set', setTargetHeatingCooling.bind(this.accessory));

      this.accessory
        .getService(Service.Thermostat)
        .getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          minValue: -100, // If you need this, you have major problems!!!!!
          maxValue: 100
        });

      this.accessory
        .getService(Service.Thermostat)
        .getCharacteristic(Characteristic.TargetTemperature)
        .setProps({
          minValue: parseFloat(device.TargetTemperatureHeatMinValue),
          maxValue: parseFloat(device.TargetTemperatureCoolMaxValue)
        })
        .on('set', setTargetTemperature.bind(this.accessory));

      if (device.device.UI.CanSetSwitchAuto) {
        // Only available on models with an Auto Mode
        this.accessory
          .getService(Service.Thermostat)
          .getCharacteristic(Characteristic.CoolingThresholdTemperature)
          .setProps({
            minValue: parseFloat(device.TargetTemperatureCoolMinValue),
            maxValue: parseFloat(device.TargetTemperatureCoolMaxValue)
          })
          .on('set', setCoolingThresholdTemperature.bind(this.accessory));

        // this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
        this.accessory
          .getService(Service.Thermostat)
          .getCharacteristic(Characteristic.HeatingThresholdTemperature)
          .setProps({
            minValue: parseFloat(device.TargetTemperatureHeatMinValue),
            maxValue: parseFloat(device.TargetTemperatureHeatMaxValue)
          })
          .on('set', setHeatingThresholdTemperature.bind(this.accessory));
      }

      this.accessory
        .getService(Service.Thermostat).log = this.log;

      this.accessory.loggingService = new FakeGatoHistoryService("thermo", this.accessory, {
        storage: this.storage,
        minutes: this.refresh * 10 / 60
      });

      this.accessory
        .getService(Service.Thermostat).addCharacteristic(CustomCharacteristics.ValvePosition);
      this.accessory.context.ChangeThermostat = new ChangeThermostat(this.accessory, platform.thermostats);
      platform.api.registerPlatformAccessories("homebridge-tcc", "tcc", [this.accessory]);
      platform.myAccessories.push(this.accessory);
      return this.accessory;
    } else {
      this.log("Existing TCC accessory (deviceID=" + this.ThermostatID + ")", this.name);
      // need to check if accessory/zone/thermostat already exists, but user added temp/humidity sensors then must declare
      this.accessory = platform.getAccessoryByName(this.name);
      debug("Heating Threshold", this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.HeatingThresholdTemperature).props);
      debug("Cooling Threshold", this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.CoolingThresholdTemperature).props);
      if (createInsideTemperatureSensors && !this.accessory.getService(this.name + " Temperature")) {
        debug("TccAccessory() " + this.name + " InsideTemperature = true, adding sensor");
        this.InsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, this.name + " Temperature", "Inside");

        this.InsideTemperatureService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .setProps({
            minValue: -100, // If you need this, you have major problems!!!!!
            maxValue: 100
          });
      } else if (!createInsideTemperatureSensors && this.accessory.getService(this.name + " Temperature")) {
        this.accessory.removeService(this.accessory.getService(this.name + " Temperature"));
      }
      if (createInsideHumiditySensors && !this.accessory.getService(this.name + " Humidity")) {
        debug("TccAccessory() " + this.name + " InsideHumidity = true, adding sensor");
        this.InsideHumidityService = this.accessory.addService(Service.HumiditySensor, this.name + " Humidity", "Inside");

        this.InsideHumidityService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity);
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
        });

      // Check for invalid humidity value
      if (this.device.OutsideHumidity === 128) {
        debug("Invalid outside humidity value for", this.device.Name + "(" + this.device.ThermostatID + ")");
      } else {
        // create outside humidity sensor
        debug("TccSensorsAccessory() " + this.name + " outsideHumidity = true, existing sensor");
        this.OutsideHumidityService = this.accessory.addService(Service.HumiditySensor, "Outside Humidity", "Outside");
        this.OutsideHumidityService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity);

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
      if (!this.accessory.getService("Outside Temperature")) {
        debug("TccSensorsAccessory() " + this.name + " OutsideTemperature = true, adding sensor");
        this.OutsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, "Outside Temperature", "Outside");

        this.OutsideTemperatureService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .setProps({
            minValue: -100, // If you need this, you have major problems!!!!!
            maxValue: 100
          });
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
            .getCharacteristic(Characteristic.CurrentRelativeHumidity);
        }
      }
      return this.accessory;
    }
  }
}

function setTargetTemperature(value, callback) {
  this.log("Setting target temperature for", this.displayName, "to", value + "°");
  this.context.logEventCounter = 9;
  this.context.ChangeThermostat.put({
    TargetTemperature: value
  }).then(() => {
    callback(null);
  }).catch((error) => {
    callback(error);
  });
}

function setTargetHeatingCooling(value, callback) {
  this.log("Setting switch for", this.displayName, "to", value);
  this.context.logEventCounter = 9;
  this.context.ChangeThermostat.put({
    TargetHeatingCooling: value
  }).then(() => {
    callback(null);
  }).catch((error) => {
    callback(error);
  });
}

function setHeatingThresholdTemperature(value, callback) {
  this.log("Setting HeatingThresholdTemperature for", this.displayName, "to", value);
  this.context.ChangeThermostat.put({
    HeatingThresholdTemperature: value
  }).then(() => {
    callback(null);
  }).catch((error) => {
    callback(error);
  });
}

function setCoolingThresholdTemperature(value, callback) {
  this.log("Setting CoolingThresholdTemperature for", this.displayName, "to", value);
  this.context.ChangeThermostat.put({
    CoolingThresholdTemperature: value
  }).then(() => {
    callback(null);
  }).catch((error) => {
    callback(error);
  });
}

// Consolidate change requests received over 100ms into a single request
class ChangeThermostat {
  constructor(accessory, thermostatsInstance) {
    this.desiredState = {};
    this.deferrals = [];
    this.ThermostatID = accessory.context.ThermostatID;
    this.waitTimeUpdate = 100; // wait 100ms before processing change
    this.thermostats = thermostatsInstance;
  }

  put(state) {
    debug("put %s ->", this.ThermostatID, state);
    return new Promise((resolve, reject) => {
      this.desiredState.ThermostatID = this.ThermostatID;
      for (const key in state) {
        this.desiredState[key] = state[key];
      }
      const d = { resolve, reject };
      this.deferrals.push(d);

      if (!this.timeout) {
        this.timeout = setTimeout(() => {
          this.thermostats.ChangeThermostat(this.desiredState).then((thermostat) => {
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


