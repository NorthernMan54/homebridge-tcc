const soapRequest = require('easy-soap-request');
const { XMLBuilder, XMLParser } = require('fast-xml-parser');
const tccMessage = require('./tccMessage.js');
const debug = require('debug')('tcc-lib');
const { default: PQueue } = require('p-queue');

const queue = new PQueue({ concurrency: 1 });

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '$t',
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '$t',
  format: false,
  suppressEmptyNode: true
});

let count = 0;
const queueLogger = debug.extend('queue');
queue.on('active', () => {
  queueLogger(`Working on item #${++count}. Size: ${queue.size} Pending: ${queue.pending}`);
});

const URL = 'https://TCCNA.resideo.com/ws/MobileV2.asmx';

const HEADER = {
  'user-agent': 'TCCStageC/1092 CFNetwork/1125.2 Darwin/19.4.0',
  'Content-Type': 'text/xml;charset=UTF-8',
  'ADRUM': 'isAjax:true',
  'Accept': '*/*',
  'Accept-Language': 'en-ca',
  'Accept-Encoding': 'gzip, deflate, br',
  'ADRUM_1': 'isMobile:true'
};

module.exports = {
  tcc: tcc
};

function tcc(options) {
  if (options.debug) {
    debug.enabled = true;
  }
  this.logger = options.logger ? options.logger.child(['API']) : null;
  this.logDebug = (...args) => {
    if (this.logger) {
      this.logger.debug(...args);
    } else {
      debug(...args);
    }
  };
  this.logInfo = (...args) => {
    if (this.logger) {
      this.logger.info(...args);
    } else {
      console.log(...args);
    }
  };
  this.logError = (...args) => {
    if (this.logger) {
      this.logger.error(...args);
    } else {
      console.error(...args);
    }
  };
  this.logDebug('Setting up TCC component');
  this._username = options.username;
  this._password = options.password;
  this._refresh = options.refresh;
  this.sessionID = null;
  this.timeout = 10000; // SOAP request timeout
  this.usePermanentHolds = options.usePermanentHolds;
  this.desiredState = {};
  this.thermostats = {};
}

// Public interface to login and read all thermostats

tcc.prototype.pollThermostat = function() {
  return queue.add(async () => {
    try {
      if (!this.sessionID) {
        this.sessionID = await this._login();
        this.logDebug("TCC - Login Succeeded");
      }
      var current = await this._GetLocationListData(true);
      if (this.thermostats.LocationInfo && current.LocationInfo) {
        this.logDebug("pollThermostat - delta", JSON.stringify(tccMessage.diff(this.thermostats, current), null, 2));
      }
      // Validate all thermostats before storing
      if (current.hb) {
        for (const id in current.hb) {
          try {
            tccMessage.validateThermostatData(current.hb[id], `pollThermostat ID:${id}`);
          } catch (err) {
            this.logError(`Validation failed for thermostat ${id}: %s`, err.message);
          }
        }
      }
      // Preserve LastPhysicalHeatMode across updates
      if (this.thermostats && this.thermostats.hb && current.hb) {
        for (const id in current.hb) {
          if (this.thermostats.hb[id] && this.thermostats.hb[id].LastPhysicalHeatMode !== undefined) {
            // Preserve existing heat mode preference if not updated in current poll
            if (current.hb[id].LastPhysicalHeatMode === undefined) {
              current.hb[id].LastPhysicalHeatMode = this.thermostats.hb[id].LastPhysicalHeatMode;
              this.logDebug("Preserved LastPhysicalHeatMode=%s for thermostat %s", current.hb[id].LastPhysicalHeatMode, id);
            }
          }
        }
      }
      this.thermostats = current;
      return (current);
    } catch (err) {
      this.logError('pollThermostat Error: %s', err.message);
      this.logDebug("pollThermostat", err);
      throw err;
    }
  });
};

// Public interface to login and update specific thermostat settings

