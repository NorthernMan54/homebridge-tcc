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
var tcc = require('./lib/tcc.js');
var Accessory, Service, Characteristic, UUIDGen, CommunityTypes;

var myAccessories = [];
var session; // reuse the same login session
var updating; // Only one change at a time!!!!

module.exports = function(homebridge) {

    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-tcc", "tcc", tccPlatform);
}

function tccPlatform(log, config, api) {

    this.username = config['username'];
    this.password = config['password'];
    this.refresh = config['refresh'] || 60; // Update every minute
    this.log = log;
    this.devices = config['devices'];

    updating = false;
}

tccPlatform.prototype = {
    accessories: function(callback) {
        this.log("Logging into tcc...");
        var that = this;

        tcc.setCharacteristic(Characteristic);

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
                                    deviceData, that.username, that.password, device.deviceID);
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
                setInterval(that.periodicUpdate.bind(this), this.refresh * 1000);

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
        .getValue();
    service.getCharacteristic(Characteristic.CurrentTemperature)
        .getValue();
    service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .getValue();
    service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .getValue();
    if (data.latestData.uiData.IndoorHumiditySensorAvailable && data.latestData.uiData.IndoorHumiditySensorNotFault)
        service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .getValue();
    if (data.latestData.uiData.SwitchAutoAllowed) {
        service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .getValue();
        service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .getValue();
    }

}

tccPlatform.prototype.periodicUpdate = function(t) {
    this.log("periodicUpdate");
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
                debug("Update Values", accessory.name, deviceData);
                // Data is live

                if (deviceData.deviceLive) {
                    //                    that.log("updateValues: Device reachable", accessory.name);
                    //                    accessory.newAccessory.updateReachability(true);
                } else {
                    that.log("updateValues: Device not reachable", accessory.name);
                    //                    accessory.newAccessory.updateReachability(false);
                }

                if (!tcc.deepEquals(deviceData, accessory.device)) {
                    that.log("Change", accessory.name, tcc.diff(accessory.device, deviceData));
                    accessory.device = deviceData;
                    updateStatus(accessory.thermostatService, deviceData);

                } else {
                    that.log("No change", accessory.name);
                }
            }
        });
    });
}

// give this function all the parameters needed

function tccAccessory(log, name, deviceData, username, password, deviceID) {

    var uuid = UUIDGen.generate(name);

    this.newAccessory = new Accessory(name, uuid);

    //    newAccessory.name = name;

    this.log = log;
    this.log("Adding TCC Device", name, deviceID);
    this.name = name;
    this.device = deviceData;
    this.device.deviceLive = "false";
    this.username = username;
    this.password = password;
    this.deviceID = deviceID;
    //    return newAccessory;
}

