'use strict';

/**
 * TCC Thermostat Accessory
 *
 * This class manages the main thermostat accessory and its services
 * (thermostat, temperature sensor, humidity sensor).
 */

const os = require("os");
const hostname = os.hostname();
const { registerManagedService, unregisterManagedService, pruneUnsupportedServices } = require('../helpers/serviceManager');
const {
  getTargetTemperature,
  getCurrentTemperature,
  getCurrentRelativeHumidity,
  getTargetHeatingCooling,
  getCurrentHeatingCooling,
  getHeatingThresholdTemperature,
  getCoolingThresholdTemperature,
  getSensorTemperature,
  getSensorHumidity,
  setTargetTemperature,
  setTargetHeatingCooling,
  setHeatingThresholdTemperature,
  setCoolingThresholdTemperature
} = require('../handlers/characteristicHandlers');
const ChangeThermostat = require('../helpers/changeThermostat');
const FirmwareRevision = require('../../package.json').version;

class TccAccessory {
  constructor(platform, device, sensors, Accessory, Service, Characteristic, UUIDGen, CustomCharacteristics, FakeGatoHistoryService) {
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

      pruneUnsupportedServices(this.accessory, this.logger, Service);

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
      pruneUnsupportedServices(this.accessory, this.logger, Service);
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

module.exports = TccAccessory;
