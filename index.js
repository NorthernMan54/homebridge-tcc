// This platform integrates Honeywell tcc into homebridge
// As I only own single thermostat, so this only works with one, but it is
// conceivable to handle mulitple with additional coding.
//
// The configuration is stored inside the ../config.json
// {
//     "platform": "tcc",
//     "name":     "Thermostat",
//     "username" : "username/email",
//     "password" : "password",
//     "debug" : "True",      - Optional
//     "refresh": "60",       - Optional
//     "devices" : [
//        { "deviceID": "123456789", "name" : "Main Floor Thermostat" },
//        { "deviceID": "123456789", "name" : "Upper Floor Thermostat" }
//     ]
// }
//

/*jslint node: true */
'use strict';

var debug = require('debug')('tcc');
var Accessory, Service, Characteristic, UUIDGen, FakeGatoHistoryService, CustomCharacteristic, tcc;
var os = require("os");
var hostname = os.hostname();
const moment = require('moment');

var myAccessories = [];
var session; // reuse the same login session
var updating; // Only one change at a time!!!!
var refresh,storage;

module.exports = function(homebridge) {

  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  CustomCharacteristic = require('./lib/CustomCharacteristic.js')(homebridge);
  FakeGatoHistoryService = require('fakegato-history')(homebridge);
  tcc = require('./lib/tcc.js');

  tcc.setCharacteristic(Characteristic);

  homebridge.registerPlatform("homebridge-tcc", "tcc", tccPlatform);
}

function tccPlatform(log, config, api) {

  this.username = config['username'];
  this.password = config['password'];
  refresh = config['refresh'] || 60; // Update every minute
  this.log = log;
  this.devices = config['devices'];
  storage = config['storage'] || "fs";

  updating = false;
}

tccPlatform.prototype = {
  accessories: function(callback) {
    this.log("Logging into tcc...");
    var that = this;
    tcc.login(that.username, that.password).then(function(login) {
      this.log("Logged into tcc!", this.devices);
      session = login;

      let requests = this.devices.map((device) => {
        return new Promise((resolve) => {

          session.CheckDataSession(device.deviceID,
            function(err, deviceData) {
              if (err) {
                that.log("Create Device Error", err);
                resolve();
              } else {

                var newAccessory = new tccAccessory(that.log, device.name,
                  deviceData, that.username, that.password, device.deviceID, device.usePermanentHolds);
                // store accessory in myAccessories
                myAccessories.push(newAccessory);
                resolve();
              }
            });
        });
      })

      // Need to wait for all devices to be configured

      Promise.all(requests).then(() => {
        callback(myAccessories);
        that.periodicUpdate();
        setInterval(that.periodicUpdate.bind(this), refresh * 1000);

      });

      // End of login section
    }.bind(this)).fail(function(err) {
      // tell me if login did not work!
      that.log("Error during Login:", err);
      callback(err);
    });
  }
};

function updateStatus(service, data) {
  service.getCharacteristic(Characteristic.TargetTemperature)
    .updateValue(Number(tcc.toHBTargetTemperature(data)));

  service.getCharacteristic(Characteristic.CurrentTemperature)
    .updateValue(Number(tcc.toHBTemperature(data, data.latestData.uiData.DispTemperature)));

  service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    .updateValue(data.latestData.uiData.EquipmentOutputStatus);

  service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .updateValue(Number(tcc.toHomeBridgeHeatingCoolingSystem(data.latestData.uiData.SystemSwitchPosition)));

  service.getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .updateValue(Number(tcc.toHBTemperatureDisplayUnits(data.latestData.uiData.DisplayUnits)));

  if (data.latestData.uiData.IndoorHumiditySensorAvailable && data.latestData.uiData.IndoorHumiditySensorNotFault)
    service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
    .updateValue(data.latestData.uiData.IndoorHumidity);

  if (data.latestData.uiData.SwitchAutoAllowed) {
    service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .updateValue(Number(tcc.toHBTemperature(data, data.latestData.uiData.CoolSetpoint)));
    service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .updateValue(Number(tcc.toHBTemperature(data, data.latestData.uiData.HeatSetpoint)));
  }

}

tccPlatform.prototype.periodicUpdate = function(t) {
  var t = updateValues(this);
}

