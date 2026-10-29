/* Ejecuta todas las pruebas en dos zonas horarias: UTC (la de los servidores y la CI) y America/Bogota (la de los
   navegadores de los usuarios). Así un cálculo de fechas que dependa de la zona horaria falla en las pruebas y no en
   producción. Uso: `node tests/ejecutar-pruebas.cjs` (lo llama `npm test`). Funciona igual en Windows y en Linux. */
const { spawnSync } = require('child_process');
const path = require('path');

const ZONAS = ['UTC', 'America/Bogota'];
const PRUEBAS = ['reglas.test.cjs', 'planes.test.cjs', 'excel-control.test.cjs', 'dependencias.test.cjs'];

let fallas = 0;
for (const TZ of ZONAS) {
  console.log(`\n== Zona horaria ${TZ} ==`);
  for (const p of PRUEBAS) {
    const r = spawnSync(process.execPath, [path.join(__dirname, p)], {
      env: { ...process.env, TZ },
      stdio: 'inherit'
    });
    if (r.status !== 0) {
      fallas++;
      console.error(`FALLA: ${p} con TZ=${TZ}`);
    }
  }
}
if (fallas) {
  console.error(`\n${fallas} prueba(s) fallaron.`);
  process.exit(1);
}
console.log(`\nTodas las pruebas pasaron en ${ZONAS.join(' y ')}.`);
