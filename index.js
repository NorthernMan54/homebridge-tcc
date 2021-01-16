/*jslint node: true */
'use strict';

var debug = require('debug')('tcc');
var Accessory, Service, Characteristic, UUIDGen, FakeGatoHistoryService, CustomCharacteristic;
var os = require("os");
var hostname = os.hostname();
var Tcc = require('./lib/tcc.js').tcc;
const moment = require('moment');

var myAccessories = [];
var thermostats;
var outsideSensors = 0;

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
  this.sensors = config['sensors'];
  this.storage = config['storage'] || "fs";

  // Enable config based DEBUG logging enable
  this.debug = config['debug'] || false;
  if (this.debug) {
    debug.enabled = true;
  }

  if (api) {
    this.api = api;
    this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
  }
}

tccPlatform.prototype.didFinishLaunching = function() {
  this.log("didFinishLaunching");

  thermostats = new Tcc(this);
  thermostats.pollThermostat().then((devices) => {
    for (var zone in devices.hb) {
      debug("Creating accessory for", devices.hb[zone].Name + "(" + devices.hb[zone].ThermostatID + ")");
      //debug("tccPlatform.prototype.didFinishLaunching()",this.devices)
      var newAccessory = new TccAccessory(this, devices.hb[zone], this.sensors);
      updateStatus(newAccessory, devices.hb[zone]);
      
      // does user want outside sensors created? if so, only create 1 set
      if ((this.sensors == "all" || this.sensors == "outside") && outsideSensors == 0) {
        var newSensorsAccessory = new TccSensorsAccessory(this, devices.hb[zone], this.sensors);
        updateStatus(newSensorsAccessory, devices.hb[zone]);
        outsideSensors = 1;
      }
    }
  }).catch((err) => {
    this.log("Critical Error - No devices created, please restart.");
    this.log(err.message);
  });
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
    debug("FakeGatoHistoryService", this.storage, this.refresh);
    accessory.context.logEventCounter = 9; // Update fakegato on startup
    accessory.loggingService = new FakeGatoHistoryService("thermo", accessory, {
      storage: this.storage,
      minutes: this.refresh * 10 / 60
    });
    
    // only attach this to the actual thermostat accessories, not the sensors accessory
    accessory.context.ChangeThermostat = new ChangeThermostat(accessory);
    debug("configureAccessory", accessory.context.ChangeThermostat);
  }
  
  // add fakegato logging for 
  debug(accessory);
  if (accessory.getService("Outside Humidity") | accessory.getService("Outside Temperature")) {
    debug("FakeGatoHistoryService", this.storage, this.refresh);
    accessory.context.logEventCounter = 9; // Update fakegato on startup
    accessory.loggingService = new FakeGatoHistoryService("weather", accessory, {
      storage: this.storage,
      minutes: this.refresh * 10 / 60
    });
  }
  
  myAccessories.push(accessory);
  //debug(accessory.context)
};

function pollDevices() {
  thermostats.pollThermostat().then((devices) => {
    myAccessories.forEach(function(accessory) {
      debug("pollDevices - updateStatus", accessory.displayName);
      if (devices.hb[accessory.context.ThermostatID]) {
        updateStatus(accessory, devices.hb[accessory.context.ThermostatID]);
      } else {
        this.log("ERROR: no data for", accessory.displayName);
        // debug("accessory", accessory);
        
        if (accessory.getService(Service.Thermostat)) {
          accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetTemperature)
            .updateValue(new Error("Status missing for thermostat"));
          }
      }
    }.bind(this));
  }).catch((err) => {
    if (err.message === 'Error: GetLocations InvalidSessionID') {
      // [Thermostat] ERROR: pollDevices Error: GetLocations InvalidSessionID
      // this.log("ERROR: pollDevices", err.message);
    } else if (err.message) {
      // [Thermostat] ERROR: pollDevices Error: GetLocations InvalidSessionID
      this.log("pollDevices", err.message);
    } else {
      this.log("ERROR: pollDevices", err);
    }
    myAccessories.forEach(function(accessory) {
      if (accessory.getService(Service.Thermostat)) {
        accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetTemperature)
          .updateValue(new Error("Status missing for thermostat"));
        }
    });
  });
}