function updateValues(that) {
  that.log("updateValues", myAccessories.length);
  myAccessories.forEach(function(accessory) {

    session.CheckDataSession(accessory.deviceID, function(err, deviceData) {
      if (err) {
        that.log("ERROR: UpdateValues", accessory.name, err);
        that.log("updateValues: Device not reachable", accessory.name);
        //                accessory.newAccessory.updateReachability(false);
        tcc.login(that.username, that.password).then(function(login) {
          that.log("Logged into tcc!");
          session = login;
        }.bind(this)).fail(function(err) {
          // tell me if login did not work!
          that.log("Error during Login:", err);
        });
      } else {
        //debug("Update Values", accessory.name, deviceData);
        // Data is live

        if (deviceData.deviceLive) {
          //                    that.log("updateValues: Device reachable", accessory.name);
          //                    accessory.newAccessory.updateReachability(true);
        } else {
          that.log("updateValues: Device not reachable", accessory.name);
          //                    accessory.newAccessory.updateReachability(false);
        }

        that.log("Change", accessory.name, tcc.diff(accessory.device, deviceData));
        accessory.device = deviceData;

        accessory.log_event_counter++;
        if (!(accessory.log_event_counter % 10)) {
          accessory.loggingService.addEntry({
            time: moment().unix(),
            currentTemp: roundInt(tcc.toHBTemperature(deviceData, deviceData.latestData.uiData.DispTemperature)),
            setTemp: roundInt(tcc.toHBTargetTemperature(deviceData)),
            valvePosition: roundInt(deviceData.latestData.uiData.EquipmentOutputStatus)
          });
          accessory.log_event_counter = 0;
        }


        updateStatus(accessory.thermostatService, deviceData);

      }
    });
  });
}

// give this function all the parameters needed

function tccAccessory(log, name, deviceData, username, password, deviceID, usePermanentHolds) {

  var uuid = UUIDGen.generate(name);

//  var accessory = new Accessory(name, uuid);

  this.log = log;
  this.log("Adding TCC Device", name, deviceID);
  this.name = name;
  this.device = deviceData;
  this.device.deviceLive = "false";
  this.username = username;
  this.password = password;
  this.deviceID = deviceID;
  this.usePermanentHolds = usePermanentHolds;
  this.log_event_counter = 9;   // Update fakegato on startup
}

