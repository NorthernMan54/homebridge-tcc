const soapRequest = require('easy-soap-request');
const parser = require('xml2json');
var tccMessage = require('./tccMessage.js');
var debug = require('debug')('tcc-lib');
const {
  default: PQueue
} = require('p-queue');
const queue = new PQueue({
  concurrency: 1
});

let count = 0;
queue.on('active', () => {
  debug(`Queue: Working on item #${++count}.  Size: ${queue.size}  Pending: ${queue.pending}`);
});
// var thermostats = {};

const URL = 'https://tccna.honeywell.com/ws/MobileV2.asmx';

var HEADER = {
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

function tcc(options, callback) {
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
      this.thermostats = current;
      return (current);
    } catch (err) {
      // console.error("pollThermostat Error:", err.message);
      // debug("pollThermostat", err);
      throw new Error(err);
    }
  });
};

// Public interface to login and update specific thermostat settings

tcc.prototype.ChangeThermostat = function(desiredState) {
  // debug("ChangeThermostat()", desiredState);
  return queue.add(async () => {
    try {
      if (!this.sessionID) {
        this.sessionID = await this._login();
        debug("TCC - Login Succeeded");
        this.thermostats = await this._GetLocationListData(true);
      }
      var CommTaskID = await this._UpdateThermostat(desiredState, true);
      await this._GetCommTaskState(CommTaskID);
      var thermostat = await this._GetThermostat(desiredState.ThermostatID);
      return (thermostat);
    } catch (err) {
      console.error("ChangeThermostat Error:", err);
      this.sessionID = null;
      throw new Error(err);
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
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(tccMessage.soapMessage(tccMessage.ChangeThermostatMessage(this.sessionID, desiredState, this.thermostats.hb[desiredState.ThermostatID], this.usePermanentHolds)));
        debug("_UpdateThermostat: SOAP Message", message, this.sessionID, desiredState, this.thermostats.hb[desiredState.ThermostatID], this.usePermanentHolds);
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        if (response.statusCode === 200) {
          var ChangeThermostat = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].ChangeThermostatUIResponse.ChangeThermostatUIResult;
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
              reject(new Error("ERROR: _UpdateThermostat (200)", ChangeThermostat.Result));
            }
          }
        } else {
          debug("ERROR: _UpdateThermostat %s", response, message);
          reject(new Error("ERROR: _UpdateThermostat (!200)", ChangeThermostat.Result));
        }
      } catch (err) {
        // console.error("_UpdateThermostat Error:", err);
        debug("_UpdateThermostat message", parser.toXml(tccMessage.soapMessage(tccMessage.ChangeThermostatMessage(this.sessionID, desiredState, this.thermostats.hb[desiredState.ThermostatID], this.usePermanentHolds))));
        reject(err);
        this.sessionID = null;
      }
    })();
  });
};

// private interface to login to TCC

tcc.prototype._login = function() {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/AuthenticateUserLogin';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(tccMessage.soapMessage(tccMessage.AuthenticateUserLoginMessage(this._username, this._password)), {
          sanitize: true
        });
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        if (response.statusCode === 200) {
          var AuthenticateUserLoginResponse = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].AuthenticateUserLoginResponse;
          if (AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result === "Success") {
            resolve(AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID);
          } else {
            // debug("ERROR: Login Failed %s", AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result, message);
            reject(new Error(AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result));
          }
        } else {
          // debug("ERROR: Login Response Status Code", response.statusCode, message);
          reject(new Error("Login Response Status Code", response.statusCode));
        }
      } catch (err) {
        // console.error("login Error:", err.message);
        reject(err);
      }
    })();
  });
};

// private interface to retrieve status of a thermostat update