tcc.prototype.ChangeThermostat = function(desiredState) {
  // this.logDebug("ChangeThermostat()", desiredState);
  return queue.add(async () => {
    let updateSucceeded = false;
    let commTaskSucceeded = false;

    try {
      if (!this.sessionID) {
        this.sessionID = await this._login();
        this.logDebug("TCC - Login Succeeded");
        this.thermostats = await this._GetLocationListData(true);
      }

      var CommTaskID = await this._UpdateThermostat(desiredState, true);
      updateSucceeded = true; // Update was sent successfully
      this.logDebug("TCC - Update thermostat succeeded, CommTaskID:", CommTaskID);

      await this._GetCommTaskState(CommTaskID);
      commTaskSucceeded = true; // Server confirmed the change
      this.logDebug("TCC - CommTask confirmed");

      var thermostat = await this._GetThermostat(desiredState.ThermostatID);
      this.logDebug("TCC - Retrieved updated thermostat data");
      tccMessage.validateThermostatData(thermostat, 'ChangeThermostat result');
      return (thermostat);
    } catch (err) {
      this.logError('ChangeThermostat Error: %s', err.message);

      // If update succeeded but we just failed to get fresh data back
      if (updateSucceeded && commTaskSucceeded) {
        this.logDebug("Update succeeded but failed to retrieve fresh data, using optimistic update");
        // Return cached data with optimistic update
        const cached = this.thermostats.hb[desiredState.ThermostatID];
        if (cached) {
          // Apply the changes we know were made
          const optimistic = Object.assign({}, cached);
          if (desiredState.TargetTemperature !== undefined) {
            optimistic.TargetTemperature = desiredState.TargetTemperature;
          }
          if (desiredState.HeatingThresholdTemperature !== undefined) {
            optimistic.HeatingThresholdTemperature = desiredState.HeatingThresholdTemperature;
          }
          if (desiredState.CoolingThresholdTemperature !== undefined) {
            optimistic.CoolingThresholdTemperature = desiredState.CoolingThresholdTemperature;
          }
          if (desiredState.TargetHeatingCooling !== undefined) {
            optimistic.TargetHeatingCoolingState = desiredState.TargetHeatingCooling;
            // If setting to heat mode, preserve the heat mode type that was used
            if (desiredState.TargetHeatingCooling === 1 && cached.LastPhysicalHeatMode !== undefined) {
              optimistic.LastPhysicalHeatMode = cached.LastPhysicalHeatMode;
            }
          }
          // Mark for refresh on next poll
          this.logDebug("Returning optimistic data, will refresh on next poll");
          return optimistic;
        }
      }

      this.sessionID = null;
      throw err;
    }
  });
};

// Public interface to retrieve a single thermostat snapshot

tcc.prototype.getThermostatSnapshot = function(ThermostatID) {
  return queue.add(async () => {
    try {
      if (!this.sessionID) {
        this.sessionID = await this._login();
        this.logDebug("TCC - Login Succeeded");
      }
      const thermostat = await this._GetThermostat(ThermostatID);
      tccMessage.validateThermostatData(thermostat, `getThermostatSnapshot ID:${ThermostatID}`);
      return thermostat;
    } catch (err) {
      this.logError('getThermostatSnapshot Error: %s', err.message);
      this.sessionID = null;
      throw err;
    }
  });
};

// private interface to update thermostat settings