tccAccessory.prototype = {

  // This is to change the system switch to a different position

  setTargetHeatingCooling: function(value, callback) {
    var that = this;
    if (!updating) {
      updating = true;

      that.log("Setting system switch for", this.name, "to", value);
      // TODO:
      // verify that the task did succeed

      tcc.login(this.username, this.password).then(function(session) {
        session.setSystemSwitch(that.deviceID, tcc.toTCCHeadingCoolingSystem(value)).then(function(taskId) {
          that.log("Successfully changed system!");
          that.log(taskId);
          updateValues(that);
          callback(null, Number(1));
        });
      }).fail(function(err) {
        that.log('tcc Failed:', err);
        callback(null, Number(0));
      });
      callback(null, Number(0));
      updating = false
    }
  },

  setTargetTemperature: function(value, callback) {
    var that = this;
    if (!updating) {
      updating = true;

      //    maxValue: 38,
      //    minValue: 10,

      that.log("Setting target temperature for", this.name, "to", value + "°");

      if (value < 10)
        value = 10;

      if (value > 38)
        value = 38;

      value = tcc.toTCCTemperature(that, value);
      // TODO:
      // verify that the task did succeed

      //            tcc.login(this.username, this.password).then(function(session) {
      var heatSetPoint, coolSetPoint = null;
      switch (tcc.toHomeBridgeHeatingCoolingSystem(that.device.latestData.uiData.SystemSwitchPosition)) {
        case 0:
          break;
        case 1:
          heatSetPoint = value;
          break;
        case 2:
          coolSetPoint = value;
          break;
        case 3:
          if (value < that.device.latestData.uiData.HeatSetpoint)
            heatSetPoint = value;
          else if (value > that.device.latestData.uiData.CoolSetpoint)
            coolSetPoint = value;
          else if ((that.device.latestData.uiData.HeatSetpoint - value) < (value - that.device.latestData.uiData.CoolSetpoint))
            coolSetPoint = value;
          else
            heatSetPoint = value;
          break;
        default:
          break;
      }
      that.log("setHeatCoolSetpoint", that.name, that.device.latestData.uiData.StatusHeat, that.device.latestData.uiData.StatusCool);
      session.setHeatCoolSetpoint(that.deviceID, heatSetPoint, coolSetPoint, that.usePermanentHolds).then(function(taskId) {
        that.log("Successfully changed temperature!", that.name, taskId);
        if (taskId.success) {
          that.log("Successfully changed temperature!", taskId);
          callback();
        } else {
          that.log("Error: Unsuccessfully changed temperature!", that.name, taskId);
          callback(new Error("Error: setHeatCoolSetpoint"));
        }
        updateValues(that); // refresh
      }.bind(this)).fail(function(err) {
        that.log('Error: setHeatCoolSetpoint', that.name, err);
        callback(err);
      });
      updating = false;
    }
  },

  setCoolingThresholdTemperature: function(value, callback) {
    var that = this;
    if (!updating) {
      updating = true;

      //    maxValue: 38,
      //    minValue: 10,

      that.log("Setting cooling threshold temperature for", this.name, "to", value + "°");


      if (value < 10)
        value = 10;

      if (value > 38)
        value = 38;

      value = tcc.toTCCTemperature(that, value);
      // TODO:
      // verify that the task did succeed

      tcc.login(this.username, this.password).then(function(session) {
        session.setHeatCoolSetpoint(that.deviceID, null, value, that.usePermanentHolds).then(function(taskId) {
          that.log("Successfully changed cooling threshold!");
          that.log(taskId);
          // returns taskId if successful
          // nothing else here...
          updateValues(that);
          callback(null, Number(1));
        });
      }).fail(function(err) {
        that.log('tcc Failed:', err);
        callback(null, Number(0));
      });
      callback(null, Number(0));
      updating = false;
    }
  },

  setHeatingThresholdTemperature: function(value, callback) {
    var that = this;
    if (!updating) {
      updating = true;

      //    maxValue: 38,
      //    minValue: 10,

      that.log("Setting heating threshold temperature for", this.name, "to", value + "°");


      if (value < 10)
        value = 10;

      if (value > 38)
        value = 38;

      value = tcc.toTCCTemperature(that, value);
      // TODO:
      // verify that the task did succeed

      tcc.login(this.username, this.password).then(function(session) {
        session.setHeatCoolSetpoint(that.deviceID, value, null).then(function(taskId) {
          that.log("Successfully changed heating threshold!");
          that.log(taskId);
          // returns taskId if successful
          // nothing else here...
          updateValues(that);
          callback(null, Number(1));
        });
      }).fail(function(err) {
        that.log('tcc Failed:', err);
        callback(null, Number(0));
      });
      callback(null, Number(0));
      updating = false;
    }
  },

  setTemperatureDisplayUnits: function(value, callback) {
    var that = this;

    that.log("set temperature units to", value);
    callback();
  },

  getServices: function() {
    var that = this;
    that.log("getServices", this.name);
    // Information Service
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "TCC")
      .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.deviceID)
      .setCharacteristic(Characteristic.FirmwareRevision, require('./package.json').version);
    // Thermostat Service
    this.thermostatService = new Service.Thermostat(this.name);

    // this.addCharacteristic(Characteristic.TargetHeatingCoolingState); READ WRITE

    if (this.device.latestData.uiData.SwitchAutoAllowed) {
      this.thermostatService
        .getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .on('set', this.setTargetHeatingCooling.bind(this));
    } else {
      // don't display Auto if it isn't supported
      this.thermostatService
        .getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .setProps({
          validValues: [0, 1, 2]
        })
        .on('set', this.setTargetHeatingCooling.bind(this));
    }

    this.thermostatService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({
        minValue: -100, // If you need this, you have major problems!!!!!
        maxValue: 100
      });

    // this.addCharacteristic(Characteristic.TargetTemperature); READ WRITE
    this.thermostatService
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('set', this.setTargetTemperature.bind(this));

    if (this.device.latestData.uiData.SwitchAutoAllowed) {
      // Only available on models with an Auto Mode
      this.thermostatService
        .getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .on('set', this.setCoolingThresholdTemperature.bind(this));

      // this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
      this.thermostatService
        .getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .on('set', this.setHeatingThresholdTemperature.bind(this));
    }

    this.thermostatService.log = this.log;
    this.loggingService = new FakeGatoHistoryService("thermo", this.thermostatService, {
          storage: storage,
          minutes: refresh * 10 / 60
        });

    this.thermostatService.addCharacteristic(CustomCharacteristic.ValvePosition);
    this.thermostatService.addCharacteristic(CustomCharacteristic.ProgramCommand);
    this.thermostatService.addCharacteristic(CustomCharacteristic.ProgramData);

    return [informationService, this.thermostatService, this.loggingService];

  }
}

function roundInt(string) {
  return Math.round(parseFloat(string) * 10) / 10;
}
