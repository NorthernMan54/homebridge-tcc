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
queue.on('active', () => {
  debug(`Queue: Working on item #${++count}.  Size: ${queue.size}  Pending: ${queue.pending}`);
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
  debug("Setting up TCC component");
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
        debug("TCC - Login Succeeded");
      }
      var current = await this._GetLocationListData(true);
      if (this.thermostats.LocationInfo && current.LocationInfo) {
        debug("pollThermostat - delta", JSON.stringify(tccMessage.diff(this.thermostats, current), null, 2));
      }
      // Validate all thermostats before storing
      if (current.hb) {
        for (const id in current.hb) {
          try {
            tccMessage.validateThermostatData(current.hb[id], `pollThermostat ID:${id}`);
          } catch (err) {
            console.error(`Validation failed for thermostat ${id}:`, err.message);
          }
        }
      }
      this.thermostats = current;
      return (current);
    } catch (err) {
      console.error("pollThermostat Error:", err.message);
      debug("pollThermostat", err);
      throw err;
    }
  });
};

// Public interface to login and update specific thermostat settings

tcc.prototype.ChangeThermostat = function(desiredState) {
  // debug("ChangeThermostat()", desiredState);
  return queue.add(async () => {
    let updateSucceeded = false;
    let commTaskSucceeded = false;

    try {
      if (!this.sessionID) {
        this.sessionID = await this._login();
        debug("TCC - Login Succeeded");
        this.thermostats = await this._GetLocationListData(true);
      }

      var CommTaskID = await this._UpdateThermostat(desiredState, true);
      updateSucceeded = true; // Update was sent successfully
      debug("TCC - Update thermostat succeeded, CommTaskID:", CommTaskID);

      await this._GetCommTaskState(CommTaskID);
      commTaskSucceeded = true; // Server confirmed the change
      debug("TCC - CommTask confirmed");

      var thermostat = await this._GetThermostat(desiredState.ThermostatID);
      debug("TCC - Retrieved updated thermostat data");
      tccMessage.validateThermostatData(thermostat, 'ChangeThermostat result');
      return (thermostat);
    } catch (err) {
      console.error("ChangeThermostat Error:", err.message);

      // If update succeeded but we just failed to get fresh data back
      if (updateSucceeded && commTaskSucceeded) {
        debug("Update succeeded but failed to retrieve fresh data, using optimistic update");
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
          debug("Returning optimistic data, will refresh on next poll");
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
        debug("TCC - Login Succeeded");
      }
      const thermostat = await this._GetThermostat(ThermostatID);
      tccMessage.validateThermostatData(thermostat, `getThermostatSnapshot ID:${ThermostatID}`);
      return thermostat;
    } catch (err) {
      console.error("getThermostatSnapshot Error:", err.message);
      this.sessionID = null;
      throw err;
    }
  });
};

// private interface to update thermostat settings

tcc.prototype._UpdateThermostat = function(desiredState, withRetry) {
  debug("_UpdateThermostat()", desiredState);
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        if (!this.sessionID) {
          this.sessionID = await this._login();
        }
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/ChangeThermostatUI';
        const message = '<?xml version="1.0" encoding="utf-8"?>' + xmlBuilder.build(tccMessage.soapMessage(tccMessage.ChangeThermostatMessage(this.sessionID, desiredState, this.thermostats.hb[desiredState.ThermostatID], this.usePermanentHolds)));
        debug("_UpdateThermostat: SOAP Message", message, this.sessionID, desiredState, this.thermostats.hb[desiredState.ThermostatID], this.usePermanentHolds);
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
          // debug("_UpdateThermostat", ChangeThermostat);
          if (ChangeThermostat.Result === "Success") {
            debug("Success: _UpdateThermostat %s", ChangeThermostat, message);
            resolve(ChangeThermostat.CommTaskID);
          } else {
            this.sessionID = null;
            debug("ERROR: _UpdateThermostat %s", ChangeThermostat.Result, message);
            if (withRetry) {
              try {
                const CommTaskID = await this._UpdateThermostat(desiredState, false);
                resolve(CommTaskID);
              } catch (err) {
                debug("ERROR: _UpdateThermostat retry");
                reject(err);
              }
            } else {
              reject(new Error("ERROR: _UpdateThermostat (200) " + ChangeThermostat.Result));
            }
          }
        } else {
          debug("ERROR: _UpdateThermostat %s", response, message);
          reject(new Error("ERROR: _UpdateThermostat (!200)"));
        }
      } catch (err) {
        debug("_UpdateThermostat message", xmlBuilder.build(tccMessage.soapMessage(tccMessage.ChangeThermostatMessage(this.sessionID, desiredState, this.thermostats.hb[desiredState.ThermostatID], this.usePermanentHolds))));
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
      debug("GetCommTaskState Success %s", GetCommTaskStateResponse.GetCommTaskStateResult);
      return;
    } else {
      debug("ERROR: GetCommTaskState Failed %s", GetCommTaskStateResponse.GetCommTaskStateResult, message);
      throw new Error("ERROR: GetCommTaskState Failed " + GetCommTaskStateResponse.GetCommTaskStateResult.Result);
    }
  } else {
    debug("ERROR: GetCommTaskState Response Status Code", response.statusCode, message);
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
      this.thermostats.hb[ThermostatID.toString()] = tccMessage.toHb(GetThermostatResult.Thermostat);
      return tccMessage.toHb(GetThermostatResult.Thermostat);
    } else {
      debug("ERROR: GetThermostat Failed %s", GetThermostatResult.Result, message);
      throw new Error("ERROR: GetThermostat Failed " + GetThermostatResult.Result);
    }
  } else {
    debug("ERROR: GetThermostat Response Status Code", response.statusCode, message);
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
            debug("error get locations retry", err);
            throw err;
          }
        } else {
          debug("GetLocations error, Info:  %s", GetLocationsResult.Result);
          throw new Error("GetLocations " + GetLocationsResult.Result);
        }
      }
    } else {
      debug("GetLocations error, statusCode: %s", response.statusCode);
      throw new Error("ERROR: GetLocations Response Status Code " + response.statusCode);
    }
  } catch (err) {
    console.error("GetLocations Error:", err);
    this.sessionID = null;
    throw err;
  }
};