tccAccessory.prototype = {

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
        that.log("getCurrentHeatingCoolingState is", CurrentHeatingCoolingState, this.name);
        if (CurrentHeatingCoolingState > 2)
            // Maximum value is 2
            CurrentHeatingCoolingState = 2;
        //        if (this.newAccessory.reachable) {
        callback(null, Number(CurrentHeatingCoolingState));
        //        } else {
        //            that.log("getCurrentHeatingCoolingState: Device not reachable");
        //            callback(new Error("Device not reachable"));
        //        }
    },

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
                    // Update all information
                    // TODO: call periodicUpdate to refresh all data elements
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
    // This is to read the system switch

    getTargetHeatingCooling: function(callback) {
        var that = this;

        // Homekit allowed values
        // OFF  = 0
        // HEAT = 1
        // COOL = 2
        // AUTO = 3

        var TargetHeatingCooling = tcc.toHomeBridgeHeatingCoolingSystem(this.device.latestData.uiData.SystemSwitchPosition);

        this.log("getTargetHeatingCooling is ", TargetHeatingCooling, this.name);

        callback(null, Number(TargetHeatingCooling));

    },

    getCurrentTemperature: function(callback) {
        var that = this;

        var currentTemperature = tcc.toHBTemperature(this, this.device.latestData.uiData.DispTemperature);
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
            session.setHeatCoolSetpoint(that.deviceID, heatSetPoint, coolSetPoint).then(function(taskId) {
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

    getTargetTemperature: function(callback) {
        var that = this;

        //    maxValue: 38,
        //    minValue: 10,
        // Homebridge expects temperatures in C, but Honeywell will return F if configured.

        if (this.model = "EMEA_ZONE") {
            switch (tcc.toHomeBridgeHeatingCoolingSystem(that.device.latestData.uiData.SystemSwitchPosition)) {
                case Characteristic.TargetHeatingCoolingState.OFF:
                    // Not sure what to do here, so will display current temperature
                    var targetTemperature = tcc.toHBTemperature(that, this.device.latestData.uiData.DispTemperature);
                    break;
                case Characteristic.TargetHeatingCoolingState.HEAT:
                    var targetTemperature = tcc.toHBTemperature(that, this.device.latestData.uiData.HeatSetpoint);
                    break;
                case Characteristic.TargetHeatingCoolingState.COOL:
                    var targetTemperature = tcc.toHBTemperature(that, this.device.latestData.uiData.CoolSetpoint);
                    break;
                case Characteristic.TargetHeatingCoolingState.AUTO:
                    // Not sure what to do here, so will display current temperature
                    var targetTemperature = tcc.toHBTemperature(that, this.device.latestData.uiData.DispTemperature);
                    break;
                default:
                    // Not sure what to do here, so will display current temperature
                    var targetTemperature = tcc.toHBTemperature(that, this.device.latestData.uiData.DispTemperature);
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
        that.log("getTemperatureDisplayUnits", this.name);
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

        var coolingthresholdTemperature = tcc.toHBTemperature(this, this.device.latestData.uiData.CoolSetpoint);
        that.log("Cool Setpoint temperature of " + this.name + " is " + coolingthresholdTemperature + "°");

        callback(null, Number(coolingthresholdTemperature));
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
                session.setHeatCoolSetpoint(that.deviceID, null, value).then(function(taskId) {
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

    getHeatingThresholdTemperature: function(callback) {
        var that = this;

        var heatingthresholdTemperature = tcc.toHBTemperature(this, this.device.latestData.uiData.HeatSetpoint);
        that.log("Heat Setpoint temperature of " + this.name + " is " + heatingthresholdTemperature + "°");

        callback(null, Number(heatingthresholdTemperature));
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
            .setCharacteristic(Characteristic.Manufacturer, "Honeywell")
            .setCharacteristic(Characteristic.SerialNumber, this.deviceID); // need to stringify the this.serial
        // Thermostat Service
        this.thermostatService = new Service.Thermostat(this.name);

        // Required Characteristics /////////////////////////////////////////////////////////////
        // this.addCharacteristic(Characteristic.CurrentHeatingCoolingState); READ
        this.thermostatService
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', this.getCurrentHeatingCoolingState.bind(this));

        // this.addCharacteristic(Characteristic.TargetHeatingCoolingState); READ WRITE

        if (this.device.latestData.uiData.SwitchAutoAllowed) {
            this.thermostatService
                .getCharacteristic(Characteristic.TargetHeatingCoolingState)
                .on('get', this.getTargetHeatingCooling.bind(this))
                .on('set', this.setTargetHeatingCooling.bind(this));
        } else {
            // don't display Auto if it isn't supported
            this.thermostatService
                .getCharacteristic(Characteristic.TargetHeatingCoolingState)
                .setProps({
                    validValues: [0, 1, 2]
                })
                .on('get', this.getTargetHeatingCooling.bind(this))
                .on('set', this.setTargetHeatingCooling.bind(this));
        }



        // this.addCharacteristic(Characteristic.CurrentTemperature); READ
        this.thermostatService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({
                minValue: -100,
                maxValue: 100
            })
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
                .on('get', this.getCoolingThresholdTemperature.bind(this))
                .on('set', this.setCoolingThresholdTemperature.bind(this))

            // this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
            this.thermostatService
                .getCharacteristic(Characteristic.HeatingThresholdTemperature)
                .on('get', this.getHeatingThresholdTemperature.bind(this))
                .on('set', this.setHeatingThresholdTemperature.bind(this));
        }
        // this.addOptionalCharacteristic(Characteristic.Name);
        this.thermostatService
            .getCharacteristic(Characteristic.Name)
            .on('get', this.getName.bind(this));

        return [informationService, this.thermostatService];

    }
}