function updateStatus(accessory, device) {
  accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.Name)
    .updateValue(device.Name);
  accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.Model)
    .updateValue(device.Model);

  // check if user wants separate temperature and humidity sensors
  if (accessory.getService(device.Name + " Temperature")) {
    //debug("updateStatus() " + device.Name + " InsideTemperature = true");
    var InsideTemperature = accessory.getService(device.Name + " Temperature");
    InsideTemperature.getCharacteristic(Characteristic.CurrentTemperature)
      .updateValue(device.CurrentTemperature);
  }
  if (accessory.getService("Outside Temperature")) {
    //debug("updateStatus() " + device.Name + " outsideTemperature = true");
    var OutsideTemperature = accessory.getService("Outside Temperature");
    OutsideTemperature.getCharacteristic(Characteristic.CurrentTemperature)
      .updateValue(device.OutsideTemperature);
  }
  if (accessory.getService(device.Name + " Humidity")) {
    //debug("updateStatus() " + device.Name + " insideHumidity = true");
    var InsideHumidity = accessory.getService(device.Name + " Humidity");
    InsideHumidity.getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .updateValue(device.InsideHumidity);
  }
  if (accessory.getService("Outside Humidity")) {
    //debug("updateStatus() " + device.Name + " outsideHumidity = true");
    var OutsideHumidity = accessory.getService("Outside Humidity");

    OutsideHumidity.getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .updateValue(device.OutsideHumidity);
  }
  
  // fakegato for outside sensor
  if (accessory.getService("Outside Humidity") & accessory.getService("Outside Temperature")) {
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
  else if (accessory.getService("Outside Humidity")) {
    accessory.context.logEventCounter++;
    if (!(accessory.context.logEventCounter % 10)) {
      accessory.loggingService.addEntry({
        time: moment().unix(),
        humidity: device.OutsideHumidity,
        temp: 0,
        pressure: 0
      });
      accessory.context.logEventCounter = 0;
    }
  }
  else if (accessory.getService("Outside Temperature")) {
    accessory.context.logEventCounter++;
    if (!(accessory.context.logEventCounter % 10)) {
      accessory.loggingService.addEntry({
        time: moment().unix(),
        humidity: 0,
        temp: device.OutsideTemperature,
        pressure: 0
      });
      accessory.context.logEventCounter = 0;
    }
  }
  
  // update thermostat
  if (accessory.getService(device.Name)) {
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

function TccAccessory(that, device, sensors) {
  this.log = that.log;
  //this.log("Adding TCC Device", device.Name);
  this.name = device.Name;
  this.ThermostatID = device.ThermostatID;
  this.device = device;
  this.usePermanentHolds = that.usePermanentHolds;
  this.storage = that.storage;
  this.refresh = that.refresh;
  //debug("TccAccessory()",device);
  
  var uuid = UUIDGen.generate(this.name + " - TCC");
  var createInsideSensors = false;
  
  // need to get config for this thermostat id
  switch (sensors) {
    case "none":
      createInsideSensors = false;
      break;
    case "all":
      createInsideSensors = true;
      break;
    case "inside":
      createInsideSensors = true;
      break;
    case "outside":
      createInsideSensors = false;
      break;
  }
  debug ("createInsideSensors: ",createInsideSensors);
  
  if (!getAccessoryByName(this.name)) {
    this.log("Adding TCC Device (deviceID="+this.ThermostatID+")", this.name);
    this.accessory = new Accessory(this.name, uuid, 10);
    this.accessory.log = that.log;
    this.accessory.context.ThermostatID = device.ThermostatID;
    this.accessory.context.name = this.name;
    this.accessory.context.logEventCounter = 9; // Update fakegato on startup

    this.accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "TCC")
      .setCharacteristic(Characteristic.Model, device.Model)
      .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
      .setCharacteristic(Characteristic.FirmwareRevision, require('./package.json').version);

    this.accessory.addService(Service.Thermostat, this.name);
    
    // check if user wants separate temperature and humidity sensors by zone/thermostat
    if (createInsideSensors) {
      debug("TccAccessory() " + this.name + " InsideTemperature = true, existing sensor");
      this.InsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, this.name + " Temperature", "Inside");
      this.InsideTemperatureService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          minValue: -100, // If you need this, you have major problems!!!!!
          maxValue: 100
        });
        
      debug("TccAccessory() " + this.name + " insideHumidity = true, existing sensor");
      this.InsideHumidityService = this.accessory.addService(Service.HumiditySensor, this.name + " Humidity", "Inside");
      this.InsideHumidityService
        .getCharacteristic(Characteristic.CurrentRelativeHumidity);
    }

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

    this.accessory.loggingService = new FakeGatoHistoryService("thermo", this.accessory, {
      storage: this.storage,
      minutes: this.refresh * 10 / 60
    });

    this.accessory
      .getService(Service.Thermostat).addCharacteristic(CustomCharacteristic.ValvePosition);
    // this.accessory.getService(Service.Thermostat).addCharacteristic(CustomCharacteristic.ProgramCommand);
    // this.accessory.getService(Service.Thermostat).addCharacteristic(CustomCharacteristic.ProgramData);

    this.accessory.context.ChangeThermostat = new ChangeThermostat(this.accessory);
    that.api.registerPlatformAccessories("homebridge-tcc", "tcc", [this.accessory]);
    myAccessories.push(this.accessory);
    return this.accessory;
  } else {
    this.log("Existing TCC accessory (deviceID="+this.ThermostatID+")", this.name);
    
    // need to check if accessory/zone/thermostat already exists, but user added temp/humidity sensors then must declare
    this.accessory = getAccessoryByThermostatID(this.ThermostatID);
    if (createInsideSensors && !this.accessory.getService(this.name + " Temperature")) {
      debug("TccAccessory() " + this.name + " InsideTemperature = true, adding sensor");
      this.InsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, this.name + " Temperature", "Inside");
      
      this.InsideTemperatureService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          minValue: -100, // If you need this, you have major problems!!!!!
          maxValue: 100
        });
    }
    if (createInsideSensors && !this.accessory.getService(this.name + " Humidity")) {
      debug("TccAccessory() " + this.name + " InsideHumidity = true, adding sensor");
      this.InsideHumidityService = this.accessory.addService(Service.HumiditySensor, this.name + " Humidity", "Inside");
      
      this.InsideHumidityService
        .getCharacteristic(Characteristic.CurrentRelativeHumidity);
    }
    return this.accessory;
  }
}

