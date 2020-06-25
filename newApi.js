var request = require('request');

var URL = "https://mytotalconnectcomfort.com/WebApi/api/session";

var body;

body = {
  "Username": "seangracey@yahoo.ca",
  "Password": "67Thermostat",
  "ClientApplicationId": "a0c7a795-ff44-4bcd-9a99-420fac57ff04"
};

body = {
  "Username": "seangracey@yahoo.ca",
  "Password": "67Thermostat",
  "ClientApplicationId": "357568d9-38ff-4fda-bfe2-46b0fa1dd864"
};

body = {
  "username": "seangracey@yahoo.ca",
  "Password": "67Thermostat",
  "ApplicationId": "91db1612-73fd-4500-91b2-e63b069b185c"
};

request({
  method: 'POST',
  url: URL,
  headers: {
    'Content-Type': 'Application/json'
  },
  body: JSON.stringify(body)
}, function(err, response) {
  // Response s/b 200 OK

  console.log(err, response.statusCode, response.statusMessage, response.body);
});
