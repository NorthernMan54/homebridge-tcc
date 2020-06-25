#curl -X POST https://mytotalconnectcomfort.com/WebApi/api/session --header "Content-Type:Application/json"  --data "{ \"username\": \"seangracey@yahoo.ca\", \"password\": \"67Thermostat\", \"ClientApplicationId\": \"a0c7a795-ff44-4bcd-9a99-420fac57ff04\" }"

echo
echo "V2"

curl -X POST https://mytotalconnectcomfort.com/WebApi/api/session --header "Content-Type:Application/json"  --data @params.json

echo
echo "V2"

curl -s -k -X 'POST' -H 'Content-Type: application/x-www-form-urlencoded' -H 'User-Agent: Apache-HttpClient/UNAVAILABLE (java 1.4)' --data-binary $'ApplicationID=a0c7a795-ff44-4bcd-9a99-420fac57ff04&ApplicationVersion=2&Username=seangracey@yahoo.ca&UiLanguage=English&Password=67Thermostat' 'https://tccna.honeywell.com/ws/MobileV2.asmx/AuthenticateUserLogin'