function TccSensorsAccessory(that, device, sensors) {
  this.log = that.log;
  //this.log("Adding TCC Sensors Device");
  this.name = "Outside Sensors"
  this.ThermostatID = device.ThermostatID;
  this.device = device;
  this.storage = that.storage;
  this.refresh = that.refresh;
  //debug("TccSensorsAccessory()",device);
  
  var uuid = UUIDGen.generate(this.name + " - TCC");
  
  if (!getAccessoryByName(this.name)) {
    this.log("Adding TCC Outside Sensors (deviceID="+this.ThermostatID+")", this.name);
    this.accessory = new Accessory(this.name, uuid, 10);
    this.accessory.log = that.log;
    this.accessory.context.ThermostatID = device.ThermostatID;
    this.accessory.context.name = this.name;
    this.accessory.context.logEventCounter = 9; // Update fakegato on startup

    this.accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "TCC")
      .setCharacteristic(Characteristic.Model, device.Model)
      .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
      .setCharacteristic(Characteristic.FirmwareRevision, require('./package.json').version);
    
    // create outside temp sensor
    debug("TccSensorsAccessory() " + this.name + " outsideTemperature = true, existing sensor");
    this.OutsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, "Outside Temperature", "Outside");
    this.OutsideTemperatureService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({
        minValue: -100, // If you need this, you have major problems!!!!!
        maxValue: 100
      });
    
    // create outside humidity sensor
    debug("TccSensorsAccessory() " + this.name + " outsideHumidity = true, existing sensor");
    this.OutsideHumidityService = this.accessory.addService(Service.HumiditySensor, "Outside Humidity", "Outside");
    this.OutsideHumidityService
      .getCharacteristic(Characteristic.CurrentRelativeHumidity);

    this.accessory.loggingService = new FakeGatoHistoryService("weather", this.accessory, {
      storage: this.storage,
      minutes: this.refresh * 10 / 60
    });

    that.api.registerPlatformAccessories("homebridge-tcc", "tcc", [this.accessory]);
    myAccessories.push(this.accessory);
    return this.accessory;
  } else {
    this.log("Existing TCC outside sensors accessory (deviceID="+this.ThermostatID+")", this.name);
    
    // need to check if accessory/zone/thermostat already exists, but user added temp/humidity sensors then must declare
    this.accessory = getAccessoryByName("Outside Sensors");
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
    if (!this.accessory.getService("Outside Humidity")) {
      debug("TccSensorsAccessory() " + this.name + " outsideHumidity = true, adding sensor");
      this.OutsideHumidityService = this.accessory.addService(Service.HumiditySensor, "Outside Humidity", "Outside");
      
      this.OutsideHumidityService
        .getCharacteristic(Characteristic.CurrentRelativeHumidity);
    }
    return this.accessory;
  }
}

