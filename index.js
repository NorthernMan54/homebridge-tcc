/*jslint node: true */
'use strict';

var debug = require('debug')('tcc');
var Accessory, Service, Characteristic, UUIDGen, FakeGatoHistoryService, CustomCharacteristic;
var os = require("os");
var hostname = os.hostname();
var Tcc = require('./lib/tcc.js').tcc;

var myAccessories = [];
var refresh, storage;
var thermostats;

module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  CustomCharacteristic = require('./lib/CustomCharacteristic.js')(homebridge);
  FakeGatoHistoryService = require('fakegato-history')(homebridge);

  // tcc.setCharacteristic(Characteristic);

  homebridge.registerPlatform("homebridge-tcc", "tcc", tccPlatform);
};

function tccPlatform(log, config, api) {
  this.username = config['username'];
  this.password = config['password'];
  this.refresh = config['refresh'] || 60; // Update every minute
  this.usePermanentHolds = config['usePermanentHolds'] || false;
  this.log = log;
  this.devices = config['devices'];
  storage = config['storage'] || "fs";

  if (api) {
    this.api = api;
    this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
  }
}

tccPlatform.prototype.didFinishLaunching = function() {
  this.log("didFinishLaunching");

  thermostats = new Tcc(this, function(err, devices) {
    // debug("thermostats", devices);
    if (!err) {
      for (var zone in devices.hb) {
        debug("Creating accessory for", devices.hb[zone].Name);
        // debug("123", devices.hb);
        var newAccessory = new TccAccessory(this, devices.hb[zone]);
        updateStatus(newAccessory, devices.hb[zone]);
      }
    } else {
      this.log(err.message);
    }
  }.bind(this));

  setInterval(pollDevices.bind(this), this.refresh * 1000); // Poll every minute
};

tccPlatform.prototype.configureAccessory = function(accessory) {
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
    // } else {
    accessory
      .getService(Service.Thermostat)
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('set', setTargetTemperature.bind(accessory));
    //  }
  }

  myAccessories.push(accessory);
};

function pollDevices() {
  // debug("pollDevices - thermo", thermostats);
  thermostats.poll(function(err, devices) {
    if (err) {
      if (err.message) {
        this.log("ERROR: pollDevices", err.message);
      } else {
        this.log("ERROR: pollDevices", err);
      }
    } else {
      myAccessories.forEach(function(accessory) {
        debug("pollDevices - updateStatus", accessory.displayName);
        if (devices.hb[accessory.context.ThermostatID]) {
          updateStatus(accessory, devices.hb[accessory.context.ThermostatID]);
        } else {
          this.log("ERROR: no data for", accessory.displayName);
          // debug("accessory", accessory);
          accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetTemperature)
            .updateValue(new Error("Status missing for thermostat"));
        }
      }.bind(this));
    }
  }.bind(this));
}

function updateStatus(accessory, device) {
  accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.Name)
    .updateValue(device.Name);
  accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.Model)
    .updateValue(device.Model);
  var service = accessory.getService(Service.Thermostat);
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
  service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
    .updateValue(device.CoolingThresholdTemperature);
  service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
    .updateValue(device.HeatingThresholdTemperature);
}

function TccAccessory(that, device) {
  this.log = that.log;
  // this.log("Adding TCC Device", device.DeviceName);
  this.name = device.Name;
  this.ThermostatID = device.ThermostatID;
  this.device = device;
  this.usePermanentHolds = that.usePermanentHolds;
  this.log_event_counter = 9; // Update fakegato on startup

  var uuid = UUIDGen.generate(this.name);

  if (!getAccessoryByThermostatID(this.ThermostatID)) {
    this.log("Adding TCC Device", this.name);
    this.accessory = new Accessory(this.name, uuid, 10);
    this.accessory.log = that.log;
    this.accessory.context.ThermostatID = device.ThermostatID;
    // this.accessory.context.device = device.device;
    // debug("TccAccessory-context", device);

    this.accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "TCC")
      .setCharacteristic(Characteristic.Model, device.Model)
      .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
      .setCharacteristic(Characteristic.FirmwareRevision, require('./package.json').version);

    this.accessory.addService(Service.Thermostat, this.name);

    // debug("HB", this.device, this.ThermostatID);
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

    // if (this.device.UI.CanSetSwitchAuto) {
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

    this.accessory
      .getService(Service.Thermostat).log = this.log;
    this.loggingService = new FakeGatoHistoryService("thermo", this.accessory
      .getService(Service.Thermostat), {
        storage: storage,
        minutes: refresh * 10 / 60
      });

    this.accessory
      .getService(Service.Thermostat).addCharacteristic(CustomCharacteristic.ValvePosition);
    this.accessory
      .getService(Service.Thermostat).addCharacteristic(CustomCharacteristic.ProgramCommand);
    this.accessory
      .getService(Service.Thermostat).addCharacteristic(CustomCharacteristic.ProgramData);

    that.api.registerPlatformAccessories("homebridge-tcc", "tcc", [this.accessory]);
    myAccessories.push(this.accessory);
    return this.accessory;
  } else {
    this.log("Existing TCC accessory", this.name);
    return getAccessoryByThermostatID(this.ThermostatID);
  }
}

function setTargetTemperature(value, callback) {
  this.log("Setting target temperature for", this.displayName, "to", value + "°");
  // debug("this", this);
  thermostats.ChangeThermostat(this, {
    TargetTemperature: value
  }).then((thermostat) => {
    // debug("setTargetTemperature", this, thermostat);
    updateStatus(this, thermostat);
    callback(null, value);
  }).catch((error) => {
    callback(error);
  });
}

function setTargetHeatingCooling(value, callback) {
  this.log("Setting switch for", this.displayName, "to", value);
  thermostats.ChangeThermostat(this, {
    TargetHeatingCooling: value
  }).then((thermostat) => {
    // debug("setTargetHeatingCooling", this, thermostat);
    updateStatus(this, thermostat);
    callback(null, value);
  }).catch((error) => {
    callback(error);
  });
}

function setHeatingThresholdTemperature(value, callback) {
  this.log("Setting HeatingThresholdTemperature for", this.displayName, "to", value);
  thermostats.ChangeThermostat(this, {
    HeatingThresholdTemperature: value
  }).then((thermostat) => {
    // debug("setTargetHeatingCooling", this, thermostat);
    updateStatus(this, thermostat);
    callback(null, value);
  }).catch((error) => {
    callback(error);
  });
}

function setCoolingThresholdTemperature(value, callback) {
  this.log("Setting CoolingThresholdTemperature for", this.displayName, "to", value);
  thermostats.ChangeThermostat(this, {
    CoolingThresholdTemperature: value
  }).then((thermostat) => {
    // debug("setTargetHeatingCooling", this, thermostat);
    updateStatus(this, thermostat);
    callback(null, value);
  }).catch((error) => {
    callback(error);
  });
}

function getAccessoryByThermostatID(ThermostatID) {
  var value;
  myAccessories.forEach(function(accessory) {
    // debug("getAccessoryByName zone", accessory.name, name);
    if (accessory.context.ThermostatID === ThermostatID) {
      value = accessory;
    }
  });
  return value;
}
