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
var session; // reuse the same login session
var updating; // Only one change at a time!!!!

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
    this.debug = config['debug'] || false;
    this.cache_timeout = 60; // seconds
    this.log = log;

    updating = false;
}

tccPlatform.prototype = {
    accessories: function(callback) {
        this.log("Logging into tcc...");

        var that = this;

        tcc.login(that.username, that.password, that.deviceID).then(function(login) {
            this.log("Logged into tcc!");
            session = login;
            session.CheckDataSession(that.deviceID).then(function(deviceData) {
                //                console.log("DD -->", deviceData);

                var accessory = new tccThermostatAccessory(that.log, this.name,
                    deviceData, this.username, this.password, this.deviceID, this.debug);
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
    var t = updateValues(this);
}

function updateValues(that) {
    that.log("updateValues");
    if (!updating && myAccessories) {
        updating = true;
        session.CheckDataSession(that.deviceID).then(function(deviceData) {
            for (var i = 0; i < myAccessories.length; ++i) {

                var device = deviceData;
                if (device) {
                    if (that.debug)
                        that.log("DEBUG ", device);
                    if (!deepEquals(device, myAccessories[i].device)) {

                        that.log("Change ", diff(myAccessories[i].device, device));
                        myAccessories[i].device = device;

                        var service = myAccessories[i].thermostatService;
                        // Something changed, update everything
                        // works intermittently
                        service.getCharacteristic(Characteristic.TargetTemperature)
                            .getValue();
                        service.getCharacteristic(Characteristic.CurrentTemperature)
                            .getValue();
                        service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                            .getValue();
                        service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
                            .getValue();
                        service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
                            .getValue();
                        service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
                            .getValue();
                        service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                            .getValue();

                    } else {
                        that.log("No change");
                    }
                }
            }
        }.bind(that)).fail(function(err) {
            that.log('PU Failed:', err);
            // Try logging in again
            tcc.login(that.username, that.password, that.deviceID).then(function(login) {
                this.log("Logged into tcc!");
                session = login;
            }.bind(this)).fail(function(err) {
                // tell me if login did not work!
                that.log("Error during Login:", err);
            });
        });
        //      }.bind(this)).fail(function(err) {
        //          this.log('PU Failed:', err);
        //      });

        updating = false;
    }
}

// give this function all the parameters needed
function tccThermostatAccessory(log, name, deviceData, username, password, deviceID, debug) {
    this.name = name;
    this.device = deviceData;
    //this.model = device.thermostatModelType;
    //this.serial = device.deviceID;
    //this.deviceId = deviceId;

    this.username = username;
    this.password = password;
    this.deviceID = deviceID;
    this.debug = debug;

    this.log = log;
}

function toTCCTemperature(that, temperature) {
    switch (that.device.latestData.uiData.DisplayUnits) {
        case "F":
            return ((temperature * 9 / 5) + 32).toFixed(1);
            break;
        default:
            return temperature;
    }

}

function toHBTemperature(that, temperature) {
    // homekit only deals with Celsius

    switch (that.device.latestData.uiData.DisplayUnits) {
        case "F":
            return ((temperature - 32) * 5 / 9).toFixed(1);
            break;
        default:
            return temperature;
    }

}

function toHomeBridgeHeatingCoolingSystem(heatingCoolingSystem) {
    switch (heatingCoolingSystem) {
        case 1:
            // heat
            return Characteristic.TargetHeatingCoolingState.HEAT;
            break;
        case 2:
            // off
            return Characteristic.TargetHeatingCoolingState.OFF;
            break;
        case 3:
            // cool
            return Characteristic.TargetHeatingCoolingState.COOL;
            break;
        case 4:
            // auto
            return Characteristic.TargetHeatingCoolingState.AUTO;
            break;
        default:
            return Characteristic.TargetHeatingCoolingState.OFF;
    }
}

function toTCCHeadingCoolingSystem(heatingCoolingSystem) {
    switch (heatingCoolingSystem) {
        case Characteristic.TargetHeatingCoolingState.OFF:
            // off
            return 2;
            break;
        case Characteristic.TargetHeatingCoolingState.HEAT:
            // heat
            return 1
            break;
        case Characteristic.TargetHeatingCoolingState.COOL:
            // cool
            return 3
            break;
        case Characteristic.TargetHeatingCoolingState.AUTO:
            // auto
            return 4
            break;
        default:
            return 0;
    }
}

function isEmptyObject(obj) {
    var name;
    for (name in obj) {
        return false;
    }
    return true;
};

function diff(obj1, obj2) {
    var result = {};
    var change;
    for (var key in obj1) {
        if (typeof obj2[key] == 'object' && typeof obj1[key] == 'object') {
            change = diff(obj1[key], obj2[key]);
            if (isEmptyObject(change) === false) {
                result[key] = change;
            }
        } else if (obj2[key] != obj1[key]) {
            result[key] = obj2[key];
        }
    }
    return result;
};

function deepEquals(o1, o2) {
    return JSON.stringify(o1) === JSON.stringify(o2);
}


tccThermostatAccessory.prototype = {

    getName: function(callback) {

        var that = this;
        that.log("requesting name of", this.name);
        callback(this.name);

    },

    getCurrentRelativeHumidity: function(callback) {
        var that = this;

        var currentRelativeHumidity = this.device.latestData.uiData.IndoorHumidity;
        callback(null, Number(currentRelativeHumidity));
        that.log("Current relative humidity of " + this.name + " is " + currentRelativeHumidity + "%");
    },

    // This is showing what the HVAC unit is doing

    getCurrentHeatingCoolingState: function(callback) {
        var that = this;
        // OFF  = 0
        // HEAT = 1
        // COOL = 2

        // EquipmentOutputStatus is 1 when HVAC is running in heat mode, and 2
        // when running in cool mode

        var CurrentHeatingCoolingState = this.device.latestData.uiData.EquipmentOutputStatus;
        that.log("getCurrentHeatingCoolingState is ", CurrentHeatingCoolingState);
        if (CurrentHeatingCoolingState > 2)
        // Maximum value is 2
            CurrentHeatingCoolingState = 2;
        callback(null, Number(CurrentHeatingCoolingState));
    },

    // This is to change the system switch to a different position

    setTargetHeatingCooling: function(value, callback) {
        var that = this;
        if (!updating) {
            updating = true;


            that.log("Setting system switch for", this.name, "to", value);
            // TODO:
            // verify that the task did succeed

            tcc.login(this.username, this.password, this.deviceID).then(function(session) {
                session.setSystemSwitch(that.deviceID, toTCCHeadingCoolingSystem(value)).then(function(taskId) {
                    that.log("Successfully changed system!");
                    that.log(taskId);
                    // Update all information
                    // TODO: call periodicUpdate to refresh all data elements
                    var t = updateValues(that);
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
    // This is to read the system switch

    getTargetHeatingCooling: function(callback) {
        var that = this;

        // Homekit allowed values
        // OFF  = 0
        // HEAT = 1
        // COOL = 2
        // AUTO = 3

        var TargetHeatingCooling = toHomeBridgeHeatingCoolingSystem(this.device.latestData.uiData.SystemSwitchPosition);

        this.log("getTargetHeatingCooling is ", TargetHeatingCooling);

        callback(null, Number(TargetHeatingCooling));

    },

    getCurrentTemperature: function(callback) {
        var that = this;

        var currentTemperature = toHBTemperature(this, this.device.latestData.uiData.DispTemperature);
        that.log("Current temperature of " + this.name + " is " + currentTemperature + "°");

        callback(null, Number(currentTemperature));
    },

    setTargetTemperature: function(value, callback) {
        var that = this;
        if (!updating) {
            updating = true;

            //    maxValue: 38,
            //    minValue: 10,

            that.log("Setting target temperature for", this.name, "to", value + "°");
            var minutes = 10; // The number of minutes the new target temperature will be effective

            if (value < 10)
                value = 10;

            if (value > 38)
                value = 38;

            value = toTCCTemperature(that, value);
            // TODO:
            // verify that the task did succeed

            tcc.login(this.username, this.password, this.deviceID).then(function(session) {
                var heatSetPoint, coolSetPoint = null;
                switch (toHomeBridgeHeatingCoolingSystem(that.device.latestData.uiData.SystemSwitchPosition)) {
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
                session.setHeatCoolSetpoint(that.deviceID, heatSetPoint, coolSetPoint).then(function(taskId) {
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
            updating = false;
        }
    },

    getTargetTemperature: function(callback) {
        var that = this;

        //    maxValue: 38,
        //    minValue: 10,
        // Homebridge expects temperatures in C, but Honeywell will return F if configured.

        if (this.model = "EMEA_ZONE") {
            switch (toHomeBridgeHeatingCoolingSystem(that.device.latestData.uiData.SystemSwitchPosition)) {
                case 0:
                    var targetTemperature = 10;
                    break;
                case 1:
                    var targetTemperature = toHBTemperature(that, this.device.latestData.uiData.HeatSetpoint);
                    break;
                case 2:
                    var targetTemperature = toHBTemperature(that, this.device.latestData.uiData.CoolSetpoint);
                    break;
                case 3:
                    // Not sure what to do here, so will display 10
                    var targetTemperature = 10;
                    break;
                default:
                    // Not sure what to do here, so will display 10
                    var targetTemperature = 10;
                    break
            }

            //        that.log("Device type is: " + this.model + ". Target temperature should be there.");
            that.log("Target temperature for", this.name, "is", targetTemperature + "°");
        } else {
            var targetTemperature = 0;
            that.log("Device type is: " + this.model + ". Target temperature is probably NOT there (this is normal).");
            that.log("Will set target temperature for", this.name, "to " + targetTemperature + "°");
        }

        if (targetTemperature < 10)
            targetTemperature = 10;

        if (targetTemperature > 38)
            targetTemperature = 38;
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

    getCoolingThresholdTemperature: function(callback) {
        var that = this;

        var coolingthresholdTemperature = toHBTemperature(this, this.device.latestData.uiData.CoolSetpoint);
        that.log("Cool Setpoint temperature of " + this.name + " is " + coolingthresholdTemperature + "°");

        callback(null, Number(coolingthresholdTemperature));
    },

    getHeatingThresholdTemperature: function(callback) {
        var that = this;

        var heatingthresholdTemperature = toHBTemperature(this, this.device.latestData.uiData.HeatSetpoint);
        that.log("Heat Setpoint temperature of " + this.name + " is " + heatingthresholdTemperature + "°");

        callback(null, Number(heatingthresholdTemperature));
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
            .on('get', this.getTargetHeatingCooling.bind(this))
            .on('set', this.setTargetHeatingCooling.bind(this));

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
        if (this.device.latestData.uiData.SwitchAutoAllowed) {
            // Only available on models with an Auto Mode
            this.thermostatService
                .getCharacteristic(Characteristic.CoolingThresholdTemperature)
                .on('get', this.getCoolingThresholdTemperature.bind(this));

            // this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
            this.thermostatService
                .getCharacteristic(Characteristic.HeatingThresholdTemperature)
                .on('get', this.getHeatingThresholdTemperature.bind(this));
        }
        // this.addOptionalCharacteristic(Characteristic.Name);
        this.thermostatService
            .getCharacteristic(Characteristic.Name)
            .on('get', this.getName.bind(this));

        return [informationService, this.thermostatService];

    }
}
