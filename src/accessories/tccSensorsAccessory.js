'use strict';

/**
 * TCC Sensors Accessory
 *
 * This class manages the "Outside Sensors" accessory which provides
 * outside temperature and humidity readings from the thermostat.
 */

const os = require("os");
const hostname = os.hostname();
const { registerManagedService, unregisterManagedService, pruneUnsupportedServices } = require('../helpers/serviceManager');
const { getSensorTemperature, getSensorHumidity } = require('../handlers/characteristicHandlers');
const FirmwareRevision = require('../../package.json').version;

class TccSensorsAccessory {
  constructor(platform, device, Accessory, Service, Characteristic, UUIDGen, FakeGatoHistoryService) {
    this.platform = platform;
    this.logger = platform.logger.child(['Outside', device.Name || 'Sensors']);
    this.name = "Outside Sensors";
    this.ThermostatID = device.ThermostatID;
    this.device = device;
    this.storage = platform.storage;
    this.refresh = platform.refresh;
    const uuid = UUIDGen.generate(this.name + " - TCC");

    if (!platform.getAccessoryByName(this.name)) {
      this.logger.info('Adding outside sensors accessory (deviceID=%s)', this.ThermostatID);
      this.accessory = new Accessory(this.name, uuid, 10);
      this.accessory.logger = this.logger;
      this.accessory.log = this.logger.info.bind(this.logger);
      this.accessory.context.ThermostatID = device.ThermostatID;
      this.accessory.context.name = this.name;
      this.accessory.context.logEventCounter = 9; // Update fakegato on startup
      this.accessory.platform = platform;

      pruneUnsupportedServices(this.accessory, this.logger, Service);

      this.accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, "TCC")
        .setCharacteristic(Characteristic.Model, device.Model)
        .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
        .setCharacteristic(Characteristic.FirmwareRevision, FirmwareRevision);

      // create outside temp sensor
      this.logger.debug('Configuring outside temperature sensor for %s', this.name);
      this.OutsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, "Outside Temperature", "Outside");
      registerManagedService(this.accessory, this.OutsideTemperatureService);
      this.OutsideTemperatureService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          minValue: -100, // If you need this, you have major problems!!!!!
          maxValue: 100
        })
        .on('get', getSensorTemperature.bind(this.accessory, 'OutsideTemperature'));

      // Check for invalid humidity value
      if (this.device.OutsideHumidity === 128) {
        this.logger.debug('Invalid outside humidity value for %s (%s)', this.device.Name, this.device.ThermostatID);
      } else {
        // create outside humidity sensor
        this.logger.debug('Configuring outside humidity sensor for %s', this.name);
        this.OutsideHumidityService = this.accessory.addService(Service.HumiditySensor, "Outside Humidity", "Outside");
        registerManagedService(this.accessory, this.OutsideHumidityService);
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
      this.logger.info('Restoring outside sensors accessory (deviceID=%s)', this.ThermostatID);

      // need to check if accessory/zone/thermostat already exists, but user added temp/humidity sensors then must declare
      this.accessory = platform.getAccessoryByName(this.name);
      this.accessory.logger = this.logger;
      this.accessory.log = this.logger.info.bind(this.logger);
      this.accessory.platform = platform;
      pruneUnsupportedServices(this.accessory, this.logger, Service);
      if (!this.accessory.getService("Outside Temperature")) {
        this.logger.debug('Adding outside temperature sensor service');
        this.OutsideTemperatureService = this.accessory.addService(Service.TemperatureSensor, "Outside Temperature", "Outside");
        registerManagedService(this.accessory, this.OutsideTemperatureService);

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
        this.logger.debug('Invalid outside humidity value for %s (%s)', this.device.Name, this.device.ThermostatID);

        if (this.accessory.getService("Outside Humidity")) {
          const humiditySvc = this.accessory.getService("Outside Humidity");
          unregisterManagedService(this.accessory, humiditySvc);
          this.accessory.removeService(humiditySvc);
        }
      } else {
        if (!this.accessory.getService("Outside Humidity")) {
          this.logger.debug('Adding outside humidity sensor service');
          this.OutsideHumidityService = this.accessory.addService(Service.HumiditySensor, "Outside Humidity", "Outside");
          registerManagedService(this.accessory, this.OutsideHumidityService);

          this.OutsideHumidityService
            .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .on('get', getSensorHumidity.bind(this.accessory, 'OutsideHumidity'));
        }
      }
      return this.accessory;
    }
  }
}

module.exports = TccSensorsAccessory;
