'use strict';

/**
 * HomeKit Characteristic Handlers
 *
 * These functions handle getting and setting characteristic values
 * for thermostat accessories. They are bound to accessory instances
 * and use the accessory's platform reference.
 */

const { handleRefreshError } = require('./errorHandler');

/**
 * Getter: Target Temperature
 */
function getTargetTemperature(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const service = this.getService(this.platform.api.hap.Service.Thermostat);
    const characteristic = service.getCharacteristic(this.platform.api.hap.Characteristic.TargetTemperature);
    const value = this.platform.normalizeCharacteristicValue(this, characteristic, device.TargetTemperature);
    callback(null, value);
  }).catch((error) => handleRefreshError(callback, error));
}

/**
 * Getter: Current Temperature
 */
function getCurrentTemperature(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const value = device.CurrentTemperature;
    callback(null, value === undefined ? null : value);
  }).catch((error) => handleRefreshError(callback, error));
}

/**
 * Getter: Current Relative Humidity
 */
function getCurrentRelativeHumidity(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const value = device.InsideHumidity;
    if (value === undefined || value === null || value === 128) {
      callback(null, null);
    } else {
      callback(null, value);
    }
  }).catch((error) => handleRefreshError(callback, error));
}

/**
 * Getter: Target Heating Cooling State
 */
function getTargetHeatingCooling(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    callback(null, device.TargetHeatingCoolingState);
  }).catch((error) => handleRefreshError(callback, error));
}

/**
 * Getter: Current Heating Cooling State
 */
function getCurrentHeatingCooling(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    callback(null, device.CurrentHeatingCoolingState);
  }).catch((error) => handleRefreshError(callback, error));
}

/**
 * Getter: Heating Threshold Temperature
 */
function getHeatingThresholdTemperature(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const service = this.getService(this.platform.api.hap.Service.Thermostat);
    const characteristic = service.getCharacteristic(this.platform.api.hap.Characteristic.HeatingThresholdTemperature);
    const value = this.platform.normalizeCharacteristicValue(this, characteristic, device.HeatingThresholdTemperature);
    callback(null, value);
  }).catch((error) => handleRefreshError(callback, error));
}

/**
 * Getter: Cooling Threshold Temperature
 */
function getCoolingThresholdTemperature(callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const service = this.getService(this.platform.api.hap.Service.Thermostat);
    const characteristic = service.getCharacteristic(this.platform.api.hap.Characteristic.CoolingThresholdTemperature);
    const value = this.platform.normalizeCharacteristicValue(this, characteristic, device.CoolingThresholdTemperature);
    callback(null, value);
  }).catch((error) => handleRefreshError(callback, error));
}

/**
 * Getter: Sensor Temperature (generic for any temperature property)
 */
function getSensorTemperature(property, callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const value = device[property];
    callback(null, value === undefined ? null : value);
  }).catch((error) => handleRefreshError(callback, error));
}

/**
 * Getter: Sensor Humidity (generic for any humidity property)
 */
function getSensorHumidity(property, callback) {
  this.platform.refreshAccessoryState(this).then((device) => {
    const value = device[property];
    callback(null, value === undefined ? null : value);
  }).catch((error) => handleRefreshError(callback, error));
}

/**
 * Setter: Target Temperature
 */
function setTargetTemperature(value, callback) {
  const service = this.getService(this.platform.api.hap.Service.Thermostat);
  const characteristic = service.getCharacteristic(this.platform.api.hap.Characteristic.TargetTemperature);
  const normalizedValue = this.platform.normalizeCharacteristicValue(this, characteristic, value);
  const logger = (this.logger && typeof this.logger.info === 'function') ? this.logger : (this.platform && this.platform.logger);
  if (Math.abs(normalizedValue - value) > 0.05) {
    if (logger) {
      logger.debug('Adjusted target temperature for %s from %s° to %s°', this.displayName, value, normalizedValue);
    }
  } else {
    if (logger) {
      logger.info('Setting target temperature for %s to %s°', this.displayName, normalizedValue);
    }
  }
  characteristic.updateValue(normalizedValue);
  this.context.logEventCounter = 9;
  const changeThermostat = this.platform.getChangeThermostat(this);
  changeThermostat.put({
    TargetTemperature: normalizedValue
  }).then(() => {
    callback(null);
  }).catch((error) => {
    callback(error);
  });
}

/**
 * Setter: Target Heating Cooling State
 */
function setTargetHeatingCooling(value, callback) {
  const logger = (this.logger && typeof this.logger.info === 'function') ? this.logger : (this.platform && this.platform.logger);
  if (logger) {
    logger.info('Setting target heating/cooling state for %s to %s', this.displayName, value);
  }
  this.context.logEventCounter = 9;
  const changeThermostat = this.platform.getChangeThermostat(this);
  changeThermostat.put({
    TargetHeatingCooling: value
  }).then(() => {
    callback(null);
  }).catch((error) => {
    callback(error);
  });
}

/**
 * Setter: Heating Threshold Temperature
 */
function setHeatingThresholdTemperature(value, callback) {
  const service = this.getService(this.platform.api.hap.Service.Thermostat);
  const characteristic = service.getCharacteristic(this.platform.api.hap.Characteristic.HeatingThresholdTemperature);
  const normalizedValue = this.platform.normalizeCharacteristicValue(this, characteristic, value);
  const logger = (this.logger && typeof this.logger.info === 'function') ? this.logger : (this.platform && this.platform.logger);
  if (Math.abs(normalizedValue - value) > 0.05) {
    if (logger) {
      logger.debug('Adjusted heating threshold for %s from %s to %s', this.displayName, value, normalizedValue);
    }
  } else {
    if (logger) {
      logger.info('Setting heating threshold for %s to %s', this.displayName, normalizedValue);
    }
  }
  characteristic.updateValue(normalizedValue);
  const changeThermostat = this.platform.getChangeThermostat(this);
  changeThermostat.put({
    HeatingThresholdTemperature: normalizedValue
  }).then(() => {
    callback(null);
  }).catch((error) => {
    callback(error);
  });
}

/**
 * Setter: Cooling Threshold Temperature
 */
function setCoolingThresholdTemperature(value, callback) {
  const service = this.getService(this.platform.api.hap.Service.Thermostat);
  const characteristic = service.getCharacteristic(this.platform.api.hap.Characteristic.CoolingThresholdTemperature);
  const normalizedValue = this.platform.normalizeCharacteristicValue(this, characteristic, value);
  const logger = (this.logger && typeof this.logger.info === 'function') ? this.logger : (this.platform && this.platform.logger);
  if (Math.abs(normalizedValue - value) > 0.05) {
    if (logger) {
      logger.debug('Adjusted cooling threshold for %s from %s to %s', this.displayName, value, normalizedValue);
    }
  } else {
    if (logger) {
      logger.info('Setting cooling threshold for %s to %s', this.displayName, normalizedValue);
    }
  }
  characteristic.updateValue(normalizedValue);
  const changeThermostat = this.platform.getChangeThermostat(this);
  changeThermostat.put({
    CoolingThresholdTemperature: normalizedValue
  }).then(() => {
    callback(null);
  }).catch((error) => {
    callback(error);
  });
}

module.exports = {
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
};