function setTargetTemperature(value, callback) {
  this.log("Setting target temperature for", this.displayName, "to", value + "°");
  this.context.logEventCounter = 9;
  // debug("this", this);
  this.context.ChangeThermostat.put({
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
  this.context.logEventCounter = 9;
  this.context.ChangeThermostat.put({
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
  this.context.ChangeThermostat.put({
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
  this.context.ChangeThermostat.put({
    CoolingThresholdTemperature: value
  }).then((thermostat) => {
    // debug("setTargetHeatingCooling", this, thermostat);
    updateStatus(this, thermostat);
    callback(null, value);
  }).catch((error) => {
    callback(error);
  });
}

function getAccessoryByName(accessoryName) {
  var value;
  myAccessories.forEach(function(accessory) {
    // debug("getAccessoryByName zone", accessory.name, name);
    if (accessory.context.name === accessoryName) {
      value = accessory;
    }
  });
  return value;
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

// Consolidate change requests received over 100ms into a single request

function ChangeThermostat(accessory) {
  // debug("ChangeThermostat", accessory);
  this.desiredState = {};
  this.deferrals = [];
  this.ThermostatID = accessory.context.ThermostatID;
  this.waitTimeUpdate = 100; // wait 100ms before processing change
}

ChangeThermostat.prototype.put = function(state) {
  debug("put %s ->", this.ThermostatID, state);
  return new Promise((resolve, reject) => {
    this.desiredState.ThermostatID = this.ThermostatID;
    for (const key in state) {
      // console.log("ChangeThermostat", accessory);
      this.desiredState[key] = state[key];
    }
    const d = {
      resolve: resolve,
      reject: reject
    };
    this.deferrals.push(d);
    // debug("setTimeout", this.timeout);
    if (!this.timeout) {
      this.timeout = setTimeout(() => {
        // debug("put start");
        thermostats.ChangeThermostat(this.desiredState).then((thermostat) => {
          for (const d of this.deferrals) {
            d.resolve(thermostat);
          }
          this.desiredState = {};
          this.deferrals = [];
          this.timeout = null;
          // debug("put complete", thermostat);
        }).catch((error) => {
          for (const d of this.deferrals) {
            d.reject(error);
          }
          this.desiredState = {};
          this.deferrals = [];
          this.timeout = null;
          // debug("put error", error);
        });
      }, this.waitTimeUpdate);
    }
  });
};
