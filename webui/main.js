import { getService, initializeClient } from "./helper.js";
async function main() {
    await initializeClient('webUI');
    getData();
    setInterval(getData, 1000);
}
async function getData() {
    const data = await getService('getConfigs', 'tonpleun', []);
    console.log('data update')
    window.tonpleunData = data;
    update(window.tonpleunData);

}
function update(data) {
    window.dataMap = new Map(Object.entries(data));
    document.getElementById('buttonList').innerHTML = '';
    window.dataMap.forEach((dinges, name) => {
        console.log(name, dinges);
        document.getElementById('buttonList').innerHTML += '<button onclick="onchangeOfthing(\'' + name + '\')">' + name + '</button>';
    });
}
main();