tcc.prototype._UpdateThermostat = function(desiredState, withRetry) {
  this.logDebug("_UpdateThermostat()", desiredState);
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        if (!this.sessionID) {
          this.sessionID = await this._login();
        }
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/ChangeThermostatUI';

        // Get cached thermostat data
        const cachedThermostat = this.thermostats.hb[desiredState.ThermostatID];

        // Inject persisted LastPhysicalHeatMode from desiredState (comes from accessory context)
        // This ensures the preference persists across Homebridge restarts
        if (desiredState.LastPhysicalHeatMode !== undefined && cachedThermostat) {
          cachedThermostat.LastPhysicalHeatMode = desiredState.LastPhysicalHeatMode;
          this.logDebug("Using persisted LastPhysicalHeatMode=%s for thermostat %s", desiredState.LastPhysicalHeatMode, desiredState.ThermostatID);
        }

        const message = '<?xml version="1.0" encoding="utf-8"?>' + xmlBuilder.build(tccMessage.soapMessage(tccMessage.ChangeThermostatMessage(this.sessionID, desiredState, cachedThermostat, this.usePermanentHolds)));
        this.logDebug("_UpdateThermostat: SOAP Message", message, this.sessionID, desiredState, cachedThermostat, this.usePermanentHolds);
        const { response } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        if (response.statusCode === 200) {
          const parsedResponse = xmlParser.parse(response.body);
          const ChangeThermostat = parsedResponse["soap:Envelope"]["soap:Body"].ChangeThermostatUIResponse.ChangeThermostatUIResult;
          // this.logDebug("_UpdateThermostat", ChangeThermostat);
          if (ChangeThermostat.Result === "Success") {
            this.logDebug("Success: _UpdateThermostat %s", ChangeThermostat, message);
            resolve(ChangeThermostat.CommTaskID);
          } else {
            this.sessionID = null;
            this.logDebug("ERROR: _UpdateThermostat %s", ChangeThermostat.Result, message);
            if (withRetry) {
              try {
                const CommTaskID = await this._UpdateThermostat(desiredState, false);
                resolve(CommTaskID);
              } catch (err) {
                this.logDebug("ERROR: _UpdateThermostat retry");
                reject(err);
              }
            } else {
              reject(new Error("ERROR: _UpdateThermostat (200) " + ChangeThermostat.Result));
            }
          }
        } else {
          this.logDebug("ERROR: _UpdateThermostat %s", response, message);
          reject(new Error("ERROR: _UpdateThermostat (!200)"));
        }
      } catch (err) {
        this.logDebug("_UpdateThermostat message", xmlBuilder.build(tccMessage.soapMessage(tccMessage.ChangeThermostatMessage(this.sessionID, desiredState, this.thermostats.hb[desiredState.ThermostatID], this.usePermanentHolds))));
        reject(err);
        this.sessionID = null;
      }
    })();
  });
};

// private interface to login to TCC

tcc.prototype._login = async function() {
  HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/AuthenticateUserLogin';
  const message = '<?xml version="1.0" encoding="utf-8"?>' + xmlBuilder.build(tccMessage.soapMessage(tccMessage.AuthenticateUserLoginMessage(this._username, this._password)));
  const { response } = await soapRequest({
    url: URL,
    headers: HEADER,
    xml: message,
    timeout: this.timeout,
    withCredentials: true
  });
  if (response.statusCode === 200) {
    const parsedResponse = xmlParser.parse(response.body);
    const AuthenticateUserLoginResponse = parsedResponse["soap:Envelope"]["soap:Body"].AuthenticateUserLoginResponse;
    if (AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result === "Success") {
      return AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID;
    } else {
      throw new Error(AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result);
    }
  } else {
    throw new Error("Login Response Status Code " + response.statusCode);
  }
};

// private interface to retrieve status of a thermostat update

tcc.prototype._GetCommTaskState = async function(CommTaskID) {
  HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetCommTaskState';
  const message = '<?xml version="1.0" encoding="utf-8"?>' + xmlBuilder.build(tccMessage.soapMessage(tccMessage.GetCommTaskStateMessage(this.sessionID, CommTaskID)));
  const { response } = await soapRequest({
    url: URL,
    headers: HEADER,
    xml: message,
    timeout: this.timeout,
    withCredentials: true
  });
  if (response.statusCode === 200) {
    const parsedResponse = xmlParser.parse(response.body);
    const GetCommTaskStateResponse = parsedResponse["soap:Envelope"]["soap:Body"].GetCommTaskStateResponse;
    if (GetCommTaskStateResponse.GetCommTaskStateResult.Result === "Success") {
      this.logDebug("GetCommTaskState Success %s", GetCommTaskStateResponse.GetCommTaskStateResult);
      return;
    } else {
      this.logDebug("ERROR: GetCommTaskState Failed %s", GetCommTaskStateResponse.GetCommTaskStateResult, message);
      throw new Error("ERROR: GetCommTaskState Failed " + GetCommTaskStateResponse.GetCommTaskStateResult.Result);
    }
  } else {
    this.logDebug("ERROR: GetCommTaskState Response Status Code", response.statusCode, message);
    throw new Error("ERROR: GetCommTaskState Response Status Code " + response.statusCode);
  }
};

