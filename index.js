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
    if (!err) {
      for (var zone in devices.LocationInfo.Thermostats) {
        debug("Creating accessory for", devices.LocationInfo.Thermostats[zone].DeviceName);
        // debug("123", devices.hb);
        var newAccessory = new TccAccessory(this, devices.LocationInfo.Thermostats[zone], devices.hb[devices.LocationInfo.Thermostats[zone].ThermostatID]);
        updateStatus(newAccessory, devices.hb[devices.LocationInfo.Thermostats[zone].ThermostatID]);
      }
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
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('set', setTargetTemperature.bind(accessory));
  }

  myAccessories.push(accessory);
};

function pollDevices() {
  // debug("pollDevices - thermo", thermostats);
  thermostats.poll(function(err, devices) {
    if (err) {
      this.log("ERROR: pollDevices", err, devices);
    }
    myAccessories.forEach(function(accessory) {
      debug("pollDevices - updateStatus", accessory.displayName);
      updateStatus(accessory, devices.hb[accessory.context.ThermostatID]);
    });
  }.bind(this));
}

function updateStatus(accessory, device) {
  var service = accessory.getService(Service.Thermostat);
  debug("updateStatus", accessory.displayName);
  debug("updateStatus - device", device);
  accessory.context.device = device.device;
  service.getCharacteristic(Characteristic.TargetTemperature)
    .updateValue(device.TargetTemperature);
  service.getCharacteristic(Characteristic.CurrentTemperature)
    .updateValue(device.CurrentTemperature);
  service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    .updateValue(device.CurrentHeatingCoolingState);
  service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .updateValue(device.TargetHeatingCoolingState);
}

function TccAccessory(that, device, hbValues) {
  this.log = that.log;
  // this.log("Adding TCC Device", device.DeviceName);
  this.name = device.DeviceName;
  this.ThermostatID = device.ThermostatID;
  this.device = device;
  this.device.deviceLive = "false";
  this.usePermanentHolds = that.usePermanentHolds;
  this.log_event_counter = 9; // Update fakegato on startup

  var uuid = UUIDGen.generate(this.name);

  if (!getAccessoryByName(this.name)) {
    this.log("Adding TCC Device", this.name);
    this.accessory = new Accessory(this.name, uuid, 10);

    this.accessory.context.ThermostatID = device.ThermostatID;
    this.accessory.context.device = device.device;
    debug("TccAccessory-context", device.device);

    this.accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "TCC")
      .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
      .setCharacteristic(Characteristic.FirmwareRevision, require('./package.json').version);

    this.accessory.addService(Service.Thermostat, this.name);
    this.accessory
      .getService(Service.Thermostat).isPrimaryService = true;

    // Information Service
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "TCC")
      .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.deviceID)
      .setCharacteristic(Characteristic.FirmwareRevision, require('./package.json').version);
    // Thermostat Service
    this.thermostatService = new Service.Thermostat(this.name);

    // debug("HB", this.device, this.ThermostatID);

    this.accessory
      .getService(Service.Thermostat)
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: hbValues.TargetHeatingCoolingStateValidValues
      })
      .on('set', setTargetHeatingCooling.bind(this));

    this.accessory
      .getService(Service.Thermostat)
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({
        minValue: -100, // If you need this, you have major problems!!!!!
        maxValue: 100
      });

    // this.addCharacteristic(Characteristic.TargetTemperature); READ WRITE
    this.accessory
      .getService(Service.Thermostat)
      .getCharacteristic(Characteristic.TargetTemperature)
      .setProps({
        minValue: hbValues.TargetTemperatureHeatMinValue,
        maxValue: hbValues.TargetTemperatureCoolMaxValue
      })
      .on('set', setTargetTemperature.bind(this));

    if (this.device.UI.CanSetSwitchAuto) {
      // Only available on models with an Auto Mode
      this.accessory
        .getService(Service.Thermostat)
        .getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .setProps({
          minValue: hbValues.TargetTemperatureHeatMinValue,
          maxValue: hbValues.TargetTemperatureHeatMaxValue
        })
        .on('set', this.setCoolingThresholdTemperature.bind(this));

      // this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
      this.accessory
        .getService(Service.Thermostat)
        .getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .setProps({
          minValue: hbValues.TargetTemperatureCoolMinValue,
          maxValue: hbValues.TargetTemperatureCoolMaxValue
        })
        .on('set', this.setHeatingThresholdTemperature.bind(this));
    }

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
    return getAccessoryByName(this.name);
  }
}

TccAccessory.prototype = {
};

function setTargetTemperature(value, callback) {
  this.log("Setting target temperature for", this.displayName, "to", value + "°");
  thermostats.setTargetTemperature(this, value, function(err) {
    pollDevices.call(this);
    callback(err);
  }.bind(this));
}

function setTargetHeatingCooling(value, callback) {
  this.log("Setting switch for", this.displayName, "to", value);
  thermostats.setTargetHeatingCooling(this, value, function(err) {
    pollDevices.call(this);
    callback(err);
  }.bind(this));
}

function getAccessoryByName(name) {
  var value;
  myAccessories.forEach(function(accessory) {
    // debug("getAccessoryByName zone", accessory.name, name);
    if (accessory.displayName === name) {
      value = accessory;
    }
  });
  return value;
}
