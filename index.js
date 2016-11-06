// This platform integrates Honeywell tcc into homebridge
// As I only own single thermostat, so this only works with one, but it is
// conceivable to handle mulitple with additional coding.
//
// The configuration is stored inside the ../config.json
// {
//     "platform": "tcc",
//     "name" : "tcc",
//     "username" : "username/email",
//     "password" : "password",
//     "deviceID" : "123456789"
// }
//


'use strict';

var tcc = require('./lib/tcc.js');
var Service, Characteristic;
var config;
var myAccessories = [];
var session;   // reuse the same login session

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerPlatform("homebridge-tcc", "tcc", tccPlatform);
}

function tccPlatform(log, config) {

    this.username = config['username'];
    this.password = config['password'];
    this.name = config['name'];
    this.deviceID = config['deviceID'];

    this.cache_timeout = 60; // seconds

    this.log = log;

    this.updating = false;
}

tccPlatform.prototype = {
    accessories: function(callback) {
        this.log("Logging into tcc...");

        var that = this;

        tcc.login(that.username, that.password, that.deviceID).then(function(login) {
            this.log("Logged into tcc!");
            session = login;
            session.CheckDataSession(that.deviceID).then(function(deviceData) {
                //    console.log("DD -->", deviceData);

                var accessory = new tccThermostatAccessory(that.log, this.name, deviceData, this.username, this.password, this.deviceID);
                // store accessory in myAccessories
                myAccessories.push(accessory);

                this.log("Added accessory!");

                callback(myAccessories);

                setInterval(that.periodicUpdate.bind(this), this.cache_timeout * 1000);

            }.bind(this)).fail(function(err) {
                this.log('tcc Failed:', err);
            });

        }.bind(this)).fail(function(err) {
            // tell me if login did not work!
            that.log("Error during Login:", err);
        });
    }
};

tccPlatform.prototype.periodicUpdate = function(t) {
    this.log("periodicUpdate");
    if (!this.updating && myAccessories) {
        this.updating = true;

    //    tcc.login(this.username, this.password, this.deviceID).then(function(session) {

            //    console.log("PU:81");
            session.CheckDataSession(this.deviceID).then(function(deviceData) {

                for (var i = 0; i < myAccessories.length; ++i) {

                    var device = deviceData;

                    if (device) {

                        // Check if temp has changed
                        var oldCurrentTemp = myAccessories[i].device.latestData.uiData.DispTemperature;
                        var oldTargetTemp = myAccessories[i].device.latestData.uiData.HeatSetpoint;
                        var newCurrentTemp = device.latestData.uiData.DispTemperature;
                        var newTargetTemp = device.latestData.uiData.HeatSetpoint;

                        var CurrentHeatingCoolingState = device.latestData.uiData.SystemSwitchPosition;
                        var oldCurrentHeatingCoolingState = myAccessories[i].device.latestData.uiData.SystemSwitchPosition;

                        myAccessories[i].device = device;

                        var service = myAccessories[i].thermostatService;

                        if (oldCurrentTemp != newCurrentTemp && service) {
                            this.log("Updating: " + device.latestData.uiData.DeviceID + " currentTempChange from: " + oldCurrentTemp + " to: " + newCurrentTemp);
                            service.getCharacteristic(Characteristic.CurrentTemperature)
                              .getValue();
                        }

                        if (CurrentHeatingCoolingState != oldCurrentHeatingCoolingState && service) {
                            this.log("Updating: " + device.latestData.uiData.DeviceID + " HeatingCoolingState from: " + oldCurrentHeatingCoolingState + " to: " + CurrentHeatingCoolingState);
                            service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                              .getValue();
                        }

                        if (oldTargetTemp != newTargetTemp && service) {
                            this.log("Updating: " + device.latestData.uiData.DeviceID + " targetTempChange from: " + oldTargetTemp + " to: " + newTargetTemp);
                            service.getCharacteristic(Characteristic.TargetTemperature)
                              .getValue();
                        }


                    }
                }
            }.bind(this)).fail(function(err) {
                this.log('PU Failed:', err);
            });
  //      }.bind(this)).fail(function(err) {
  //          this.log('PU Failed:', err);
  //      });

        this.updating = false;
    }
}

// give this function all the parameters needed
function tccThermostatAccessory(log, name, deviceData, username, password, deviceID) {
    this.name = name;
    this.device = deviceData;
    //this.model = device.thermostatModelType;
    //this.serial = device.deviceID;
    //this.deviceId = deviceId;

    this.username = username;
    this.password = password;
    this.deviceID = deviceID;

    this.log = log;
}

function toFahrenheit(temperature) {
    return ((temperature * 9 / 5) + 32);
}

function toCelsius(temperature) {
    return ((temperature - 32) * 5 / 9);
}