// private interface to retrieve thermostat settings

tcc.prototype._GetThermostat = async function(ThermostatID) {
  HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetThermostat';
  const message = '<?xml version="1.0" encoding="utf-8"?>' + xmlBuilder.build(tccMessage.soapMessage(tccMessage.GetThermostatMessage(this.sessionID, ThermostatID)));
  const { response } = await soapRequest({
    url: URL,
    headers: HEADER,
    xml: message,
    timeout: this.timeout,
    withCredentials: true
  });
  if (response.statusCode === 200) {
    const parsedResponse = xmlParser.parse(response.body);
    const GetThermostatResult = parsedResponse["soap:Envelope"]["soap:Body"].GetThermostatResponse.GetThermostatResult;
    if (GetThermostatResult.Result === "Success") {
      const thermostatData = tccMessage.toHb(GetThermostatResult.Thermostat);
      // Preserve LastPhysicalHeatMode if not set in current update
      const idString = ThermostatID.toString();
      if (this.thermostats && this.thermostats.hb && this.thermostats.hb[idString]) {
        if (thermostatData.LastPhysicalHeatMode === undefined && this.thermostats.hb[idString].LastPhysicalHeatMode !== undefined) {
          thermostatData.LastPhysicalHeatMode = this.thermostats.hb[idString].LastPhysicalHeatMode;
          this.logDebug("Preserved LastPhysicalHeatMode=%s for thermostat %s", thermostatData.LastPhysicalHeatMode, idString);
        }
      }
      this.thermostats.hb[idString] = thermostatData;
      return thermostatData;
    } else {
      this.logDebug("ERROR: GetThermostat Failed %s", GetThermostatResult.Result, message);
      throw new Error("ERROR: GetThermostat Failed " + GetThermostatResult.Result);
    }
  } else {
    this.logDebug("ERROR: GetThermostat Response Status Code", response.statusCode, message);
    throw new Error("ERROR: GetThermostat Response Status Code " + response.statusCode);
  }
};

// private interface to retrieve all thermostat settings

tcc.prototype._GetLocationListData = async function(withRetry) {
  try {
    if (!this.sessionID) {
      this.sessionID = await this._login();
    }
    HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetLocations';
    const message = '<?xml version="1.0" encoding="utf-8"?>' + xmlBuilder.build(tccMessage.soapMessage(tccMessage.GetLocationsMessage(this.sessionID)));
    const { response } = await soapRequest({
      url: URL,
      headers: HEADER,
      xml: message,
      timeout: this.timeout,
      withCredentials: true
    });
    if (response.statusCode === 200) {
      const parsedResponse = xmlParser.parse(response.body);
      const GetLocationsResult = parsedResponse["soap:Envelope"]["soap:Body"].GetLocationsResponse.GetLocationsResult;

      if (GetLocationsResult.Result === "Success" && GetLocationsResult.Locations && GetLocationsResult.Locations.LocationInfo) {
        return tccMessage.normalizeToHb(GetLocationsResult.Locations);
      } else {
        this.sessionID = null;
        if (withRetry) {
          try {
            return await this._GetLocationListData(false);
          } catch (err) {
            this.logDebug("error get locations retry", err);
            throw err;
          }
        } else {
          this.logDebug("GetLocations error, Info:  %s", GetLocationsResult.Result);
          throw new Error("GetLocations " + GetLocationsResult.Result);
        }
      }
    } else {
      this.logDebug("GetLocations error, statusCode: %s", response.statusCode);
      throw new Error("ERROR: GetLocations Response Status Code " + response.statusCode);
    }
  } catch (err) {
    this.logError('GetLocations Error: %s', err.message || err);
    this.sessionID = null;
    throw err;
  }
};
