for (var temp = 0; temp <= 31; temp += 0.5) {
  console.log("celcius %s = %s = %s", temp, toFahrenheit(temp), toCelcius(toFahrenheit(temp)));
}

function toFahrenheit(celcius) {
  return ((celcius * 9 / 5) + 32).toFixed(0);
}

function toCelcius(Fahrenheit) {
  return round5((Fahrenheit - 32) * 5 / 9);
}

function round5(x) {
  return (Math.round(x * 2) / 2).toFixed(1);
}