tccThermostatAccessory.prototype = {

    getCurrentTemperature: function(callback) {
        var that = this;
        
        var currentTemperature = this.device.latestData.uiData.DispTemperature;
        that.log("Current temperature of " + this.name + " is " + currentTemperature + "°");
        switch (this.device.latestData.uiData.DisplayUnits) {
            case "F":
                currentTemperature = toCelsius(currentTemperature);
                break;
        }
        callback(null, Number(currentTemperature));
    },

    getCurrentHeatingCoolingState: function(callback) {
        var that = this;

        that.log("getCurrentHeatingCooling");
        var CurrentHeatingCoolingState = this.device.latestData.uiData.SystemSwitchPosition;
        // OFF  = 0
        // HEAT = 1
        // COOL = 2
        // AUTO = 3
        callback(null, Number(CurrentHeatingCoolingState));
        that.log("Current Heating/Cooling state of " + this.name + " is " + CurrentHeatingCoolingState);
    },

    getName: function(callback) {

        var that = this;

        that.log("requesting name of", this.name);

        callback(this.name);

    },

    getCurrentRelativeHumidity: function (callback) {
        var that = this;

        var currentRelativeHumidity = this.device.latestData.uiData.IndoorHumidity;
        callback(null, Number(currentRelativeHumidity));
        that.log("Current relative humidity of " + this.name + " is " + currentRelativeHumidity + "%");
    },

    setTargetHeatingCooling: function(value, callback) {
        var that = this;

        // not implemented

        that.log("attempted to change targetHeatingCooling: " + value + " - not yet implemented");
        callback();

    },

    getTargetHeatingCooling: function(callback) {
        var that = this;
        this.log("getTargetHeatingCooling");

        var TargetHeatingCooling = this.device.latestData.uiData.SystemSwitchPosition;
        // TODO:
        // fixed until it can be requested from tcc...
        // OFF  = 0
        // HEAT = 1
        // COOL = 2
        // AUTO = 3
        callback(null, Number(TargetHeatingCooling));

    },

    setTargetTemperature: function(value, callback) {
        var that = this;

        that.log("Setting target temperature for", this.name, "to", value + "°");
        var minutes = 10; // The number of minutes the new target temperature will be effective
        // TODO:
        // verify that the task did succeed
        switch (this.device.latestData.uiData.DisplayUnits) {
            case "F":
                value = toFahrenheit(value);
                break;
        }

        tcc.login(this.username, this.password, this.deviceID).then(function(session) {
            session.setHeatSetpoint(that.deviceID, value, minutes).then(function(taskId) {
                that.log("Successfully changed temperature!");
                that.log(taskId);
                // returns taskId if successful
                // nothing else here...
                callback(null, Number(1));
            });
        }).fail(function(err) {
            that.log('tcc Failed:', err);
            callback(null, Number(0));
        });
        callback(null, Number(0));
    },

    getTargetTemperature: function(callback) {
        var that = this;

        // Homebridge expects temperatures in C, but Honeywell will return F if configured.

        if (this.model = "EMEA_ZONE") {
            var targetTemperature = this.device.latestData.uiData.HeatSetpoint;
            //        that.log("Device type is: " + this.model + ". Target temperature should be there.");
            that.log("Target temperature for", this.name, "is", targetTemperature + "°");
        } else {
            var targetTemperature = 0;
            that.log("Device type is: " + this.model + ". Target temperature is probably NOT there (this is normal).");
            that.log("Will set target temperature for", this.name, "to " + targetTemperature + "°");
        }
        switch (this.device.latestData.uiData.DisplayUnits) {
            case "F":
                targetTemperature = toCelsius(targetTemperature);
                break;
        }
        callback(null, Number(targetTemperature));

    },

    getTemperatureDisplayUnits: function(callback) {
        var that = this;
        var temperatureUnits = 0;
        that.log("getTemperatureDisplayUnits");
        switch (this.device.latestData.uiData.DisplayUnits) {
            case "F":
                that.log("Temperature unit for", this.name, "is set to", this.device.latestData.uiData.DisplayUnits);
                temperatureUnits = 1;
                break;
            case "C":
                that.log("Temperature unit for", this.name, "is set to", this.device.latestData.uiData.DisplayUnits);
                temperatureUnits = 0;
                break;
            default:
                temperatureUnits = 0;
        }

        callback(null, Number(temperatureUnits));
    },

    setTemperatureDisplayUnits: function(value, callback) {
        var that = this;

        that.log("set temperature units to", value);
        callback();
    },

    getServices: function() {
        var that = this;
        that.log("getServices");
        // Information Service
        var informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Identify, this.name)
            .setCharacteristic(Characteristic.Manufacturer, "Honeywell")
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.SerialNumber, this.deviceID); // need to stringify the this.serial

        // Thermostat Service
        this.thermostatService = new Service.Thermostat(this.name);

        // Required Characteristics /////////////////////////////////////////////////////////////
        // this.addCharacteristic(Characteristic.CurrentHeatingCoolingState); READ
        this.thermostatService
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', this.getCurrentHeatingCoolingState.bind(this));

        // this.addCharacteristic(Characteristic.TargetHeatingCoolingState); READ WRITE
        this.thermostatService
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('get', this.getTargetHeatingCooling.bind(this));
        //    .on('set', this.setTargetHeatingCooling.bind(this));

        // this.addCharacteristic(Characteristic.CurrentTemperature); READ
        this.thermostatService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', this.getCurrentTemperature.bind(this));

        // this.addCharacteristic(Characteristic.TargetTemperature); READ WRITE
        this.thermostatService
            .getCharacteristic(Characteristic.TargetTemperature)
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this));

        // this.addCharacteristic(Characteristic.TemperatureDisplayUnits); READ WRITE
        this.thermostatService
            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('get', this.getTemperatureDisplayUnits.bind(this));

        // Optional Characteristics /////////////////////////////////////////////////////////////
        // this.addOptionalCharacteristic(Characteristic.CurrentRelativeHumidity);
        if (this.device.latestData.uiData.IndoorHumiditySensorAvailable && this.device.latestData.uiData.IndoorHumiditySensorNotFault) {
            this.thermostatService
                .getCharacteristic(Characteristic.CurrentRelativeHumidity)
                .on('get', this.getCurrentRelativeHumidity.bind(this));
        }

        // this.addOptionalCharacteristic(Characteristic.TargetRelativeHumidity);
        // this.addOptionalCharacteristic(Characteristic.CoolingThresholdTemperature);
        // this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);

        // this.addOptionalCharacteristic(Characteristic.Name);
        this.thermostatService
            .getCharacteristic(Characteristic.Name)
            .on('get', this.getName.bind(this));

        return [informationService, this.thermostatService];

    }
}