tcc.prototype._GetCommTaskState = function(CommTaskID) {
  // SOAPAction http://services.alarmnet.com/Services/MobileV2/GetCommTaskState
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetCommTaskState';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(tccMessage.soapMessage(tccMessage.GetCommTaskStateMessage(this.sessionID, CommTaskID)));
        // debug("_GetCommTaskState", message);
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        // debug("_GetCommTaskState", response.statusCode, response.body);
        if (response.statusCode === 200) {
          var GetCommTaskStateResponse = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].GetCommTaskStateResponse;
          if (GetCommTaskStateResponse.GetCommTaskStateResult.Result === "Success") {
            debug("GetCommTaskState Success %s", GetCommTaskStateResponse.GetCommTaskStateResult);
            resolve();
          } else {
            debug("ERROR: GetCommTaskState Failed %s", GetCommTaskStateResponse.GetCommTaskStateResult, message);
            reject(new Error("ERROR: GetCommTaskState Failed" + GetCommTaskStateResponse.GetCommTaskStateResult.Result));
          }
        } else {
          debug("ERROR: GetCommTaskState Response Status Code", response.statusCode, message);
          reject(new Error("ERROR: GetCommTaskState Response Status Code", response.statusCode));
        }
      } catch (err) {
        // console.error("login Error:", err.message);
        reject(err);
      }
    })();
  });
};

// private interface to retrieve thermostat settings

tcc.prototype._GetThermostat = function(ThermostatID) {
  // SOAPAction http://services.alarmnet.com/Services/MobileV2/GetThermostat
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetThermostat';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(tccMessage.soapMessage(tccMessage.GetThermostatMessage(this.sessionID, ThermostatID)));
        // debug("_GetThermostat", message);
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        // debug("_GetThermostat", response.statusCode, response.body);
        if (response.statusCode === 200) {
          var GetThermostatResult = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].GetThermostatResponse.GetThermostatResult;
          // debug("GetThermostatResult", GetThermostatResult);
          if (GetThermostatResult.Result === "Success") {
            // debug("_GetThermostat - delta", JSON.stringify(diff(GetThermostatResult.Thermostat, this.thermostats.hb[ThermostatID.toString()]), null, 2));
            this.thermostats.hb[ThermostatID.toString()] = tccMessage.toHb(GetThermostatResult.Thermostat);
            // debug("_GetThermostat Temp %s Switch %s", toHb(GetThermostatResult.Thermostat).TargetTemperature, toHb(GetThermostatResult.Thermostat).TargetHeatingCoolingState);
            resolve(tccMessage.toHb(GetThermostatResult.Thermostat));
          } else {
            debug("ERROR: GetThermostat Failed %s", GetThermostatResult.Result, message);
            reject(new Error("ERROR: GetThermostat Failed" + GetThermostatResult.Result));
          }
        } else {
          debug("ERROR: GetThermostat Response Status Code", response.statusCode, message);
          reject(new Error("ERROR: GetThermostat Response Status Code", response.statusCode));
        }
      } catch (err) {
        // console.error("login Error:", err.message);
        reject(err);
      }
    })();
  });
};

// private interface to retrieve all thermostat settings

tcc.prototype._GetLocationListData = function(withRetry) {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        if (!this.sessionID) {
          this.sessionID = await this._login();
        }
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetLocations';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(tccMessage.soapMessage(tccMessage.GetLocationsMessage(this.sessionID)));
        // debug("SOAP Message", parser.toXml(soapMessage(GetLocations)));
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        if (response.statusCode === 200) {
          var GetLocationsResult = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].GetLocationsResponse.GetLocationsResult;

          if (GetLocationsResult.Result === "Success" && GetLocationsResult.Locations.LocationInfo) {
            // this.sessionID = AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID;
            // debug("_GetLocationListData", JSON.stringify(GetLocationsResult, null, 2));
            // debug("_GetLocationListData-2", GetLocationsResult.Locations.LocationInfo);
            resolve(tccMessage.normalizeToHb(GetLocationsResult.Locations));
          } else {
            this.sessionID = null;
            if (withRetry) {
              try {
                const locListData = await this._GetLocationListData(false);
                resolve(locListData);
              } catch (err) {
                debug("error get locations retry", err);
                reject(err);
              }
            } else {
              debug("GetLocations error, Info:  %s", GetLocationsResult.Result);
              reject(new Error("GetLocations " + GetLocationsResult.Result));
            }
          }
        } else {
          debug("GetLocations error, statusCode: %s", response.statusCode);
          reject(new Error("ERROR: GetLocations Response Status Code", response.statusCode));
        }
      } catch (err) {
        console.error("GetLocations Error:", err);
        this.sessionID = null;
        reject(err);
      }
    })();
  });
};
